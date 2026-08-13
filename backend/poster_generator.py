import os
import re
import json
import base64
from io import BytesIO
import httpx
from PIL import Image, ImageDraw, ImageFont, ImageOps

HF_TOKEN = os.environ.get("HF_TOKEN")

def load_font(size, bold=False):
    font_paths = [
        # Linux fonts (Railway)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans.ttf",
        # Windows fonts (Local testing)
        "C:\\Windows\\Fonts\\arialbd.ttf" if bold else "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\segoeuib.ttf" if bold else "C:\\Windows\\Fonts\\segoeui.ttf",
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

def draw_gradient(image, color1, color2):
    draw = ImageDraw.Draw(image)
    w, h = image.size
    # Parse hex colors
    def parse_hex(c):
        c = c.lstrip('#')
        if len(c) == 3:
            c = ''.join(x*2 for x in c)
        return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    
    try:
        r1, g1, b1 = parse_hex(color1)
        r2, g2, b2 = parse_hex(color2)
    except Exception:
        r1, g1, b1 = 15, 23, 42  # default dark theme
        r2, g2, b2 = 3, 7, 18
        
    for y in range(h):
        r = int(r1 + (r2 - r1) * y / h)
        g = int(g1 + (g2 - g1) * y / h)
        b = int(b1 + (b2 - b1) * y / h)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

def draw_wrapped_text(draw, text, font, color, x, y, max_width):
    words = str(text or '').split()
    lines = []
    current_line = []
    
    # Simple default font bbox safety
    is_default = hasattr(font, 'getmask') and not hasattr(font, 'font')
    
    for word in words:
        test_line = ' '.join(current_line + [word])
        if is_default:
            # Default font approximation
            width = len(test_line) * 6
        else:
            bbox = draw.textbbox((0, 0), test_line, font=font)
            width = bbox[2] - bbox[0]
            
        if width <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(' '.join(current_line))
                current_line = [word]
            else:
                lines.append(word)
                current_line = []
                
    if current_line:
        lines.append(' '.join(current_line))
        
    current_y = y
    for line in lines:
        if is_default:
            height = 12
        else:
            bbox = draw.textbbox((0, 0), line, font=font)
            height = bbox[3] - bbox[1]
            
        draw.text((x, current_y), line, fill=color, font=font)
        current_y += height + 6
        
    return current_y

async def generate_illustrative_artwork(prompt: str, model: str = "black-forest-labs/FLUX.1-schnell") -> Image.Image:
    """Generate image artwork via Hugging Face API, falling back to Pollinations on failure."""
    if HF_TOKEN:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    'https://router.huggingface.co/nscale/v1/images/generations',
                    headers={'Authorization': f'Bearer {HF_TOKEN}'},
                    json={'model': model, 'prompt': prompt, 'response_format': 'b64_json'},
                    timeout=120,
                )
                if response.status_code == 200:
                    payload = response.json()
                    result = (payload.get('data') or [{}])[0]
                    encoded = result.get('b64_json')
                    if encoded:
                        img_data = base64.b64decode(encoded)
                        return Image.open(BytesIO(img_data))
                print(f"HF image failed (status {response.status_code}): {response.text[:200]}")
        except Exception as hf_err:
            print(f"HF image generation error: {hf_err}")

    # Pollinations Fallback
    print("Falling back to Pollinations for illustrative artwork...")
    try:
        from urllib.parse import quote
        safe_prompt = quote(prompt)
        poll_url = f"https://image.pollinations.ai/prompt/{safe_prompt}?width=1024&height=1024&nologo=true"
        async with httpx.AsyncClient() as client:
            resp = await client.get(poll_url, timeout=90)
            if resp.status_code == 200 and len(resp.content) > 1000:
                return Image.open(BytesIO(resp.content))
            raise ValueError(f"Pollinations returned status {resp.status_code}")
    except Exception as poll_err:
        print(f"Pollinations fallback failed: {poll_err}")
        raise ValueError(f"Image generation failed on both HF and Pollinations fallback: {poll_err}")

async def create_layout_aware_poster(prompt: str, gemini_api_key: str, model_name: str = "black-forest-labs/FLUX.1-schnell") -> str:
    """Uses LLM to lay out the poster, generates sub-images from HF, composites and returns base64 PNG."""
    
    # 1. Ask Gemini to plan the layout JSON
    system_prompt = (
        "You are an expert poster and advertisement graphic designer.\n"
        "Generate a structured layout planning JSON. Use coordinates matching a canvas size of 800 width by 1200 height.\n"
        "Return ONLY valid JSON with this exact structure, no markdown wrappers (like ```json), no other text:\n"
        "{\n"
        "  \"bg_color_start\": \"#hex\",\n"
        "  \"bg_color_end\": \"#hex\",\n"
        "  \"title\": {\"text\": \"Header text\", \"font_size\": 46, \"color\": \"#hex\", \"y\": 80},\n"
        "  \"subtitle\": {\"text\": \"Sub-headline text\", \"font_size\": 22, \"color\": \"#hex\", \"y\": 140},\n"
        "  \"cards\": [\n"
        "    {\"title\": \"Card Title\", \"body\": \"Card content text describing features.\", \"x\": 50, \"y\": 220, \"w\": 330, \"h\": 240, \"bg_color\": \"#hex\", \"text_color\": \"#hex\", \"border_color\": \"#hex\"}\n"
        "  ],\n"
        "  \"image_areas\": [\n"
        "    {\"prompt\": \"Clean specific illustration prompt representing the theme\", \"x\": 410, \"y\": 220, \"w\": 340, \"h\": 520}\n"
        "  ]\n"
        "}"
    )
    
    user_prompt = f"Plan a beautiful layout for a poster about: {prompt}"
    
    # Fetch from Gemini API
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={gemini_api_key}"
    payload = {'contents': [{'parts': [{'text': f"{system_prompt}\n\nUser request: {user_prompt}"}]}]}
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, timeout=45)
        response.raise_for_status()
        res_data = response.json()
        reply = res_data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
        
    # Extract JSON content
    clean_reply = reply.strip()
    json_match = re.search(r'(\{.*\})', clean_reply, re.DOTALL)
    if json_match:
        layout = json.loads(json_match.group(1))
    else:
        # Fallback layout plan
        layout = {
            "bg_color_start": "#111827",
            "bg_color_end": "#030712",
            "title": {"text": prompt[:40], "font_size": 42, "color": "#ffffff", "y": 80},
            "subtitle": {"text": "AI Generated Poster Layout", "font_size": 20, "color": "#3b82f6", "y": 140},
            "cards": [
                {"title": "Overview", "body": prompt, "x": 60, "y": 220, "w": 320, "h": 300, "bg_color": "#1f2937", "text_color": "#ffffff", "border_color": "#374151"}
            ],
            "image_areas": [
                {"prompt": f"high tech illustration representing: {prompt}", "x": 410, "y": 220, "w": 330, "h": 500}
            ]
        }
        
    # 2. Render Poster Canvas
    width, height = 800, 1200
    img = Image.new('RGB', (width, height), color='#111827')
    
    # Draw Background Gradient
    bg_start = layout.get("bg_color_start", "#111827")
    bg_end = layout.get("bg_color_end", "#030712")
    draw_gradient(img, bg_start, bg_end)
    
    draw = ImageDraw.Draw(img)
    
    # Draw Title & Subtitle
    title_data = layout.get("title", {})
    sub_data = layout.get("subtitle", {})
    
    title_font = load_font(title_data.get("font_size", 42), bold=True)
    sub_font = load_font(sub_data.get("font_size", 20), bold=False)
    
    title_color = title_data.get("color", "#ffffff")
    sub_color = sub_data.get("color", "#3b82f6")
    
    # Draw Title (centered horizontally)
    title_text = title_data.get("text", "AI Poster")
    title_y = title_data.get("y", 80)
    title_bbox = draw.textbbox((0, 0), title_text, font=title_font) if not (hasattr(title_font, 'getmask') and not hasattr(title_font, 'font')) else (0, 0, len(title_text) * 16, 42)
    title_x = (width - (title_bbox[2] - title_bbox[0])) // 2
    draw.text((title_x, title_y), title_text, fill=title_color, font=title_font)
    
    # Draw Subtitle (centered horizontally)
    sub_text = sub_data.get("text", "")
    sub_y = sub_data.get("y", 140)
    if sub_text:
        sub_bbox = draw.textbbox((0, 0), sub_text, font=sub_font) if not (hasattr(sub_font, 'getmask') and not hasattr(sub_font, 'font')) else (0, 0, len(sub_text) * 8, 20)
        sub_x = (width - (sub_bbox[2] - sub_bbox[0])) // 2
        draw.text((sub_x, sub_y), sub_text, fill=sub_color, font=sub_font)
        
    # 3. Generate and paste illustative artworks
    for idx, area in enumerate(layout.get("image_areas", [])):
        img_prompt = area.get("prompt", "futuristic artwork")
        x, y, w, h = area.get("x", 410), area.get("y", 220), area.get("w", 330), area.get("h", 500)
        
        try:
            # Generate illustration via HF
            art = await generate_illustrative_artwork(img_prompt, model_name)
            # Resize and crop to fill coordinate bounds perfectly
            art_cropped = ImageOps.fit(art, (w, h))
            img.paste(art_cropped, (x, y))
            # Draw visual thin border around illustration area
            draw.rectangle([x, y, x + w, y + h], outline="#374151", width=2)
        except Exception as err:
            print(f"Failed to generate illustrative artwork for slot {idx}: {err}")
            # Fallback illustration placeholder
            draw.rectangle([x, y, x + w, y + h], fill="#1e293b", outline="#ef4444", width=2)
            draw_wrapped_text(draw, f"[Artwork Generation Failed: {img_prompt}]", load_font(14), "#ef4444", x + 12, y + 12, w - 24)
            
    # 4. Draw rounded card sections (Pillow)
    for card in layout.get("cards", []):
        x, y, w, h = card.get("x", 50), card.get("y", 220), card.get("w", 330), card.get("h", 240)
        bg = card.get("bg_color", "#1f2937")
        tc = card.get("text_color", "#ffffff")
        bc = card.get("border_color", "#374151")
        card_title = card.get("title", "")
        card_body = card.get("body", "")
        
        # Draw dynamic card shadow (slightly offset transparent dark card)
        draw.rounded_rectangle([x + 4, y + 4, x + w + 4, y + h + 4], radius=16, fill="#030712")
        
        # Draw card base
        draw.rounded_rectangle([x, y, x + w, y + h], radius=16, fill=bg, outline=bc, width=2)
        
        # Draw card text
        current_y = y + 16
        if card_title:
            title_f = load_font(18, bold=True)
            current_y = draw_wrapped_text(draw, card_title, title_f, tc, x + 16, current_y, w - 32)
            current_y += 6
            
        if card_body:
            body_f = load_font(14, bold=False)
            draw_wrapped_text(draw, card_body, body_f, tc, x + 16, current_y, w - 32)
            
    # 5. Export to base64
    buf = BytesIO()
    img.save(buf, format='PNG')
    encoded_png = base64.b64encode(buf.getvalue()).decode('utf-8')
    return f"data:image/png;base64,{encoded_png}"
