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
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"

os.makedirs("output", exist_ok=True)
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))


class PDFRequest(BaseModel):
    prompt: str
    document_type: str
    theme: str = "professional"


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
    """Send a document-generation prompt to DeepSeek from the server only."""
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY is not configured on the server.")

    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "max_tokens": 4000,
        "temperature": 0.7
    }

    try:
        response = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()
        return result["choices"][0]["message"]["content"]
    except (requests.RequestException, KeyError, IndexError, ValueError) as error:
        raise HTTPException(status_code=502, detail=f"DeepSeek request failed: {str(error)}") from error


@app.get("/api/health")
def health():
    return {"status": "ok", "message": "AOS Backend Running"}


# PDF GENERATION ROUTE IMPORTED FROM pdf_generator.py
# PPT GENERATION ROUTE IMPORTED FROM ppt_generator.py
# WORD GENERATION ROUTE IMPORTED FROM word_generator.py
# EXCEL GENERATION ROUTE IMPORTED FROM excel_generator.py

from pdf_generator import router as pdf_router, call_deepseek as pdf_deepseek
from ppt_generator import router as ppt_router
app.include_router(pdf_router)
app.include_router(ppt_router)

# Preserve the existing AOS chat, image, document, and presentation API routes.
from app import app as aos_api
app.mount("", aos_api)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
