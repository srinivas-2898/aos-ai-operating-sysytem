"""Server-side Hugging Face text-to-video generation for AOS Generation Studio."""
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from huggingface_hub import InferenceClient
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
    # Reuse the same Hugging Face token used by AOS image generation. It never
    # reaches the browser and needs Inference Providers permission.
    api_key = os.getenv("HF_TOKEN")
    if not api_key:
        raise HTTPException(status_code=503, detail="Video generation is not configured. Add HF_TOKEN to Railway Variables.")
    if request.duration not in {5, 10, 15, 30}:
        raise HTTPException(status_code=400, detail="Choose a duration of 5, 10, 15, or 30 seconds.")
    if request.aspect_ratio not in {"16:9", "9:16", "1:1"}:
        raise HTTPException(status_code=400, detail="Unsupported aspect ratio.")

    model = os.getenv("HF_VIDEO_MODEL", "Wan-AI/Wan2.2-TI2V-5B")
    prompt_parts = [request.prompt.strip(), f"Style: {request.style.strip()}", f"Aspect ratio: {request.aspect_ratio}"]
    if request.negative_prompt.strip():
        prompt_parts.append(f"Avoid: {request.negative_prompt.strip()}")
    try:
        # Hugging Face uses frame count for text-to-video. Eight FPS keeps the
        # requested durations practical while honoring the user's selection.
        parameters = {"num_frames": request.duration * 8}
        if request.negative_prompt.strip():
            parameters["negative_prompt"] = [request.negative_prompt.strip()]
        if request.seed is not None:
            parameters["seed"] = request.seed
        if request.quality.lower() == "hd":
            parameters["num_inference_steps"] = 40
        else:
            parameters["num_inference_steps"] = 20

        client = InferenceClient(provider="fal-ai", api_key=api_key, timeout=600)
        video = client.text_to_video(
            ", ".join(prompt_parts),
            model=model,
            # Fal's Wan video route requires an explicit aspect ratio rather
            # than inferring it from natural-language prompt text.
            extra_body={"aspect_ratio": request.aspect_ratio},
            **parameters,
        )
        content = video.read() if hasattr(video, "read") else bytes(video)
        if not content:
            raise RuntimeError("Hugging Face returned an empty video.")
        return Response(
            content=content,
            media_type="video/mp4",
            headers={"Content-Disposition": "attachment; filename=generated-video.mp4"},
        )
    except HTTPException:
        raise
    except Exception as error:
        message = str(error)
        if "401" in message or "403" in message:
            message = "Hugging Face rejected HF_TOKEN. Create a token with Inference Providers permission and update Railway Variables."
        elif "402" in message or "payment" in message.lower() or "credit" in message.lower():
            message = "Your Hugging Face Inference Providers account needs available credits for video generation."
        raise HTTPException(status_code=502, detail=f"Video generation failed: {message[:500]}") from error
