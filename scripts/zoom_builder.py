import os
import sys
import json
import random
import logging
import subprocess
import urllib.request
import urllib.error
from aubio import onset, source

# --- Logging setup ---
LOG_DIR = "/home/node/.n8n-files/logs"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "zoom_builder.log")

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("zoom_builder")


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
    cmd = f'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "{file_path}"'
    result = run_cmd(cmd, f"ffprobe duration check on {file_path}")
    try:
        return float(result.stdout.strip())
    except ValueError:
        logger.error(f"ffprobe returned non-numeric output for {file_path}: {result.stdout!r}")
        raise RuntimeError(f"Could not read duration for {file_path} (invalid/corrupt file?)")


def download_file(url, output_path):
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


def detect_audio_peaks(audio_path, min_sec=2.0, max_sec=3.0):
    logger.debug(f"Detecting onset peaks in {audio_path} (min_sec={min_sec}, max_sec={max_sec})")
    win_s = 512
    hop_s = win_s // 2

    try:
        s = source(audio_path, 0, hop_s)
        samplerate = s.samplerate
        o = onset("default", win_s, hop_s, samplerate)
        o.set_threshold(0.3)

        peaks = []
        while True:
            samples, read = s()
            if o(samples):
                peaks.append(o.get_last_s())
            if read < hop_s:
                break
    except Exception as e:
        logger.error(f"aubio onset detection failed on {audio_path}: {e}")
        raise RuntimeError(f"Audio peak detection failed: {e}")

    logger.debug(f"Detected {len(peaks)} raw onset peaks")

    duration = get_media_duration(audio_path)
    perfect_cuts = [0.0]
    last_cut = 0.0

    for peak in peaks:
        time_diff = peak - last_cut
        if time_diff >= min_sec:
            if time_diff > max_sec:
                while (peak - last_cut) > max_sec:
                    last_cut += random.uniform(min_sec, max_sec)
                    perfect_cuts.append(last_cut)
            perfect_cuts.append(peak)
            last_cut = peak

    if duration - last_cut > min_sec:
        perfect_cuts.append(duration)
    else:
        perfect_cuts[-1] = duration

    logger.debug(f"Computed {len(perfect_cuts) - 1} final cuts: {perfect_cuts}")
    return perfect_cuts


def main():
    # --- PATH CONFIGURATION ---
    work_dir = "/home/node/.n8n-files"
    temp_dir = os.path.join(work_dir, "zoom_temp")
    os.makedirs(temp_dir, exist_ok=True)

    output_path = os.path.join(work_dir, "resultado_dinamico_tiktok.mp4")
    local_video_path = os.path.join(temp_dir, "input_video.mp4")
    extracted_audio_path = os.path.join(temp_dir, "extracted_audio.wav")

    try:
        input_data = json.loads(sys.argv[1])
        video_input = input_data["video_url"]
    except Exception as e:
        logger.error(f"Missing arguments: {e}")
        print(json.dumps({"error": f"Missing arguments: {str(e)}"}))
        sys.exit(1)

    logger.info(f"Starting run: video_input={video_input}")

    # 1. Handle incoming Video
    if video_input.startswith("http"):
        logger.info("Downloading input video...")
        download_file(video_input, local_video_path)
    else:
        local_video_path = video_input
        if not os.path.exists(local_video_path):
            logger.error(f"Local video path does not exist: {local_video_path}")
            raise RuntimeError(f"Local video file not found: {local_video_path}")

    # 2. Extract Audio stream
    logger.info("Extracting audio stream for analysis...")
    cmd_extract = f'ffmpeg -y -i "{local_video_path}" -vn -acodec pcm_s16le -ar 44100 -ac 1 "{extracted_audio_path}"'
    run_cmd(cmd_extract, "ffmpeg audio extraction")

    # 3. Detect peaks using 2.0s - 3.0s bounds
    cuts = detect_audio_peaks(extracted_audio_path, min_sec=2.0, max_sec=3.0)
    if len(cuts) < 2:
        logger.error(f"Not enough cuts detected to build a video: {cuts}")
        raise RuntimeError("Audio peak detection produced fewer than 2 cut points")

    # 4. Build filter complex with 1x - 2x Zooms
    filter_complex = ""
    inputs_concat = ""

    for i in range(len(cuts) - 1):
        start = cuts[i]
        end = cuts[i+1]
        zoom_factor = round(random.uniform(1.0, 2.0), 2)

        filter_complex += (
            f"[0:v]trim=start={start}:end={end},setpts=PTS-STARTPTS,"
            f"crop=w=iw/{zoom_factor}:h=ih/{zoom_factor}:x=(iw-ow)/2:y=(ih-oh)/2,"
            f"scale=1080:1920,setsar=1[v{i}];"
        )
        inputs_concat += f"[v{i}]"

    filter_complex += f"{inputs_concat}concat=n={len(cuts)-1}:v=1:a=0[v_final]"

    # 5. Render final video
    logger.info(f"Rendering dynamic jump-cuts ({len(cuts) - 1} segments)...")
    cmd_final = f'ffmpeg -y -i "{local_video_path}" -i "{extracted_audio_path}" -filter_complex "{filter_complex}" -map "[v_final]" -map 1:a -c:v libx264 -pix_fmt yuv420p -c:a aac "{output_path}"'
    run_cmd(cmd_final, "ffmpeg final render")

    if not os.path.exists(output_path):
        logger.error(f"ffmpeg reported success but output file is missing: {output_path}")
        raise RuntimeError("Final render did not produce an output file")

    # 6. Cleanup
    if os.path.exists(extracted_audio_path):
        os.remove(extracted_audio_path)
    if video_input.startswith("http") and os.path.exists(local_video_path):
        os.remove(local_video_path)
    os.rmdir(temp_dir)

    logger.info("Run completed successfully")

    # 7. Success Response
    print(json.dumps({
        "status": "success",
        "output_path": output_path,
        "total_cuts_made": len(cuts) - 1,
        "zoom_cuts_timestamps": [round(x, 2) for x in cuts]
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.exception("zoom_builder failed with an unhandled error")
        print(json.dumps({"error": str(e), "log_file": LOG_FILE}))
        sys.exit(1)
