"""Scene-based video generation for AOS Generation Studio.

The pipeline intentionally uses the existing Hugging Face *image* access rather
than a separate paid text-to-video account:

prompt -> AI scene plan -> scene images -> FFmpeg MP4 assembly.
"""
import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

router = APIRouter()

HF_IMAGE_URL = "https://router.huggingface.co/nscale/v1/images/generations"
ALLOWED_RATIOS = {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (960, 960)}


class VideoRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)
    negative_prompt: str = Field(default="", max_length=1200)
    duration: int = Field(default=5)
    aspect_ratio: str = "16:9"
    quality: str = "Fast"
    style: str = "Cinematic"
    seed: int | None = None


def _scene_count(duration: int) -> int:
    """Keep the number of provider calls practical while providing a real story."""
    return {5: 2, 10: 3, 15: 4, 30: 6}[duration]


def _fallback_scenes(prompt: str, count: int) -> list[str]:
    """Input-derived fallback if an optional text model is temporarily unavailable."""
    clean = " ".join(prompt.split())
    beats = [part.strip() for part in re.split(r"[.!?;]\s*", clean) if part.strip()]
    if not beats:
        beats = [clean]
    return [
        f"Scene {index + 1}: {beats[index % len(beats)]}. Create a distinct visual moment that advances the story."
        for index in range(count)
    ]


def _plan_scenes(prompt: str, count: int, style: str) -> list[str]:
    """Ask the configured AOS text model for a concise visual storyboard."""
    try:
        # Delayed import avoids a module-import cycle while main.py loads routers.
        from main import call_deepseek

        result = call_deepseek(
            "You are a film storyboard artist. Return ONLY JSON in the form "
            '{"scenes":["visual scene prompt", ...]}. Each scene must be a '
            "specific visual shot, preserve a coherent subject and avoid words, logos, or captions.",
            f"Create exactly {count} {style} storyboard scene prompts for this video request: {prompt}",
            response_format="json",
        )
        scenes = json.loads(result).get("scenes", [])
        scenes = [str(scene).strip() for scene in scenes if str(scene).strip()]
        if len(scenes) >= count:
            return scenes[:count]
    except Exception:
        # Image generation remains usable even if the optional planner provider
        # has no available quota; this is never mock data.
        pass
    return _fallback_scenes(prompt, count)


def _generate_scene_image(prompt: str, model: str, token: str) -> bytes:
    response = requests.post(
        HF_IMAGE_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"model": model, "prompt": prompt, "response_format": "b64_json"},
        timeout=150,
    )
    if response.status_code in {401, 403}:
        raise HTTPException(
            status_code=502,
            detail="Hugging Face rejected HF_TOKEN for image generation. Update the Railway HF_TOKEN with a valid token.",
        )
    try:
        response.raise_for_status()
        encoded = ((response.json().get("data") or [{}])[0]).get("b64_json")
        if not encoded:
            raise ValueError("No image was returned")
        return base64.b64decode(encoded)
    except HTTPException:
        raise
    except Exception as error:
        detail = response.text[:250] if response.content else str(error)
        raise HTTPException(status_code=502, detail=f"Scene image generation failed: {detail}") from error


def _create_video(image_paths: list[Path], output: Path, duration: int, ratio: str, quality: str) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise HTTPException(status_code=503, detail="Video assembly is unavailable because FFmpeg is missing from the server.")

    width, height = ALLOWED_RATIOS[ratio]
    fps = 24
    scene_duration = duration / len(image_paths)
    clip_paths: list[Path] = []
    preset = "medium" if quality.lower() == "hd" else "veryfast"
    for index, image_path in enumerate(image_paths):
        clip_path = image_path.with_suffix(".mp4")
        frames = max(1, round(scene_duration * fps))
        video_filter = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,"
            f"zoompan=z='min(zoom+0.0008,1.12)':d={frames}:s={width}x{height}:fps={fps},format=yuv420p"
        )
        command = [
            ffmpeg, "-y", "-loop", "1", "-i", str(image_path), "-t", str(scene_duration),
            "-vf", video_filter, "-r", str(fps), "-c:v", "libx264", "-preset", preset,
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(clip_path),
        ]
        result = subprocess.run(command, capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            raise HTTPException(status_code=502, detail=f"Video scene assembly failed: {result.stderr[-400:]}")
        clip_paths.append(clip_path)

    manifest = output.with_suffix(".txt")
    manifest.write_text("".join(f"file '{path.as_posix()}'\n" for path in clip_paths), encoding="utf-8")
    result = subprocess.run(
        [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(manifest), "-c", "copy", str(output)],
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.returncode != 0 or not output.exists():
        raise HTTPException(status_code=502, detail=f"Video finalization failed: {result.stderr[-400:]}")


@router.post("/api/generate/video")
def generate_video(request: VideoRequest):
    if request.duration not in {5, 10, 15, 30}:
        raise HTTPException(status_code=400, detail="Choose a duration of 5, 10, 15, or 30 seconds.")
    if request.aspect_ratio not in ALLOWED_RATIOS:
        raise HTTPException(status_code=400, detail="Choose 16:9, 9:16, or 1:1 for the aspect ratio.")

    token = os.getenv("HF_TOKEN")
    if not token:
        raise HTTPException(status_code=503, detail="Video generation is not configured. Add HF_TOKEN to Railway Variables.")
    model = os.getenv("HF_IMAGE_MODEL", "black-forest-labs/FLUX.1-schnell")
    scenes = _plan_scenes(request.prompt, _scene_count(request.duration), request.style)
    image_suffix = f"{request.style} visual style, no text, no logo, no watermark, {request.aspect_ratio} composition"
    if request.negative_prompt.strip():
        image_suffix += f". Avoid: {request.negative_prompt.strip()}"

    try:
        with tempfile.TemporaryDirectory(prefix="aos-video-") as temp_dir:
            work_dir = Path(temp_dir)
            image_paths = []
            for index, scene in enumerate(scenes):
                image_path = work_dir / f"scene-{index + 1}.png"
                image_path.write_bytes(_generate_scene_image(f"{scene}. {image_suffix}", model, token))
                image_paths.append(image_path)
            output = work_dir / "aos-generated-video.mp4"
            _create_video(image_paths, output, request.duration, request.aspect_ratio, request.quality)
            return Response(
                content=output.read_bytes(),
                media_type="video/mp4",
                headers={"Content-Disposition": "attachment; filename=aos-generated-video.mp4"},
            )
    except HTTPException:
        raise
    except subprocess.TimeoutExpired as error:
        raise HTTPException(status_code=504, detail="Video assembly timed out. Try a shorter duration or Fast quality.") from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Video generation failed: {str(error)[:500]}") from error
