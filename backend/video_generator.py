"""Server-side Pollinations video generation for AOS Generation Studio."""
import os
from urllib.parse import quote

import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

router = APIRouter()


class VideoRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)
    negative_prompt: str = Field(default="", max_length=1200)
    duration: int = Field(default=5)
    aspect_ratio: str = "16:9"
    quality: str = "Fast"
    style: str = "Cinematic"
    seed: int | None = None


@router.post("/api/generate/video")
def generate_video(request: VideoRequest):
    api_key = os.getenv("POLLINATIONS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Video generation is not configured. Add POLLINATIONS_API_KEY to Railway Variables.")
    if request.duration not in {5, 10, 15, 30}:
        raise HTTPException(status_code=400, detail="Choose a duration of 5, 10, 15, or 30 seconds.")
    if request.aspect_ratio not in {"16:9", "9:16", "1:1"}:
        raise HTTPException(status_code=400, detail="Unsupported aspect ratio.")

    model = "wan-pro-1080p" if request.quality.lower() == "hd" else "wan-fast"
    prompt_parts = [request.prompt.strip(), f"Style: {request.style.strip()}", f"Aspect ratio: {request.aspect_ratio}"]
    if request.negative_prompt.strip():
        prompt_parts.append(f"Avoid: {request.negative_prompt.strip()}")
    params = {"model": model, "duration": request.duration}
    if request.seed is not None:
        params["seed"] = request.seed

    try:
        response = requests.get(
            f"https://gen.pollinations.ai/video/{quote(', '.join(prompt_parts), safe='')}",
            params=params,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=600,
        )
        if not response.ok:
            detail = response.text[:500] or "Pollinations could not generate this video."
            raise HTTPException(status_code=response.status_code, detail=f"Video generation failed: {detail}")
        media_type = response.headers.get("content-type", "video/mp4").split(";", 1)[0]
        if not media_type.startswith("video/"):
            raise HTTPException(status_code=502, detail="Pollinations returned an unexpected response instead of an MP4 video.")
        return Response(
            content=response.content,
            media_type=media_type,
            headers={"Content-Disposition": "attachment; filename=generated-video.mp4"},
        )
    except requests.RequestException as error:
        raise HTTPException(status_code=502, detail="Could not reach the video provider. Please retry shortly.") from error
