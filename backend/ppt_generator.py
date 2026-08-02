from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
from pydantic import BaseModel
import os
import sys
import uuid
import json
import requests

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from main import call_deepseek

router = APIRouter()

THEMES = {
    "professional": {"background": "1a1a2e", "title_color": "ffffff", "subtitle_color": "667eea", "text_color": "cccccc", "accent_color": "667eea", "secondary_bg": "16213e"},
    "modern": {"background": "7c3aed", "title_color": "ffffff", "subtitle_color": "f093fb", "text_color": "e9d5ff", "accent_color": "f093fb", "secondary_bg": "6d28d9"},
    "minimal": {"background": "ffffff", "title_color": "111827", "subtitle_color": "6b7280", "text_color": "374151", "accent_color": "111827", "secondary_bg": "f9fafb"},
    "corporate": {"background": "1e40af", "title_color": "ffffff", "subtitle_color": "bfdbfe", "text_color": "dbeafe", "accent_color": "3b82f6", "secondary_bg": "1d4ed8"},
    "creative": {"background": "fff1f2", "title_color": "be185d", "subtitle_color": "9d174d", "text_color": "1f2937", "accent_color": "f43f5e", "secondary_bg": "ffe4e6"},
}

TEMPLATES = {
    "business": {"slide_types": ["title", "agenda", "content", "content", "content", "content", "summary", "end"], "has_agenda": True, "has_numbers": True},
    "pitch_deck": {"slide_types": ["title", "problem", "solution", "market", "product", "traction", "team", "financials", "ask", "end"], "has_agenda": False, "has_numbers": True},
    "educational": {"slide_types": ["title", "overview", "content", "content", "content", "activity", "summary", "quiz", "end"], "has_agenda": True, "has_numbers": True},
    "portfolio": {"slide_types": ["title", "about", "work", "work", "work", "skills", "contact", "end"], "has_agenda": False, "has_numbers": False},
}

OUTPUT_DIRECTORY = "output"
os.makedirs(OUTPUT_DIRECTORY, exist_ok=True)


class PPTRequest(BaseModel):
    prompt: str
    num_slides: int = 8
    theme: str = "professional"
    template: str = "business"


def generate_ppt_content(prompt: str, num_slides: int, theme: str, template: str) -> dict:
    system_prompt = f"""You are an expert presentation designer. Generate professional slide content.
Return ONLY valid JSON with this exact structure:
{{"title":"Presentation main title","subtitle":"Presentation subtitle","author":"AOS AI Operating System","slides":[{{"slide_number":1,"type":"title","title":"Slide title","subtitle":"Slide subtitle","content":"Main content text","bullet_points":["Point 1","Point 2","Point 3","Point 4"],"speaker_notes":"Notes for this slide"}}]}}
Generate exactly {num_slides} slides. Make each slide focused with a maximum of 4-5 bullet points. Keep every bullet concise and impactful (maximum 10 words)."""
    response = call_deepseek(system_prompt, f"Create a {template} presentation about: {prompt}")
    clean_response = response.strip()
    if clean_response.startswith("```"):
        clean_response = clean_response.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        content = json.loads(clean_response)
        if not isinstance(content.get("slides"), list):
            raise ValueError("slides is missing")
        return content
    except (json.JSONDecodeError, ValueError, AttributeError):
        return {"title": "AOS Presentation", "subtitle": prompt[:160], "author": "AOS AI Operating System", "slides": [{"slide_number": 1, "type": "title", "title": "AOS Presentation", "subtitle": prompt, "content": response, "bullet_points": [], "speaker_notes": ""}]}


def hex_to_rgb(hex_color: str) -> RGBColor:
    value = hex_color.lstrip('#')
    return RGBColor(int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def set_slide_background(slide, color_hex: str):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = hex_to_rgb(color_hex)


def add_text_box(slide, text, left, top, width, height, font_size, color_hex, bold=False, alignment=PP_ALIGN.LEFT):
    box = slide.shapes.add_textbox(left, top, width, height)
    frame = box.text_frame
    frame.word_wrap = True
    paragraph = frame.paragraphs[0]
    paragraph.text = str(text or '')
    paragraph.alignment = alignment
    paragraph.font.name = 'Calibri'
    paragraph.font.size = Pt(font_size)
    paragraph.font.bold = bold
    paragraph.font.color.rgb = hex_to_rgb(color_hex)
    return box


def create_ppt_file(content: dict, theme_name: str, template_name: str, filename: str) -> str:
    theme = THEMES.get(theme_name, THEMES["professional"])
    filepath = os.path.join(OUTPUT_DIRECTORY, f"{filename}.pptx")
    presentation = Presentation()
    presentation.slide_width = Inches(13.33)
    presentation.slide_height = Inches(7.5)
    slides = content.get("slides") or []
    for index, slide_content in enumerate(slides):
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        set_slide_background(slide, theme["background"])
        slide_type = str(slide_content.get("type", "content")).lower()
        is_title = index == 0 or slide_type == "title"
        is_end = index == len(slides) - 1 or slide_type == "end"
        if is_title:
            add_text_box(slide, slide_content.get("title") or content.get("title"), Inches(1.0), Inches(1.65), Inches(11.3), Inches(1.15), 44, theme["title_color"], True, PP_ALIGN.CENTER)
            add_text_box(slide, slide_content.get("subtitle") or content.get("subtitle", ""), Inches(1.4), Inches(3.0), Inches(10.5), Inches(.7), 24, theme["subtitle_color"], False, PP_ALIGN.CENTER)
            line = slide.shapes.add_shape(1, Inches(3.95), Inches(3.33), Inches(6.7), Inches(.05))
            line.fill.solid(); line.fill.fore_color.rgb = hex_to_rgb(theme["accent_color"]); line.line.fill.background()
        elif is_end:
            add_text_box(slide, "Thank You", Inches(1.0), Inches(2.1), Inches(11.3), Inches(1.05), 54, theme["title_color"], True, PP_ALIGN.CENTER)
            add_text_box(slide, slide_content.get("subtitle") or "Questions and discussion", Inches(1.2), Inches(3.35), Inches(10.9), Inches(.6), 20, theme["subtitle_color"], False, PP_ALIGN.CENTER)
        else:
            add_text_box(slide, slide_content.get("title", "Key Point"), Inches(.75), Inches(.55), Inches(11.8), Inches(.65), 32, theme["title_color"], True)
            line = slide.shapes.add_shape(1, Inches(.75), Inches(1.35), Inches(3.2), Inches(.04))
            line.fill.solid(); line.fill.fore_color.rgb = hex_to_rgb(theme["accent_color"]); line.line.fill.background()
            if slide_content.get("content"):
                add_text_box(slide, slide_content["content"], Inches(.9), Inches(1.7), Inches(11.3), Inches(1.25), 18, theme["text_color"])
            bullets = slide_content.get("bullet_points") or []
            if bullets:
                bullet_text = '\n'.join(f'• {point}' for point in bullets[:5])
                add_text_box(slide, bullet_text, Inches(1.05), Inches(3.05), Inches(10.9), Inches(2.7), 18, theme["text_color"])
        if template_name in TEMPLATES and TEMPLATES[template_name].get("has_numbers"):
            add_text_box(slide, str(index + 1), Inches(12.15), Inches(7.0), Inches(.45), Inches(.25), 10, theme["subtitle_color"], False, PP_ALIGN.RIGHT)
        add_text_box(slide, "AOS", Inches(.5), Inches(7.0), Inches(.5), Inches(.25), 10, theme["subtitle_color"])
        notes = slide_content.get("speaker_notes")
        if notes:
            try:
                slide.notes_slide.notes_text_frame.text = str(notes)
            except AttributeError:
                pass
    presentation.save(filepath)
    return filepath


@router.post("/api/generate-ppt")
async def generate_ppt(request: PPTRequest):
    try:
        theme = request.theme or "professional"
        template = request.template or "business"
        num_slides = min(max(request.num_slides, 3), 20)
        content = generate_ppt_content(request.prompt, num_slides, theme, template)
        filename = f"aos_presentation_{uuid.uuid4().hex[:8]}"
        filepath = create_ppt_file(content, theme, template, filename)
        safe_name = ''.join(char if char.isalnum() or char in (' ', '-', '_') else '' for char in str(content.get('title', 'presentation'))).strip() or 'presentation'
        return FileResponse(filepath, media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation", filename=f"{safe_name}.pptx")
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
