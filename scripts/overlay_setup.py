#!/usr/bin/env python3
"""
overlay_setup.py — integra un componente Remotion generado por IA en cacho_inmotion
y corre un render de prueba.

Input (sys.argv[1]) — JSON con:
{
  "compositionId": "ttchop-prod_q35yx6n",
  "fileName": "NombreOverlay.jsx",
  "accentColor": "#F5E0D9",
  "componentCode": "...jsx...",
  "rootCompositionSnippet": "<Composition id=... />",
  "baseVideoPath": "/media/base_video.mp4",
  "productImages": ["/media/img1.webp", "/media/img3.webp"]
}
"""

import os
import re
import sys
import json
import shutil
import logging
import subprocess

PROJECT = "/root/cacho_inmotion"
LOG_DIR = "/home/node/.n8n-files/logs"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "overlay_setup.log")

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler(sys.stderr)],
)
logger = logging.getLogger("overlay_setup")


def run(cmd, desc="", cwd=None):
    logger.debug(f"[cmd] {desc}: {cmd[:300]}")
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
    if r.returncode != 0:
        logger.error(f"FAILED {desc}\nSTDOUT: {r.stdout[-1000:]}\nSTDERR: {r.stderr[-1000:]}")
        raise RuntimeError(f"{desc} failed:\n{r.stderr[-800:]}")
    return r


def next_carousel_n():
    public = os.path.join(PROJECT, "public")
    os.makedirs(public, exist_ok=True)
    existing = [
        d for d in os.listdir(public)
        if re.match(r"^carousel\d+$", d) and os.path.isdir(os.path.join(public, d))
    ]
    if not existing:
        return 1
    numbers = [int(re.search(r"\d+", d).group()) for d in existing]
    return max(numbers) + 1


def parse_img_refs(component_code):
    """Extract all img('name.webp') references from the component code."""
    return list(dict.fromkeys(re.findall(r"img\(['\"]([^'\"]+\.webp)['\"]", component_code)))


def rewrite_img_helper(component_code, n):
    """Rewrite the img() helper to point to carousel{N}/, regardless of original path prefix."""
    new_helper = f"const img = (name) => staticFile(`carousel{n}/${{name}}`);"
    pattern = re.compile(r"const img\s*=\s*\(name\)\s*=>\s*staticFile\([^)]+\)\s*;?")
    result, count = pattern.subn(new_helper, component_code)
    if count == 0:
        logger.warning("img() helper pattern not found — skipping rewrite")
        return component_code
    return result


def rewrite_offthread_video(component_code, video_name):
    """Replace the staticFile path inside <OffthreadVideo src={staticFile('...')} />."""
    pattern = re.compile(
        r"(<OffthreadVideo\b[^>]*?\bsrc=\{staticFile\()['\"]([^'\"]*)['\"](\)[^>]*?/>)",
        re.DOTALL,
    )
    result, count = pattern.subn(
        lambda m: f"{m.group(1)}'{video_name}'{m.group(3)}", component_code
    )
    if count == 0:
        logger.warning("OffthreadVideo src pattern not found — skipping rewrite")
    return result


def extract_component_name(component_code):
    """Find the exported component name: export const SomeName = () => ..."""
    m = re.search(r"export const (\S+)\s*=\s*(?:\(\)|React\.FC|\()", component_code)
    if not m:
        raise RuntimeError("Could not find 'export const <Name>' in componentCode")
    return m.group(1)


def update_root_jsx(component_name, file_name, snippet):
    """Add import and Composition snippet to Root.jsx."""
    root_path = os.path.join(PROJECT, "src", "Root.jsx")
    with open(root_path, "r", encoding="utf-8") as f:
        content = f.read()

    base_name = os.path.splitext(file_name)[0]
    import_line = f"import {{ {component_name} }} from './{base_name}';"

    # Skip if already imported
    if import_line in content:
        logger.info(f"Import already exists in Root.jsx: {import_line}")
    else:
        # Insert after last import line
        last_import = list(re.finditer(r"^import .+;", content, re.MULTILINE))
        if not last_import:
            raise RuntimeError("No import statements found in Root.jsx")
        pos = last_import[-1].end()
        content = content[:pos] + "\n" + import_line + content[pos:]
        logger.info(f"Added import: {import_line}")

    # Skip if Composition already registered
    if snippet.strip() in content:
        logger.info("Composition already registered in Root.jsx")
    else:
        # Insert after last </Composition> or last <Composition ... />
        last_comp = list(re.finditer(r"<Composition\b[^>]*/\s*>", content, re.DOTALL))
        if not last_comp:
            raise RuntimeError("No existing <Composition> tags found in Root.jsx")
        pos = last_comp[-1].end()
        content = content[:pos] + "\n      " + snippet.strip() + content[pos:]
        logger.info("Added Composition to Root.jsx")

    with open(root_path, "w", encoding="utf-8") as f:
        f.write(content)


def check_fonts():
    r = subprocess.run("fc-list | grep -i noto", shell=True, capture_output=True, text=True)
    if not r.stdout.strip():
        logger.warning("⚠️  Noto CJK fonts NOT found — Japanese text and emojis will render invisible!")
        return False
    logger.info("Noto CJK fonts OK")
    return True


def check_react_version():
    pkg_path = os.path.join(PROJECT, "package.json")
    with open(pkg_path) as f:
        pkg = json.load(f)
    ver = pkg.get("dependencies", {}).get("react", "unknown")
    if "18.3" not in ver:
        logger.warning(f"⚠️  React version is '{ver}' — expected 18.3.1. React 19 causes stack overflow!")
        return False
    logger.info(f"React version OK: {ver}")
    return True


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: overlay_setup.py '<json>'"}))
        sys.exit(1)

    try:
        arg = sys.argv[1]
        if os.path.isfile(arg):
            with open(arg, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = json.loads(arg)
    except Exception as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    render_id         = data["renderId"]
    composition_id    = render_id.replace("_", "-")
    file_name         = f"Overlay{render_id}.jsx"
    component_code    = data["componentCode"]
    base_video_path   = data["baseVideoPath"]
    product_images    = data.get("productImages", [])

    # Rewrite the id inside rootCompositionSnippet to use our safe compositionId
    raw_snippet = data["rootCompositionSnippet"]
    snippet = re.sub(r'id=["\'][^"\']*["\']', f'id="{composition_id}"', raw_snippet, count=1)
    logger.info(f"compositionId: {composition_id}")
    logger.info(f"fileName: {file_name}")

    warnings = []

    # --- Step 1: carousel number ---
    n = next_carousel_n()
    logger.info(f"Using carousel{n}")

    # --- Step 2: parse referenced images ---
    img_refs = parse_img_refs(component_code)
    logger.info(f"Images referenced in component: {img_refs}")

    # Build filename -> path map from provided productImages
    image_map = {os.path.basename(p): p for p in product_images}

    # --- Step 3: create carousel dir and copy images ---
    carousel_dir = os.path.join(PROJECT, "public", f"carousel{n}")
    os.makedirs(carousel_dir, exist_ok=True)
    for ref in img_refs:
        src = image_map.get(ref)
        if not src:
            # Fallback: try /media/ directly
            src = os.path.join("/media", ref)
        if not os.path.exists(src):
            raise FileNotFoundError(f"Image not found: {ref} (tried: {src})")
        dst = os.path.join(carousel_dir, ref)
        shutil.copy2(src, dst)
        logger.info(f"Copied {src} → {dst}")

    # --- Step 4: rewrite img() helper ---
    component_code = rewrite_img_helper(component_code, n)

    # --- Step 5: copy video and rewrite OffthreadVideo ---
    video_name = f"video_overlay{n}.mp4"
    video_dst = os.path.join(PROJECT, "public", video_name)
    shutil.copy2(base_video_path, video_dst)
    logger.info(f"Copied video → public/{video_name}")
    component_code = rewrite_offthread_video(component_code, video_name)

    # --- Step 6: save component file ---
    component_path = os.path.join(PROJECT, "src", file_name)
    with open(component_path, "w", encoding="utf-8") as f:
        f.write(component_code)
    logger.info(f"Saved component → src/{file_name}")

    # --- Step 7: update Root.jsx ---
    component_name = extract_component_name(component_code)
    update_root_jsx(component_name, file_name, snippet)

    # --- Step 8: check fonts ---
    if not check_fonts():
        warnings.append("Noto CJK fonts not found — Japanese text will render invisible")

    # --- Step 9: check React version ---
    if not check_react_version():
        warnings.append("React version is not 18.3.1 — may crash on headless render")

    # --- Step 10: render ---
    test_mode = data.get("testMode", False)
    chrome = os.environ.get("REMOTION_CHROME_EXECUTABLE", "/usr/bin/google-chrome")
    npx = (
        os.environ.get("NPX_PATH")
        or shutil.which("npx")
        or "/root/.nvm/versions/node/v24.15.0/bin/npx"
    )
    output_dir = "/root/n8n-media/output"
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"{composition_id}.mp4")
    frames_flag = "--frames=0-200 " if test_mode else ""
    render_cmd = (
        f"REMOTION_CHROME_EXECUTABLE={chrome} "
        f"{npx} remotion render index.ts {composition_id} {output_path} {frames_flag}"
    ).strip()
    logger.info(f"Running {'test' if test_mode else 'full'} render: {render_cmd}")
    try:
        result = run(render_cmd, "full render", cwd=PROJECT)
        logger.info("Render SUCCESS")
        render_ok = True
        render_error = None
    except RuntimeError as e:
        render_ok = False
        render_error = str(e)
        logger.error(f"Render FAILED: {render_error}")

    output = {
        "status": "done" if render_ok else "error",
        "carouselN": n,
        "componentFile": f"src/{file_name}",
        "videoFile": f"public/{video_name}",
        "compositionId": composition_id,
        "outputPath": output_path if render_ok else None,
        "outputUrl": f"https://flows.lemonsushi.com/renders/output/{composition_id}.mp4" if render_ok else None,
        "warnings": warnings,
        "log_file": LOG_FILE,
    }
    if not render_ok:
        output["error"] = render_error

    print(json.dumps(output, ensure_ascii=False, indent=2))
    if not render_ok:
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.exception("overlay_setup failed")
        print(json.dumps({"error": str(e), "log_file": LOG_FILE}))
        sys.exit(1)
