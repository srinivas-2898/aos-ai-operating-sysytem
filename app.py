from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
import requests
import traceback
import os
import base64
from urllib.parse import quote
from pathlib import Path
from dotenv import load_dotenv

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

IMAGE_API_KEYS = {
    'pollinations': os.environ.get('POLLINATIONS_API_KEY'),
    'huggingface': os.environ.get('HF_TOKEN'),
    'stability': os.environ.get('STABILITY_API_KEY'),
    'fal': os.environ.get('FAL_KEY')
}

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
    """Generate an image through a server-side provider; provider keys never reach the browser."""
    data = request.get_json(silent=True) or {}
    prompt = (data.get('prompt') or '').strip()
    # Pollinations is the default hosted image provider. Its secret stays only
    # on the server as POLLINATIONS_API_KEY.
    provider = data.get('provider') or 'pollinations'
    model = data.get('model') or ''
    if not prompt:
        return jsonify({'error': 'An image prompt is required.'}), 400
    if provider not in IMAGE_API_KEYS:
        return jsonify({'error': 'Unsupported image provider.'}), 400
    if not IMAGE_API_KEYS[provider]:
        return jsonify({'error': f'{provider.title()} is not configured on the server.'}), 503

    try:
        if provider == 'pollinations':
            selected_model = model or 'flux'
            response = requests.get(
                f"https://gen.pollinations.ai/image/{quote(prompt, safe='')}?model={quote(selected_model)}",
                headers={'Authorization': f"Bearer {IMAGE_API_KEYS['pollinations']}"}, timeout=90
            )
            response.raise_for_status()
            content_type = response.headers.get('content-type', 'image/jpeg').split(';')[0]
            encoded = base64.b64encode(response.content).decode('ascii')
            return jsonify({'image_url': f'data:{content_type};base64,{encoded}', 'provider': 'pollinations', 'model': selected_model})

        if provider == 'fal':
            selected_model = model or 'fal-ai/flux/schnell'
            response = requests.post(
                f'https://fal.run/{selected_model}',
                headers={'Authorization': f"Key {IMAGE_API_KEYS['fal']}", 'Content-Type': 'application/json'},
                json={'prompt': prompt, 'num_images': 1, 'image_size': 'square_hd', 'enable_safety_checker': True},
                timeout=90
            )
            response.raise_for_status()
            image_url = (response.json().get('images') or [{}])[0].get('url')
            if not image_url:
                raise ValueError('fal did not return an image URL.')
            return jsonify({'image_url': image_url, 'provider': 'fal', 'model': selected_model})

        if provider == 'stability':
            response = requests.post(
                'https://api.stability.ai/v2beta/stable-image/generate/core',
                headers={'authorization': f"Bearer {IMAGE_API_KEYS['stability']}", 'accept': 'image/*'},
                files={'none': ''}, data={'prompt': prompt, 'output_format': 'webp'}, timeout=90
            )
            response.raise_for_status()
            encoded = base64.b64encode(response.content).decode('ascii')
            return jsonify({'image_url': f'data:image/webp;base64,{encoded}', 'provider': 'stability', 'model': 'stable-image-core'})

        # Hugging Face's official client handles provider routing for text-to-image.
        from huggingface_hub import InferenceClient
        from io import BytesIO
        client = InferenceClient(api_key=IMAGE_API_KEYS['huggingface'])
        selected_model = model or 'black-forest-labs/FLUX.1-dev'
        image = client.text_to_image(prompt=prompt, model=selected_model)
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        encoded = base64.b64encode(buffer.getvalue()).decode('ascii')
        return jsonify({'image_url': f'data:image/png;base64,{encoded}', 'provider': 'huggingface', 'model': selected_model})
    except requests.exceptions.RequestException as error:
        detail = error.response.text[:300] if error.response is not None else str(error)
        return jsonify({'error': f'Image provider request failed: {detail}'}), 502
    except Exception as error:
        return jsonify({'error': f'Image generation failed: {str(error)}'}), 502

if __name__ == '__main__':
    app.run(port=5000, debug=os.getenv('FLASK_DEBUG') == '1')
