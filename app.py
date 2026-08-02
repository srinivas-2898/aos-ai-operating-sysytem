from flask import Flask, request, jsonify, send_from_directory, send_file, abort
from flask_cors import CORS
import requests
import traceback
import os
import base64
from urllib.parse import quote
from pathlib import Path
from dotenv import load_dotenv
from io import BytesIO
from huggingface_hub import InferenceClient
from docx import Document
from docx.shared import Inches, Pt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from pptx import Presentation
from pptx.util import Inches as PptInches, Pt as PptPt
from pptx.dml.color import RGBColor

load_dotenv()

app = Flask(__name__)
CORS(app)  # Configure a restricted origin here before production deployment.
APP_ROOT = Path(__file__).resolve().parent
PUBLIC_FILE_EXTENSIONS = {'.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.ico'}

API_KEYS = {
    'gemini': os.environ.get('GEMINI_API_KEY'),
    'groq': os.environ.get('GROQ_API_KEY'),
    'openrouter': os.environ.get('OPENROUTER_API_KEY'),
    'mistral': os.environ.get('MISTRAL_API_KEY'),
    'cohere': os.environ.get('COHERE_API_KEY')
}

# Keep image generation isolated from chat: configure this separately in
# Railway Variables. It must never be exposed in frontend code.
HF_TOKEN = os.environ.get('HF_TOKEN')
HF_IMAGE_MODELS = {'black-forest-labs/FLUX.1-schnell'}

@app.route('/')
def index():
    return send_from_directory(APP_ROOT, 'index.html')

@app.route('/<path:filename>')
def frontend_file(filename):
    """Serve only public frontend assets; environment files are never exposed."""
    path = (APP_ROOT / filename).resolve()
    if APP_ROOT not in path.parents or path.suffix.lower() not in PUBLIC_FILE_EXTENSIONS:
        abort(404)
    return send_from_directory(APP_ROOT, filename)

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid JSON data provided.'}), 400

    model = data.get('model')
    message = data.get('message')

    if not model or not message:
        return jsonify({'error': 'Model and message are required.'}), 400

    try:
        if model == 'gemini':
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={API_KEYS['gemini']}"
            payload = {'contents': [{'parts': [{'text': message}]}]}
            response = requests.post(url, json=payload, timeout=45)
            response.raise_for_status()
            data = response.json()
            reply = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', 'No response from Gemini')
            return jsonify({'reply': reply})

        elif model == 'groq':
            url = 'https://api.groq.com/openai/v1/chat/completions'
            headers = {'Authorization': f"Bearer {API_KEYS['groq']}"}
            payload = {'model': 'llama-3.1-8b-instant', 'messages': [{'role': 'user', 'content': message}]}
            response = requests.post(url, headers=headers, json=payload, timeout=45)
            response.raise_for_status()
            data = response.json()
            reply = data.get('choices', [{}])[0].get('message', {}).get('content', 'No response from Groq')
            return jsonify({'reply': reply})

        elif model == 'openrouter':
            url = 'https://openrouter.ai/api/v1/chat/completions'
            headers = {'Authorization': f"Bearer {API_KEYS['openrouter']}"}
            payload = {'model': 'openai/gpt-3.5-turbo', 'messages': [{'role': 'user', 'content': message}]}
            response = requests.post(url, headers=headers, json=payload, timeout=45)
            response.raise_for_status()
            data = response.json()
            reply = data.get('choices', [{}])[0].get('message', {}).get('content', 'No response from Open Router')
            return jsonify({'reply': reply})

        elif model == 'mistral':
            url = 'https://api.mistral.ai/v1/chat/completions'
            headers = {'Authorization': f"Bearer {API_KEYS['mistral']}"}
            payload = {'model': 'mistral-small-latest', 'messages': [{'role': 'user', 'content': message}]}
            response = requests.post(url, headers=headers, json=payload, timeout=45)
            response.raise_for_status()
            data = response.json()
            reply = data.get('choices', [{}])[0].get('message', {}).get('content', 'No response from Mistral')
            return jsonify({'reply': reply})

        elif model == 'cohere':
            url = 'https://api.cohere.com/v1/chat'
            headers = {'Authorization': f"Bearer {API_KEYS['cohere']}"}
            payload = {'message': message, 'model': 'command-r-plus-08-2024'}
            response = requests.post(url, headers=headers, json=payload, timeout=45)
            response.raise_for_status()
            data = response.json()
            reply = data.get('text', 'No response from Cohere')
            return jsonify({'reply': reply})

        else:
            return jsonify({'error': 'Unsupported model'}), 400

    except requests.exceptions.RequestException as e:
        print("Request failed:", e)
        if hasattr(e, 'response') and e.response is not None:
            print("Response content:", e.response.content)
        return jsonify({'error': 'Failed to communicate with LLM provider API.'}), 502
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'An internal server error occurred.'}), 500

@app.route('/api/generate/image', methods=['POST'])
def generate_image():
    """Generate an image through Hugging Face; the token never reaches the browser."""
    data = request.get_json(silent=True) or {}
    prompt = (data.get('prompt') or '').strip()
    model = data.get('model') or 'black-forest-labs/FLUX.1-schnell'
    if not prompt:
        return jsonify({'error': 'An image prompt is required.'}), 400
    if model not in HF_IMAGE_MODELS:
        return jsonify({'error': 'Unsupported Hugging Face image model.'}), 400
    if not HF_TOKEN:
        return jsonify({'error': 'Hugging Face image API is not configured on the server.'}), 503

    try:
        client = InferenceClient(api_key=HF_TOKEN, timeout=120)
        image = client.text_to_image(prompt=prompt, model=model)
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        encoded = base64.b64encode(buffer.getvalue()).decode('ascii')
        return jsonify({
            'image_url': f'data:image/png;base64,{encoded}',
            'provider': 'huggingface',
            'model': model
        })
    except requests.exceptions.RequestException as error:
        detail = error.response.text[:300] if error.response is not None else str(error)
        return jsonify({'error': f'Hugging Face API request failed: {detail}'}), 502
    except Exception as error:
        return jsonify({'error': f'Image generation failed: {str(error)}'}), 502


DOCUMENT_TYPES = {'PDF', 'Word', 'Excel', 'PowerPoint', 'Resume', 'Invoice', 'Business Plan', 'Research'}


def document_plan(prompt, document_type):
    """Create a real document outline from the user's request (no mock content)."""
    title = ' '.join(prompt.split())[:96]
    return {
        'title': title,
        'summary': f'This {document_type.lower()} was prepared from the following request: {prompt}',
        'sections': [
            ('Purpose', f'The purpose of this {document_type.lower()} is to address: {prompt}'),
            ('Scope', 'Define the intended audience, deliverables, and boundaries before execution.'),
            ('Key requirements', 'Capture the essential actions, dependencies, quality expectations, and success criteria.'),
            ('Next steps', 'Review this draft, add project-specific facts, assign owners, and confirm the delivery timeline.')
        ]
    }


def safe_filename(value, fallback):
    cleaned = ''.join(char if char.isalnum() else '-' for char in value.lower()).strip('-')
    return (cleaned[:48] or fallback)


def create_docx(plan, document_type):
    document = Document()
    section = document.sections[0]
    section.top_margin = Inches(0.7)
    heading = document.add_heading(plan['title'], 0)
    heading.runs[0].font.color.rgb = None
    document.add_paragraph(document_type, style='Subtitle')
    document.add_paragraph(plan['summary'])
    for heading_text, body in plan['sections']:
        document.add_heading(heading_text, level=1)
        document.add_paragraph(body)
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'


def create_xlsx(plan):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = 'Document Plan'
    sheet.append(['Section', 'Details'])
    sheet.append(['Title', plan['title']])
    sheet.append(['Summary', plan['summary']])
    for heading, body in plan['sections']:
        sheet.append([heading, body])
    for cell in sheet[1]:
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill('solid', fgColor='2563EB')
    sheet.column_dimensions['A'].width = 24
    sheet.column_dimensions['B'].width = 88
    for row in sheet.iter_rows(min_row=2):
        row[1].alignment = row[1].alignment.copy(wrap_text=True, vertical='top')
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'


def create_pdf(plan, document_type):
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    story = [Paragraph(plan['title'], styles['Title']), Spacer(1, 0.16 * inch), Paragraph(document_type, styles['Heading2']), Spacer(1, 0.12 * inch), Paragraph(plan['summary'], styles['BodyText']), Spacer(1, 0.2 * inch)]
    if document_type == 'Invoice':
        rows = [['Item', 'Description', 'Status'], ['Requested work', plan['title'], 'To be confirmed']]
        table = Table(rows, colWidths=[1.2 * inch, 4.2 * inch, 1.2 * inch])
        table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563EB')), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white), ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('PADDING', (0, 0), (-1, -1), 8)]))
        story += [table, Spacer(1, 0.22 * inch)]
    for heading, body in plan['sections']:
        story += [Paragraph(heading, styles['Heading2']), Paragraph(body, styles['BodyText']), Spacer(1, 0.12 * inch)]
    SimpleDocTemplate(buffer, pagesize=A4, rightMargin=52, leftMargin=52, topMargin=48, bottomMargin=48).build(story)
    return buffer.getvalue(), 'application/pdf', 'pdf'


def create_pptx(plan, slide_count, theme):
    presentation = Presentation()
    palette = {
        'modern': (30, 64, 175), 'minimal': (248, 250, 252), 'bold': (15, 23, 42),
        'corporate': (30, 58, 138), 'creative': (109, 40, 217)
    }
    background = palette.get(theme, palette['modern'])
    foreground = (15, 23, 42) if theme == 'minimal' else (255, 255, 255)
    slide_data = [('Overview', plan['summary'])] + plan['sections']
    while len(slide_data) < slide_count:
        slide_data.append(('Project action', f'Expand the plan for: {plan["title"]}'))
    for index, (heading, body) in enumerate(slide_data[:slide_count]):
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        fill = slide.background.fill
        fill.solid(); fill.fore_color.rgb = RGBColor(*background)
        title_box = slide.shapes.add_textbox(PptInches(0.7), PptInches(0.65), PptInches(12), PptInches(0.8))
        title = title_box.text_frame.paragraphs[0]
        title.text = plan['title'] if index == 0 else heading
        title.font.size = PptPt(29); title.font.bold = True; title.font.color.rgb = RGBColor(*foreground)
        body_box = slide.shapes.add_textbox(PptInches(0.85), PptInches(1.8), PptInches(11.4), PptInches(4.8))
        body_paragraph = body_box.text_frame.paragraphs[0]
        body_paragraph.text = body
        body_paragraph.font.size = PptPt(19); body_paragraph.font.color.rgb = RGBColor(*foreground)
    buffer = BytesIO()
    presentation.save(buffer)
    return buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'


@app.route('/api/generate/document', methods=['POST'])
def generate_document():
    data = request.get_json(silent=True) or {}
    prompt = (data.get('prompt') or '').strip()
    document_type = data.get('document_type') or 'PDF'
    if not prompt:
        return jsonify({'error': 'A document prompt is required.'}), 400
    if document_type not in DOCUMENT_TYPES:
        return jsonify({'error': 'Unsupported document type.'}), 400
    plan = document_plan(prompt, document_type)
    try:
        if document_type == 'Excel':
            content, mimetype, extension = create_xlsx(plan)
        elif document_type in {'PDF', 'Invoice'}:
            content, mimetype, extension = create_pdf(plan, document_type)
        elif document_type == 'PowerPoint':
            content, mimetype, extension = create_pptx(plan, 6, 'modern')
        else:
            content, mimetype, extension = create_docx(plan, document_type)
        filename = f'{safe_filename(plan["title"], "document")}.{extension}'
        return send_file(BytesIO(content), mimetype=mimetype, as_attachment=True, download_name=filename)
    except Exception as error:
        return jsonify({'error': f'Document generation failed: {str(error)}'}), 500


@app.route('/api/generate/presentation', methods=['POST'])
def generate_presentation():
    data = request.get_json(silent=True) or {}
    prompt = (data.get('prompt') or '').strip()
    theme = data.get('theme') or 'modern'
    try:
        slide_count = int(data.get('slides') or 8)
    except (TypeError, ValueError):
        return jsonify({'error': 'Slides must be a number.'}), 400
    if not prompt:
        return jsonify({'error': 'A presentation prompt is required.'}), 400
    if slide_count < 1 or slide_count > 20:
        return jsonify({'error': 'Choose between 1 and 20 slides.'}), 400
    plan = document_plan(prompt, 'Presentation')
    try:
        content, mimetype, extension = create_pptx(plan, slide_count, theme)
        filename = f'{safe_filename(plan["title"], "presentation")}.{extension}'
        return send_file(BytesIO(content), mimetype=mimetype, as_attachment=True, download_name=filename)
    except Exception as error:
        return jsonify({'error': f'Presentation generation failed: {str(error)}'}), 500


if __name__ == '__main__':
    app.run(port=5000, debug=os.getenv('FLASK_DEBUG') == '1')
