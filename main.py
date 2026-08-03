from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import sys
import uuid
import json
import requests
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AOS Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
# GEMINI_API_KEY_2 is supported for projects that already use GEMINI_API_KEY
# for a different AOS feature. The dedicated key is preferred for generators.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY_2") or os.getenv("GEMINI_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/auto")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

os.makedirs("output", exist_ok=True)
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))


class PDFRequest(BaseModel):
    prompt: str
    document_type: str


class PPTRequest(BaseModel):
    prompt: str
    num_slides: int = 8
    theme: str = "professional"
    template: str = "business"


class WordRequest(BaseModel):
    prompt: str
    document_type: str
    theme: str = "professional"


class ExcelRequest(BaseModel):
    prompt: str
    sheet_type: str = "report"


def call_deepseek(system_prompt: str, user_prompt: str) -> str:
    """Generate document content using configured providers without exposing keys."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    failures = []

    def openai_compatible(url: str, api_key: str, model: str, provider: str) -> str:
        response = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "max_tokens": 4000, "temperature": 0.7},
            timeout=90,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    # Gemini is preferred for document generation when it is configured.
    if GEMINI_API_KEY:
        try:
            response = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
                params={"key": GEMINI_API_KEY},
                json={
                    "system_instruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                    "generationConfig": {"temperature": 0.7, "maxOutputTokens": 4000},
                },
                timeout=90,
            )
            response.raise_for_status()
            return response.json()["candidates"][0]["content"]["parts"][0]["text"]
        except (requests.RequestException, KeyError, IndexError, ValueError) as error:
            failures.append(f"Gemini: {type(error).__name__}")

    if OPENROUTER_API_KEY:
        try:
            return openai_compatible(
                "https://openrouter.ai/api/v1/chat/completions",
                OPENROUTER_API_KEY,
                OPENROUTER_MODEL,
                "OpenRouter",
            )
        except (requests.RequestException, KeyError, IndexError, ValueError) as error:
            failures.append(f"OpenRouter: {type(error).__name__}")

    if GROQ_API_KEY:
        try:
            return openai_compatible(
                "https://api.groq.com/openai/v1/chat/completions",
                GROQ_API_KEY,
                GROQ_MODEL,
                "Groq",
            )
        except (requests.RequestException, KeyError, IndexError, ValueError) as error:
            failures.append(f"Groq: {type(error).__name__}")

    if DEEPSEEK_API_KEY:
        try:
            return openai_compatible(DEEPSEEK_URL, DEEPSEEK_API_KEY, "deepseek-chat", "DeepSeek")
        except (requests.RequestException, KeyError, IndexError, ValueError) as error:
            failures.append(f"DeepSeek: {type(error).__name__}")

    configured = "GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, or DEEPSEEK_API_KEY"
    if not failures:
        raise HTTPException(status_code=503, detail=f"No AI provider is configured. Add {configured} in Railway Variables.")
    raise HTTPException(status_code=502, detail=f"All configured AI providers failed ({'; '.join(failures)}). Check Railway Variables and provider credits.")


@app.get("/api/health")
def health():
    return {"status": "ok", "message": "AOS Backend Running"}


# PDF GENERATION ROUTE IMPORTED FROM pdf_generator.py
# PPT GENERATION ROUTE IMPORTED FROM ppt_generator.py
# WORD GENERATION ROUTE IMPORTED FROM word_generator.py
# EXCEL GENERATION ROUTE IMPORTED FROM excel_generator.py

from pdf_generator import router as pdf_router, call_deepseek as pdf_deepseek
from ppt_generator import router as ppt_router
from word_generator import router as word_router
from excel_generator import router as excel_router
app.include_router(pdf_router)
app.include_router(ppt_router)
app.include_router(word_router)
app.include_router(excel_router)

# Preserve the existing AOS chat, image, document, and presentation API routes.
from app import app as aos_api
app.mount("", aos_api)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
