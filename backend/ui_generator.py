from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid
import json
import requests
import base64
from backend.ui_templates import UI_STYLES, get_theme, get_screen_template, APP_THEMES

router = APIRouter()

# Try to import playwright:
try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except:
    PLAYWRIGHT_AVAILABLE = False

# Try to import weasyprint as fallback:
try:
    from weasyprint import HTML as WeasyprintHTML
    WEASYPRINT_AVAILABLE = True
except:
    WEASYPRINT_AVAILABLE = False

os.makedirs("output/ui_screens", exist_ok=True)

# Request models:
class UIGenerationRequest(BaseModel):
    project_name: str
    app_type: str
    description: str
    screens: List[str]
    features: Optional[List[str]] = []
    color_scheme: Optional[str] = ""
    platform: Optional[str] = "mobile"

class SingleScreenRequest(BaseModel):
    project_name: str
    app_type: str
    screen_name: str
    features: Optional[List[str]] = []
    description: Optional[str] = ""

# Function call_deepseek_for_ui:
def call_deepseek_for_ui(project_name: str, app_type: str, screen_name: str, features: list, description: str, theme: dict) -> dict:
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY_2") or os.getenv("GEMINI_API_KEY")
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    
    DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/auto")
    GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    
    system_prompt = f"""You are an expert mobile UI designer. Generate content for a {screen_name} screen.
    Return ONLY valid JSON with this exact structure based on the screen type:
    
    For LOGIN screen:
    {{"app_name": "name", "tagline": "subtitle", "emoji": "relevant emoji"}}
    
    For HOME screen:
    {{"user_name": "User", "search_placeholder": "Search here...", "section1_title": "Quick Access", "section2_title": "Recent Activity", "stats": [
        {{"value": "24", "label": "Tasks"}},
        {{"value": "8", "label": "Done"}},
        {{"value": "95%", "label": "Score"}}
    ], "features": [
        {{"icon": "emoji", "title": "Feature 1"}},
        {{"icon": "emoji", "title": "Feature 2"}},
        {{"icon": "emoji", "title": "Feature 3"}},
        {{"icon": "emoji", "title": "Feature 4"}}
    ], "list_items": [
        {{"title": "Item 1", "subtitle": "Description", "icon": "emoji"}},
        {{"title": "Item 2", "subtitle": "Description", "icon": "emoji"}}
    ], "nav_items": [
        {{"icon": "emoji", "label": "Home", "active": true}},
        {{"icon": "emoji", "label": "Search", "active": false}},
        {{"icon": "emoji", "label": "Add", "active": false}},
        {{"icon": "emoji", "label": "Profile", "active": false}}
    ]}}
    
    For PROFILE screen:
    {{"user_name": "User Name", "user_subtitle": "Member since 2024", "profile_stats": [
        {{"value": "42", "label": "Projects"}},
        {{"value": "128", "label": "Tasks"}},
        {{"value": "4.9", "label": "Rating"}}
    ], "profile_menu": [
        {{"icon": "emoji", "title": "Menu Item 1"}},
        {{"icon": "emoji", "title": "Menu Item 2"}},
        {{"icon": "emoji", "title": "Menu Item 3"}}
    ], "nav_items": [same as home]}}
    
    For DASHBOARD screen:
    {{"dashboard_title": "Analytics", "dashboard_subtitle": "Overview", "action1": "Export", "action2": "Filter", "recent_title": "Recent Activity", "dashboard_cards": [
        {{"icon": "emoji", "title": "Card 1", "value": "123"}},
        {{"icon": "emoji", "title": "Card 2", "value": "456"}}
    ], "nav_items": [same pattern]}}
    
    For MAP screen:
    {{"map_title": "Navigate", "nearby_title": "Nearby Places", "nearby_items": [
        {{"icon": "emoji", "title": "Place 1", "distance": "0.2 km"}},
        {{"icon": "emoji", "title": "Place 2", "distance": "0.5 km"}}
    ], "nav_items": [same pattern]}}
    
    For ONBOARDING screen:
    {{"onboarding_icon": "emoji", "onboarding_title": "Welcome Title", "onboarding_description": "Description text", "onboarding_btn": "Get Started"}}
    
    For LIST screen:
    {{"list_title": "Browse", "tabs": ["All", "Active", "Done"], "list_items": [
        {{"icon": "emoji", "title": "Item", "subtitle": "Sub", "badge": "New"}},
        {{"icon": "emoji", "title": "Item 2", "subtitle": "Sub 2", "badge": ""}}
    ], "nav_items": [same pattern]}}
    
    For DETAIL screen:
    {{"detail_image": "emoji", "detail_title": "Title", "detail_subtitle": "Subtitle", "detail_heading": "About", "detail_description": "Description text here...", "progress": "75", "progress_label": "75% Complete", "cta_button": "Get Started", "detail_badges": [], "detail_info": []}}
    
    For SETTINGS screen:
    {{"user_name": "User Name", "user_email": "user@email.com", "settings_sections": [
        {{"title": "Account", "items": [
            {{"icon": "emoji", "title": "Setting 1"}},
            {{"icon": "emoji", "title": "Setting 2"}}
        ]}}
    ], "nav_items": [same pattern]}}
    
    Make all content relevant to: {project_name} which is a {app_type} app.
    Features include: {', '.join(features) if features else 'standard features'}
    Use relevant emojis that match the app theme.
    Return ONLY the JSON, no other text."""
    
    user_prompt = f"Generate UI content for {screen_name} screen of {project_name} app ({app_type}). Description: {description}"
    
    # Try DeepSeek:
    if DEEPSEEK_API_KEY:
        try:
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
                "max_tokens": 1500,
                "temperature": 0.8
            }
            response = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=45)
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            start = content.find('{')
            end = content.rfind('}') + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
        except Exception as e:
            print(f"UI Gen - DeepSeek failed: {e}")
            
    # Try Gemini:
    if GEMINI_API_KEY:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
            payload = {
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2000}
            }
            response = requests.post(url, params={"key": GEMINI_API_KEY}, json=payload, timeout=45)
            response.raise_for_status()
            content = response.json()["candidates"][0]["content"]["parts"][0]["text"]
            start = content.find('{')
            end = content.rfind('}') + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
        except Exception as e:
            print(f"UI Gen - Gemini failed: {e}")
            
    # Try OpenRouter:
    if OPENROUTER_API_KEY:
        try:
            headers = {
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": OPENROUTER_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "max_tokens": 1500,
                "temperature": 0.8
            }
            response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=45)
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            start = content.find('{')
            end = content.rfind('}') + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
        except Exception as e:
            print(f"UI Gen - OpenRouter failed: {e}")
            
    # Try Groq:
    if GROQ_API_KEY:
        try:
            headers = {
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "max_tokens": 1500,
                "temperature": 0.8
            }
            response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=45)
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            start = content.find('{')
            end = content.rfind('}') + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
        except Exception as e:
            print(f"UI Gen - Groq failed: {e}")
            
    raise Exception("No configured AI providers succeeded for UI screen generation.")

# Function render_template:
def render_template(template: str, data: dict, theme: dict) -> str:
    rendered = template
    
    # Replace theme variables:
    rendered = rendered.replace("var(--primary)", theme["primary"])
    rendered = rendered.replace("var(--secondary)", theme["secondary"])
    rendered = rendered.replace("var(--primary-light)", theme["primary_light"])
    rendered = rendered.replace("var(--secondary-light)", theme["secondary_light"])
    rendered = rendered.replace("var(--bg)", theme["bg"])
    rendered = rendered.replace("var(--primary-rgb)", theme["primary_rgb"])
    rendered = rendered.replace("{{emoji}}", theme["emoji"])
    
    # Replace data variables:
    for key, value in data.items():
        if isinstance(value, str):
            rendered = rendered.replace("{{" + key + "}}", value)
        elif isinstance(value, list) and key == "stats":
            stats_html = ""
            for stat in value:
                stats_html += f'<div class="stat-card"><div class="stat-value">{stat.get("value","")}</div><div class="stat-label">{stat.get("label","")}</div></div>'
            rendered = rendered.replace("{{stats}}", stats_html)
        elif isinstance(value, list) and key == "features":
            features_html = ""
            for feat in value:
                features_html += f'<div class="feature-card"><div class="feature-icon">{feat.get("icon","📱")}</div><div class="feature-title">{feat.get("title","Feature")}</div></div>'
            rendered = rendered.replace("{{features}}", features_html)
        elif isinstance(value, list) and key == "nav_items":
            nav_html = ""
            for nav in value:
                active = "active" if nav.get("active") else ""
                nav_html += f'<div class="nav-item {active}"><div class="nav-icon" style="font-size:22px;display:flex;align-items:center;justify-content:center;">{nav.get("icon","📱")}</div><span class="nav-label">{nav.get("label","")}</span></div>'
            rendered = rendered.replace("{{nav_items}}", nav_html)
        elif isinstance(value, list) and key == "list_items":
            items_html = ""
            for item in value:
                items_html += f'<div class="list-item"><div style="font-size:28px;">{item.get("icon","📌")}</div><div><div style="font-size:14px;font-weight:600;color:#111827;">{item.get("title","")}</div><div style="font-size:12px;color:#9ca3af;">{item.get("subtitle","")}</div></div></div>'
            rendered = rendered.replace("{{list_items}}", items_html)
        elif isinstance(value, list) and key == "nearby_items":
            nearby_html = ""
            for item in value:
                nearby_html += f'<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6;"><div style="font-size:24px;">{item.get("icon","📍")}</div><div style="flex:1;"><div style="font-size:14px;font-weight:600;">{item.get("title","")}</div></div><div style="font-size:12px;color:#9ca3af;">{item.get("distance","")}</div></div>'
            rendered = rendered.replace("{{nearby_items}}", nearby_html)
        elif isinstance(value, list) and key == "profile_stats":
            stats_html = ""
            for stat in value:
                stats_html += f'<div style="text-align:center;"><div style="font-size:22px;font-weight:800;">{stat.get("value","")}</div><div style="font-size:11px;opacity:0.8;">{stat.get("label","")}</div></div>'
            rendered = rendered.replace("{{profile_stats}}", stats_html)
        elif isinstance(value, list) and key == "profile_menu":
            menu_html = ""
            for item in value:
                menu_html += f'<div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #f3f4f6;"><div style="font-size:22px;">{item.get("icon","⚙️")}</div><div style="font-size:15px;font-weight:500;color:#111827;flex:1;">{item.get("title","")}</div><div style="color:#9ca3af;">›</div></div>'
            menu_html += '</div>'
            rendered = rendered.replace("{{profile_menu}}", menu_html)
        elif isinstance(value, list) and key == "tabs":
            tabs_html = ""
            for i, tab in enumerate(value):
                active = "active" if i == 0 else ""
                tabs_html += f'<button class="tab {active}">{tab}</button>'
            rendered = rendered.replace("{{tabs}}", tabs_html)
        elif isinstance(value, list) and key == "dashboard_cards":
            cards_html = ""
            for card in value:
                cards_html += f'<div class="feature-card"><div class="feature-icon">{card.get("icon","📊")}</div><div style="font-size:20px;font-weight:800;color:{theme["primary"]};margin:8px 0;">{card.get("value","")}</div><div class="feature-title">{card.get("title","")}</div></div>'
            rendered = rendered.replace("{{dashboard_cards}}", cards_html)
        elif isinstance(value, list) and key == "settings_sections":
            sections_html = ""
            for section in value:
                sections_html += f'<div style="font-size:13px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">{section.get("title","")}</div>'
                for item in section.get("items", []):
                    sections_html += f'<div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #f3f4f6;"><div style="width:36px;height:36px;border-radius:10px;background:{theme["primary_light"]};display:flex;align-items:center;justify-content:center;font-size:18px;">{item.get("icon","⚙️")}</div><div style="font-size:15px;font-weight:500;color:#111827;flex:1;">{item.get("title","")}</div><div style="color:#9ca3af;">›</div></div>'
            rendered = rendered.replace("{{settings_sections}}", sections_html)
    
    # Clean up remaining placeholders:
    import re
    rendered = re.sub(r'\{\{[^}]+\}\}', '', rendered)
    
    return rendered

# Function generate_html_screen:
def generate_html_screen(project_name: str, app_type: str, screen_name: str, features: list, description: str, platform: str = "mobile") -> str:
    from main import call_deepseek
    
    is_mobile = platform == "mobile"
    system_prompt = (
        "You are an expert front-end developer and UI/UX designer. Generate complete, single-file HTML & CSS code for a premium, highly responsive UI screen.\n\n"
        "Requirements:\n"
        f"- Target Screen Name: {screen_name}\n"
        f"- Layout Style: {'Mobile layout (390px width by 844px height, vertically centered card)' if is_mobile else 'Desktop / Laptop Browser layout (full screen 16:9 view, responsive panels, widescreen grid)'}\n"
        f"- Project Name: {project_name}\n"
        f"- App Type/Category: {app_type}\n"
        f"- Specific Requirements & Prompt: {description}\n"
        f"- Core Features list: {', '.join(features) if features else 'Standard features'}\n\n"
        "Design Instructions:\n"
        "- Return ONLY the valid HTML code, containing standard HTML tags, CSS styled inline in a <style> block, and HTML layout. Do NOT wrap the output in markdown code block ticks (```html or ```) and do NOT add any markdown, comments, or explanations outside the HTML code.\n"
        "- Customize all text, fields, buttons, dashboard layouts, charts, and colors to represent the target prompt exactly. Do NOT use mock placeholder names like 'vit nav guide' or 'CampusConnect' unless explicitly requested. Use actual app-related text and branding.\n"
        "- The styling must be modern, premium, using gradients, rounded cards, beautiful buttons, clean typography, and responsive structures. Make it look beautiful and fully populated with real content (no Lorem Ipsum)."
    )
    
    user_prompt = f"Create full HTML code for the {screen_name} screen of the project: {project_name}. Specific requirements: {description}"
    
    try:
        html_code = call_deepseek(system_prompt, user_prompt)
        clean_code = html_code.strip()
        if clean_code.startswith("```"):
            lines = clean_code.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            clean_code = "\n".join(lines).strip()
        return clean_code
    except Exception as e:
        print("Dynamic UI Generation failed, falling back to static templates:", e)
        theme = get_theme(app_type)
        template = get_screen_template(screen_name)
        try:
            data = call_deepseek_for_ui(project_name, app_type, screen_name, features, description, theme)
        except Exception:
            data = {}
        return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=390, initial-scale=1.0">
<style>
:root {{
  --primary: {theme["primary"]};
  --secondary: {theme["secondary"]};
  --primary-light: {theme["primary_light"]};
  --secondary-light: {theme["secondary_light"]};
  --bg: {theme["bg"]};
  --primary-rgb: {theme["primary_rgb"]};
}}
{UI_STYLES}
</style>
</head>
<body>
{render_template(template, data, theme)}
</body>
</html>"""


# Async function html_to_image using playwright:
async def html_to_image_playwright(html_content: str, output_path: str, platform: str = "mobile") -> bool:
    try:
        async with async_playwright() as p:
            try:
                browser = await p.chromium.launch(
                    executable_path='chromium',
                    args=['--no-sandbox', '--disable-setuid-sandbox']
                )
            except Exception as e1:
                print(f"Failed launch with system chromium: {e1}. Trying default launch...")
                browser = await p.chromium.launch(
                    args=['--no-sandbox', '--disable-setuid-sandbox']
                )
            page = await browser.new_page()
            width = 390 if platform == "mobile" else 1280
            height = 844 if platform == "mobile" else 720
            await page.set_viewport_size({"width": width, "height": height})
            await page.set_content(html_content, wait_until="networkidle")
            await page.screenshot(path=output_path, full_page=False)
            await browser.close()
            return True
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Playwright error: {e}")
        return False


# Function html_to_image_fallback saves HTML file:
def save_html_screen(html_content: str, output_path: str) -> bool:
    try:
        html_path = output_path.replace('.png', '.html')
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        return True
    except Exception as e:
        print(f"HTML save error: {e}")
        return False


# API Routes:

@router.post("/api/generate-ui-screens")
async def generate_ui_screens(request: UIGenerationRequest):
    try:
        results = []
        platform_layout = request.platform or "mobile"
        
        for screen_name in request.screens:
            html_content = generate_html_screen(
                request.project_name,
                request.app_type,
                screen_name,
                request.features,
                request.description,
                platform_layout
            )
            
            filename = f"screen_{uuid.uuid4().hex[:8]}"
            png_path = f"output/ui_screens/{filename}.png"
            html_path = f"output/ui_screens/{filename}.html"
            
            image_generated = False
            
            if PLAYWRIGHT_AVAILABLE:
                image_generated = await html_to_image_playwright(html_content, png_path, platform_layout)
            
            if not image_generated:
                with open(html_path, 'w', encoding='utf-8') as f:
                    f.write(html_content)
                results.append({
                    "screen_name": screen_name,
                    "type": "html",
                    "path": html_path,
                    "url": f"/api/ui-screen-html/{filename}",
                    "preview_url": f"/api/ui-screen-preview/{filename}",
                    "code": html_content,
                    "platform": platform_layout
                })
            else:
                results.append({
                    "screen_name": screen_name,
                    "type": "image",
                    "path": png_path,
                    "url": f"/api/ui-screen-image/{filename}",
                    "platform": platform_layout
                })
        
        return JSONResponse({"success": True, "screens": results, "count": len(results)})
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/ui-screen-image/{filename}")
async def get_ui_screen_image(filename: str):
    path = f"output/ui_screens/{filename}.png"
    if os.path.exists(path):
        return FileResponse(path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Screen not found")

@router.get("/api/ui-screen-preview/{filename}")
async def get_ui_screen_preview(filename: str):
    html_path = f"output/ui_screens/{filename}.html"
    print(f"DEBUG: Preview requested for {filename}. html_path={html_path}, exists={os.path.exists(html_path)}, cwd={os.getcwd()}")
    if os.path.exists(html_path):
        return FileResponse(html_path, media_type="text/html")
    try:
        if os.path.exists("output/ui_screens"):
            files = os.listdir("output/ui_screens")
            print(f"DEBUG: Files in output/ui_screens: {files}")
        else:
            print("DEBUG: output/ui_screens directory does not exist!")
    except Exception as e:
        print(f"DEBUG: Failed to list dir: {e}")
    raise HTTPException(status_code=404, detail=f"Screen not found. Path: {html_path}")

@router.post("/api/generate-single-screen")
async def generate_single_screen(request: SingleScreenRequest):
    try:
        platform_layout = request.platform or "mobile"
        html_content = generate_html_screen(
            request.project_name,
            request.app_type,
            request.screen_name,
            request.features,
            request.description,
            platform_layout
        )
        
        filename = f"screen_{uuid.uuid4().hex[:8]}"
        html_path = f"output/ui_screens/{filename}.html"
        png_path = f"output/ui_screens/{filename}.png"
        
        image_generated = False
        if PLAYWRIGHT_AVAILABLE:
            image_generated = await html_to_image_playwright(html_content, png_path, platform_layout)
        
        if image_generated:
            return FileResponse(png_path, media_type="image/png", filename=f"{request.screen_name}.png")
        else:
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(html_content)
            return JSONResponse({
                "success": True,
                "preview_url": f"/api/ui-screen-preview/{filename}",
                "screen_name": request.screen_name,
                "platform": platform_layout
            })
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
