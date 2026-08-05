"""
Premium PowerPoint Generator with AI-generated slide illustrations.
Uses LLM for rich slide content + Hugging Face for context-aware images.
"""
import os
import re
import json
import base64
import requests
from io import BytesIO
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from PIL import Image

HF_TOKEN = os.environ.get("HF_TOKEN")
router = APIRouter()


class PPTRequest(BaseModel):
    prompt: str
    num_slides: int = 8
    theme: str = "professional"
    template: str = "business"

# ── Theme palettes ──────────────────────────────────────────────────────
THEMES = {
    'modern': {
        'bg': (15, 23, 42), 'fg': (255, 255, 255), 'accent': (59, 130, 246),
        'card': (30, 41, 59), 'muted': (148, 163, 184), 'gradient_end': (30, 64, 175)
    },
    'minimal': {
        'bg': (255, 255, 255), 'fg': (15, 23, 42), 'accent': (59, 130, 246),
        'card': (241, 245, 249), 'muted': (100, 116, 139), 'gradient_end': (226, 232, 240)
    },
    'bold': {
        'bg': (9, 9, 11), 'fg': (255, 255, 255), 'accent': (168, 85, 247),
        'card': (24, 24, 27), 'muted': (161, 161, 170), 'gradient_end': (88, 28, 135)
    },
    'corporate': {
        'bg': (15, 23, 42), 'fg': (255, 255, 255), 'accent': (14, 165, 233),
        'card': (30, 41, 59), 'muted': (148, 163, 184), 'gradient_end': (3, 105, 161)
    },
    'creative': {
        'bg': (30, 10, 60), 'fg': (255, 255, 255), 'accent': (244, 63, 94),
        'card': (50, 20, 80), 'muted': (196, 181, 253), 'gradient_end': (109, 40, 217)
    },
}


def _rgb(t):
    return RGBColor(*t)


def _generate_slide_content(prompt, slide_count):
    """Use LLM to generate rich, structured slide content as JSON."""
    system = (
        "You are a professional presentation designer. Generate structured slide content as JSON.\n"
        "Return ONLY valid JSON (no markdown, no ```json wrapper). Structure:\n"
        "{\n"
        '  "title": "Presentation Title",\n'
        '  "slides": [\n'
        '    {\n'
        '      "title": "Slide Title",\n'
        '      "subtitle": "Optional subtitle",\n'
        '      "bullet_points": ["Point 1", "Point 2", "Point 3"],\n'
        '      "image_prompt": "Detailed description of a relevant illustration for this slide",\n'
        '      "speaker_notes": "Brief notes for the presenter"\n'
        '    }\n'
        "  ]\n"
        "}\n"
        f"Generate exactly {slide_count} slides. Make content detailed, professional, and directly relevant to the topic.\n"
        "The first slide should be the title/cover slide. The last slide should be a summary or Q&A slide.\n"
        "For image_prompt, describe a specific, high-quality illustration that matches the slide content."
    )
    user = f"Create a {slide_count}-slide presentation about: {prompt}"

    # Presentations use the dedicated Gemini key. This stays server-side and is
    # never exposed to the Firebase frontend.
    gemini_key = os.getenv("GEMINI_API_KEY_2")
    if not gemini_key:
        raise RuntimeError("GEMINI_API_KEY_2 is not configured in Railway Variables.")

    try:
        model = os.getenv("PPT_GEMINI_MODEL", "gemini-2.5-flash")
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": gemini_key},
            json={
                "system_instruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": {
                    "temperature": 0.7,
                    "maxOutputTokens": 8192,
                    "responseMimeType": "application/json",
                },
            },
            timeout=90,
        )
        response.raise_for_status()
        reply = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        match = re.search(r'(\{.*\})', reply.strip(), re.DOTALL)
        if match:
            generated = json.loads(match.group(1))
            if isinstance(generated.get("slides"), list):
                return generated
        raise ValueError("The AI response did not contain a slides array.")
    except Exception as error:
        detail = response.text[:300] if 'response' in locals() else str(error)
        raise RuntimeError(f"Gemini PPT generation failed: {detail}") from error


def _generate_image(prompt, width=400, height=300):
    """Generate an image via Hugging Face and return as BytesIO."""
    if not HF_TOKEN:
        return None
    try:
        res = requests.post(
            'https://router.huggingface.co/nscale/v1/images/generations',
            headers={'Authorization': f'Bearer {HF_TOKEN}'},
            json={
                'model': 'black-forest-labs/FLUX.1-schnell',
                'prompt': f"{prompt}, clean professional illustration, high quality, no text",
                'response_format': 'b64_json'
            },
            timeout=25,
        )
        if res.status_code == 200:
            b64 = res.json().get('data', [{}])[0].get('b64_json')
            if b64:
                img_data = base64.b64decode(b64)
                img = Image.open(BytesIO(img_data))
                img = img.resize((width, height), Image.LANCZOS)
                buf = BytesIO()
                img.save(buf, format='PNG')
                buf.seek(0)
                return buf
    except Exception as e:
        print(f"HF image generation failed for PPT slide: {e}")
    return None


def _add_rounded_rect(slide, left, top, width, height, fill_rgb, alpha=None):
    """Add a rounded rectangle shape as a card background."""
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = _rgb(fill_rgb)
    shape.line.fill.background()  # no border
    shape.shadow.inherit = False
    # Bring to back so text overlays it
    return shape


def _add_text(slide, left, top, width, height, text, font_size, color, bold=False, alignment=PP_ALIGN.LEFT):
    """Add a text box with styled text."""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size)
    p.font.color.rgb = _rgb(color)
    p.font.bold = bold
    p.alignment = alignment
    return txBox


def create_premium_pptx(prompt, slide_count=8, theme='modern'):
    """Generate a premium PowerPoint presentation with AI images."""
    palette = THEMES.get(theme, THEMES['modern'])

    # 1. Generate structured slide content via LLM
    content = _generate_slide_content(prompt, slide_count)
    slides_data = content.get('slides', [])
    pres_title = content.get('title', prompt[:60])

    # Pad or trim to requested count
    while len(slides_data) < slide_count:
        slides_data.append({"title": "Additional Points", "subtitle": "", "bullet_points": [f"More details about {prompt}"], "image_prompt": f"illustration about {prompt}", "speaker_notes": ""})
    slides_data = slides_data[:slide_count]

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    W = prs.slide_width
    H = prs.slide_height

    for idx, sd in enumerate(slides_data):
        slide = prs.slides.add_slide(prs.slide_layouts[6])  # Blank layout

        # ── Background ──
        bg = slide.background.fill
        bg.solid()
        bg.fore_color.rgb = _rgb(palette['bg'])

        # ── Accent bar (thin strip at top) ──
        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, W, Inches(0.08))
        bar.fill.solid()
        bar.fill.fore_color.rgb = _rgb(palette['accent'])
        bar.line.fill.background()

        is_cover = idx == 0
        is_last = idx == slide_count - 1

        if is_cover:
            # ══════════ COVER SLIDE ══════════
            # Large centered title
            _add_text(slide, Inches(1), Inches(2.0), Inches(11.3), Inches(1.5),
                      pres_title, 44, palette['fg'], bold=True, alignment=PP_ALIGN.CENTER)

            subtitle = sd.get('subtitle', '')
            if subtitle:
                _add_text(slide, Inches(2), Inches(3.6), Inches(9.3), Inches(0.8),
                          subtitle, 22, palette['muted'], alignment=PP_ALIGN.CENTER)

            # Accent divider line
            divider = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(5.5), Inches(3.3), Inches(2.3), Inches(0.06))
            divider.fill.solid()
            divider.fill.fore_color.rgb = _rgb(palette['accent'])
            divider.line.fill.background()

            # Generate cover image
            img_buf = _generate_image(sd.get('image_prompt', prompt), 500, 350)
            if img_buf:
                slide.shapes.add_picture(img_buf, Inches(4.4), Inches(4.2), Inches(4.5), Inches(3.0))

        elif is_last:
            # ══════════ CLOSING SLIDE ══════════
            _add_text(slide, Inches(1), Inches(2.4), Inches(11.3), Inches(1.2),
                      sd.get('title', 'Thank You'), 40, palette['fg'], bold=True, alignment=PP_ALIGN.CENTER)

            bullets = sd.get('bullet_points', [])
            if bullets:
                for bi, bp in enumerate(bullets[:4]):
                    _add_text(slide, Inches(3), Inches(3.6 + bi * 0.6), Inches(7.3), Inches(0.5),
                              f"→  {bp}", 18, palette['muted'], alignment=PP_ALIGN.CENTER)

        else:
            # ══════════ CONTENT SLIDES ══════════
            # Slide number badge
            badge = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(0.5), Inches(0.35), Inches(0.55), Inches(0.55))
            badge.fill.solid()
            badge.fill.fore_color.rgb = _rgb(palette['accent'])
            badge.line.fill.background()
            badge_tf = badge.text_frame
            badge_tf.paragraphs[0].text = str(idx + 1)
            badge_tf.paragraphs[0].font.size = Pt(16)
            badge_tf.paragraphs[0].font.color.rgb = RGBColor(255, 255, 255)
            badge_tf.paragraphs[0].font.bold = True
            badge_tf.paragraphs[0].alignment = PP_ALIGN.CENTER
            badge_tf.vertical_anchor = MSO_ANCHOR.MIDDLE

            # Slide title
            _add_text(slide, Inches(1.3), Inches(0.3), Inches(7), Inches(0.7),
                      sd.get('title', ''), 28, palette['fg'], bold=True)

            # Subtitle
            subtitle = sd.get('subtitle', '')
            if subtitle:
                _add_text(slide, Inches(1.3), Inches(1.0), Inches(7), Inches(0.5),
                          subtitle, 16, palette['muted'])

            # Content card background
            card_top = Inches(1.6)
            card_height = Inches(5.2)
            _add_rounded_rect(slide, Inches(0.5), card_top, Inches(7.5), card_height, palette['card'])

            # Bullet points inside card
            bullets = sd.get('bullet_points', [])
            for bi, bp in enumerate(bullets[:6]):
                y_pos = card_top + Inches(0.4 + bi * 0.7)
                # Bullet icon
                dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(1.0), y_pos + Inches(0.12), Inches(0.18), Inches(0.18))
                dot.fill.solid()
                dot.fill.fore_color.rgb = _rgb(palette['accent'])
                dot.line.fill.background()
                # Bullet text
                _add_text(slide, Inches(1.4), y_pos, Inches(6.2), Inches(0.6),
                          bp, 16, palette['fg'])

            # Right side: AI-generated illustration
            img_prompt = sd.get('image_prompt', f'illustration about {prompt}')
            img_buf = _generate_image(img_prompt, 480, 400)
            if img_buf:
                # Image card background
                _add_rounded_rect(slide, Inches(8.3), card_top, Inches(4.5), card_height, palette['card'])
                slide.shapes.add_picture(img_buf, Inches(8.5), Inches(1.9), Inches(4.1), Inches(3.4))

                # Image caption
                _add_text(slide, Inches(8.5), Inches(5.5), Inches(4.1), Inches(0.5),
                          img_prompt[:50], 11, palette['muted'], alignment=PP_ALIGN.CENTER)

        # ── Footer ──
        _add_text(slide, Inches(0.5), Inches(7.0), Inches(4), Inches(0.4),
                  pres_title, 10, palette['muted'])
        _add_text(slide, Inches(10), Inches(7.0), Inches(3), Inches(0.4),
                  f"Slide {idx + 1} of {slide_count}", 10, palette['muted'], alignment=PP_ALIGN.RIGHT)

    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue(), 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'


@router.post("/api/generate-ppt")
async def generate_ppt(request: PPTRequest):
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Please enter a presentation topic.")

    slide_count = max(3, min(request.num_slides, 20))
    theme_aliases = {"professional": "corporate", "business": "corporate"}
    theme = theme_aliases.get(request.theme.lower(), request.theme.lower())
    if theme not in THEMES:
        theme = "corporate"

    try:
        content, media_type, extension = create_premium_pptx(prompt, slide_count, theme)
        filename = re.sub(r"[^a-zA-Z0-9_-]+", "-", prompt[:60]).strip("-") or "aos-presentation"
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}.{extension}"'},
        )
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"PowerPoint generation failed: {error}") from error
