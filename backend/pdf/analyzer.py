import json

CATEGORIES = [
    "Research Report", "Business Proposal", "Resume", "Invoice",
    "Technical Documentation", "Case Study", "White Paper", "User Manual",
    "Presentation Notes", "Meeting Minutes", "Research Paper", "General Report"
]

LAYOUTS = ["corporate", "creative", "academic", "minimal"]
PALETTES = ["Corporate Blue", "Academic Blue", "Sky Blue", "Green Business", "Purple Creative"]

def analyze_document_type(prompt: str) -> dict:
    from main import call_deepseek
    """Analyze prompt to classify document type, theme, and colors."""
    system_prompt = f"""You are an expert document architect.
Analyze the user prompt and classify it into one of these categories: {json.dumps(CATEGORIES)}.
Choose the most appropriate layout style from: {json.dumps(LAYOUTS)}.
Choose the most appropriate color palette from: {json.dumps(PALETTES)}.

Return ONLY valid JSON in this format:
{{
  "category": "Chosen Category",
  "layout_style": "Chosen Layout",
  "color_palette": "Chosen Palette"
}}"""
    try:
        response = call_deepseek(system_prompt, f"Analyze this prompt: {prompt}")
        clean_response = response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        result = json.loads(clean_response)
        
        # Validation and fallbacks
        category = result.get("category", "General Report")
        if category not in CATEGORIES:
            category = "General Report"
            
        layout_style = result.get("layout_style", "corporate").lower()
        if layout_style not in LAYOUTS:
            layout_style = "corporate"
            
        color_palette = result.get("color_palette", "Corporate Blue")
        if color_palette not in PALETTES:
            color_palette = "Corporate Blue"
            
        return {
            "category": category,
            "layout_style": layout_style,
            "color_palette": color_palette
        }
    except Exception as e:
        print("Analysis failed, using defaults:", e)
        return {
            "category": "General Report",
            "layout_style": "corporate",
            "color_palette": "Corporate Blue"
        }
