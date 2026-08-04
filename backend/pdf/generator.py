import json
import re
from datetime import date

def robust_json_loads(s: str) -> dict:
    s = s.strip()
    # Try finding the first '{' and the last '}'
    first_brace = s.find('{')
    last_brace = s.rfind('}')
    if first_brace != -1 and last_brace != -1:
        s = s[first_brace:last_brace+1]
    # Clean trailing commas inside arrays and objects
    s = re.sub(r',\s*([\]}])', r'\1', s)
    # Remove single line comments
    s = re.sub(r'^\s*//.*$', '', s, flags=re.MULTILINE)
    return json.loads(s)


def fallback_document(prompt: str, category: str, layout_style: str, color_palette: str) -> dict:
    """Return a real, readable document if an AI provider returns invalid JSON.

    A provider response must never be copied into a PDF as a raw code block.  It
    can contain partial JSON when a provider reaches its output limit, which is
    useful for diagnostics but not for an end user's document.
    """
    subject = re.sub(r'\s+', ' ', prompt).strip() or 'the requested topic'
    title = subject[:90].rstrip('.').title() or 'AOS Professional Report'
    overview = f"This {category.lower()} presents a structured starting point for {subject}. It is organized for clear review, practical decision-making, and future refinement. The content should be validated with project-specific facts before formal submission."
    sections = [
        ("Executive Overview", overview, "standard"),
        ("Purpose and Scope", f"The purpose of this document is to define the intended outcomes, audience, and boundaries for {subject}. A clear scope keeps the work focused and makes progress easier to assess. Stakeholders should agree on priorities before implementation begins.", "highlight_box"),
        ("Key Requirements", f"Successful delivery of {subject} depends on well-defined requirements, ownership, and measurable acceptance criteria. The team should record dependencies, risks, timelines, and review points. Each requirement should be traceable to a real user or business need.", "information_cards"),
        ("Implementation Approach", f"A phased approach is recommended for {subject}: plan the work, build the highest-value components, test results, and refine based on feedback. This sequence reduces uncertainty while keeping delivery visible to stakeholders. Decisions and changes should be documented throughout the process.", "standard"),
        ("Conclusion and Next Steps", f"The next step is to review this draft with the relevant stakeholders and add verified project details. Confirm owners, dates, resources, and evidence before publishing. With those additions, this document can serve as a professional submission-ready foundation.", "highlight_box"),
    ]
    return {
        "title": title,
        "subtitle": f"Professional {category} prepared for review",
        "author": "AOS AI Document Studio",
        "date": date.today().isoformat(),
        "category": category,
        "layout_style": layout_style,
        "color_palette": color_palette,
        "sections": [
            {
                "heading": heading,
                "paragraphs": [body],
                "layout_type": layout,
                "list_items": ["Define a measurable outcome and owner.", "Validate important facts before publication.", "Review progress with stakeholders regularly."],
                "quote_text": "", "quote_author": "", "timeline_items": [],
                "table_headers": [], "table_rows": [], "chart_type": "", "chart_title": "",
                "chart_labels": [], "chart_values": [], "code_content": "", "code_language": "",
                "cards": ([
                    {"title": "Scope", "content": "Keep deliverables aligned with the agreed objective."},
                    {"title": "Quality", "content": "Use review and validation before final submission."},
                ] if layout == "information_cards" else []),
            }
            for heading, body, layout in sections
        ],
        "references": [],
    }

def generate_document_json(prompt: str, category: str, layout_style: str, color_palette: str) -> dict:
    from main import call_deepseek
    """Generate structured document JSON content using DeepSeek."""
    system_prompt = f"""You are a professional document writer and UI designer.
Generate highly comprehensive and beautifully structured document content based on the user's prompt.
The document category is "{category}". The layout style is "{layout_style}". The color palette is "{color_palette}".

You MUST return ONLY valid JSON with this exact structure:
{{
  "title": "Main Document Title",
  "subtitle": "Sub-title or brief description",
  "author": "AOS AI Document Studio",
  "date": "{date.today().isoformat()}",
  "category": "{category}",
  "layout_style": "{layout_style}",
  "color_palette": "{color_palette}",
  "sections": [
    {{
      "heading": "Section Heading",
      "paragraphs": [
        "Paragraph 1 containing at least 4 detailed sentences.",
        "Paragraph 2 containing at least 3 detailed sentences."
      ],
      "layout_type": "standard", 
      "list_items": [],
      "quote_text": "",
      "quote_author": "",
      "timeline_items": [],
      "table_headers": [],
      "table_rows": [],
      "chart_type": "",
      "chart_title": "",
      "chart_labels": [],
      "chart_values": [],
      "code_content": "",
      "code_language": "",
      "cards": []
    }}
  ],
  "references": [
    "Reference item 1",
    "Reference item 2"
  ]
}}

Rules for layouts:
- Use "standard" for normal reading sections.
- Use "highlight_box" for sections emphasizing a key fact or warning (paragraphs will be styled in a box with a colored left border).
- Use "quote_card" to showcase a prominent statement/quote. Set "quote_text" and optionally "quote_author".
- Use "timeline" for chronological events, logs, histories, or step-by-step processes. Populate "timeline_items" as array of objects: {{"time": "Q1 2026", "description": "Details..."}}.
- Use "table" for comparing data or structured numbers. Populate "table_headers" and "table_rows".
- Use "chart" to visualize quantitative trends. Set "chart_type" ("bar", "pie", or "line"), "chart_title", "chart_labels" (array of strings), and "chart_values" (array of numbers).
- Use "code_block" ONLY if the user prompt explicitly requests programming code, CLI commands, scripts, or query syntax. NEVER use "code_block" to describe templates, design specifications, or structural lists. For descriptive text and lists, use "standard", "highlight_box", or "information_cards" layouts instead.
- Use "information_cards" for list of items/features. Populate "cards" as array of objects: {{"title": "Card Title", "content": "Card text details..."}}.

CRITICAL STRING RULES:
- Inside string values (like 'paragraphs', 'quote_text', 'subtitle', 'title', etc.), NEVER use raw double quotes ("). If you need to enclose words or show quotes, use single quotes (') instead. Do not escape double quotes; just use single quotes.

Generate exactly five sections. Each section must contain one or two concise paragraphs and at most four list items. Keep the full JSON response below 5,000 words. Do not use markdown fences. Avoid placeholders, truncated sentences, and invented citations."""

    response = call_deepseek(system_prompt, f"Generate professional content for: {prompt}", response_format="json")
    clean_response = response.strip()
    if clean_response.startswith("```"):
        clean_response = clean_response.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        
    try:
        content = robust_json_loads(clean_response)
        # Ensure correct schema structure is present
        if not isinstance(content.get("sections"), list):
            raise ValueError("Invalid format: sections is not a list")
        return content
    except Exception as e:
        print("Failed to parse AI document JSON; using polished document fallback:", e)
        return fallback_document(prompt, category, layout_style, color_palette)

from .analyzer import analyze_document_type
from .template_engine import build_html_document
from .renderer import render_html_to_pdf

def generate_professional_pdf(prompt: str, doc_type_override: str = None) -> tuple:
    """Orchestrate the entire professional PDF generation pipeline.
    
    Returns:
        (filepath, title)
    """
    analysis = analyze_document_type(prompt)
    if doc_type_override and doc_type_override.lower() not in {"pdf", "general"}:
        analysis["category"] = doc_type_override
        
    category = analysis["category"]
    layout_style = analysis["layout_style"]
    color_palette = analysis["color_palette"]
    
    print(f"Document analysis result: Category='{category}', Style='{layout_style}', Palette='{color_palette}'")
    
    doc_json = generate_document_json(prompt, category, layout_style, color_palette)
    html_content = build_html_document(doc_json)
    
    title = doc_json.get("title", "AOS Document")
    filepath = render_html_to_pdf(html_content, title, category)
    
    return filepath, title
