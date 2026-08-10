import os
import sys
import json
import logging
import subprocess
import urllib.request
import urllib.error

# --- Logging setup ---
LOG_DIR = "/home/node/.n8n-files/logs"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "video_builder.log")

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("video_builder")


def run_cmd(cmd, description):
    """Runs a shell command, logging it and raising with full stderr on failure."""
    logger.debug(f"Running {description}: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error(f"{description} failed (exit code {result.returncode})")
        logger.error(f"Command: {cmd}")
        logger.error(f"stdout: {result.stdout.strip()}")
        logger.error(f"stderr: {result.stderr.strip()}")
        raise RuntimeError(f"{description} failed: {result.stderr.strip()[:500]}")
    return result


def get_media_duration(file_path):
    """Retrieves the exact duration of a media file using ffprobe."""
    cmd = f'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "{file_path}"'
    result = run_cmd(cmd, f"ffprobe duration check on {file_path}")
    try:
        return float(result.stdout.strip())
    except ValueError:
        logger.error(f"ffprobe returned non-numeric output for {file_path}: {result.stdout!r}")
        raise RuntimeError(f"Could not read duration for {file_path} (invalid/corrupt file?)")


def download_file(url, output_path):
    """Downloads a file bypassing 403 Forbidden errors by mimicking a browser."""
    logger.debug(f"Downloading {url} -> {output_path}")
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response, open(output_path, 'wb') as out_file:
            out_file.write(response.read())
    except urllib.error.HTTPError as e:
        logger.error(f"HTTP error {e.code} downloading {url}: {e.reason}")
        raise RuntimeError(f"Failed to download {url}: HTTP {e.code} {e.reason}")
    except urllib.error.URLError as e:
        logger.error(f"URL error downloading {url}: {e.reason}")
        raise RuntimeError(f"Failed to download {url}: {e.reason}")
    logger.debug(f"Downloaded {url} successfully ({os.path.getsize(output_path)} bytes)")


def main():
    # 1. Path Configuration inside the n8n environment
    work_dir = "/home/node/.n8n-files"
    temp_dir = os.path.join(work_dir, "temp_clips")
    os.makedirs(temp_dir, exist_ok=True)

    # Receive and parse the JSON payload sent by n8n via the command line
    try:
        input_data = json.loads(sys.argv[1])
        audio_url = input_data["audio_url"]
        clips_urls = input_data["clips_urls"]
    except Exception as e:
        logger.error(f"Invalid or missing input data: {e}")
        print(json.dumps({"error": f"Invalid or missing input data: {str(e)}"}))
        sys.exit(1)

    logger.info(f"Starting run: audio_url={audio_url}, clips={len(clips_urls)}")

    # 2. Download the background/base audio file securely
    audio_path = os.path.join(work_dir, "audio_base.mp3")
    logger.info("Downloading base audio...")
    download_file(audio_url, audio_path)

    # 3. Download the original video clips securely
    input_clips = []
    for i, url in enumerate(clips_urls):
        clip_path = os.path.join(temp_dir, f"raw_clip_{i}.mp4")
        logger.info(f"Downloading original clip {i}...")
        download_file(url, clip_path)
        input_clips.append(clip_path)

    # 4. Validate and calculate target duration for videos
    audio_duration = get_media_duration(audio_path)
    target_video_duration = audio_duration * 1.3
    logger.info(f"Audio duration: {audio_duration:.2f}s, target video duration: {target_video_duration:.2f}s")

    # 5. Cyclic duplication logic if clips don't cover the 1.3x buffer requirement
    final_clips = list(input_clips)
    duplication_index = 0
    while True:
        total_video_duration = sum(get_media_duration(c) for c in final_clips)
        if total_video_duration >= target_video_duration:
            break
        # If more material is needed, append the next available video from the original list
        final_clips.append(input_clips[duplication_index % len(input_clips)])
        duplication_index += 1
        logger.debug(f"Not enough footage yet ({total_video_duration:.2f}s), duplicated a clip. Total clips now: {len(final_clips)}")

    # Recalculate the actual cumulative duration of the final video list
    total_video_duration = sum(get_media_duration(c) for c in final_clips)
    logger.info(f"Final clip count: {len(final_clips)}, total duration: {total_video_duration:.2f}s")

    # 6. Calculate the exact proportional trimming factor
    trim_factor = audio_duration / total_video_duration

    # 7. Process each video (Apply "stripping" to keep the exact center)
    filter_concat = ""
    ffmpeg_inputs = ""

    for i, clip in enumerate(final_clips):
        original_duration = get_media_duration(clip)

        # Precise duration this clip must contribute to the final assembly
        trimmed_duration = original_duration * trim_factor

        # Stripping Logic: Calculate the start time to trim off the edges equally
        surplus_time = original_duration - trimmed_duration
        start_time = surplus_time / 2  # Trims equal amounts from the start and end

        output_trim = os.path.join(temp_dir, f"trim_clip_{i}.mp4")

        # FFmpeg command to crop the center, scale safely, and strip original audio (-an)
        cmd_trim = f'ffmpeg -y -ss {start_time} -t {trimmed_duration} -i "{clip}" -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -pix_fmt yuv420p -an "{output_trim}"'
        run_cmd(cmd_trim, f"ffmpeg trim of clip {i} ({clip})")

        # Map input files and build the concatenation filter sequence
        ffmpeg_inputs += f'-i "{output_trim}" '
        filter_concat += f"[{i}:v]"

    # 8. Procedurally concatenate all trimmed videos and overlay the base audio
    output_path = os.path.join(work_dir, "resultado_tiktok.mp4")
    filter_concat += f"concat=n={len(final_clips)}:v=1:a=0[v]"

    cmd_final = f'ffmpeg -y {ffmpeg_inputs} -i "{audio_path}" -filter_complex "{filter_concat}" -map "[v]" -map {len(final_clips)}:a -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "{output_path}"'
    logger.info("Rendering final concatenated video...")
    run_cmd(cmd_final, "ffmpeg final concat/render")

    if not os.path.exists(output_path):
        logger.error(f"ffmpeg reported success but output file is missing: {output_path}")
        raise RuntimeError("Final render did not produce an output file")

    # 9. Absolute cleanup of temporary files inside the VPS container
    for file in os.listdir(temp_dir):
        os.remove(os.path.join(temp_dir, file))
    os.rmdir(temp_dir)

    logger.info("Run completed successfully")

    # 10. Output a clean JSON string back to n8n
    print(json.dumps({
        "status": "success",
        "output_path": output_path,
        "audio_duration": round(audio_duration, 2),
        "total_clips_used": len(final_clips),
        "original_clips_sent": len(input_clips)
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.exception("video_builder failed with an unhandled error")
        print(json.dumps({"error": str(e), "log_file": LOG_FILE}))
        sys.exit(1)
