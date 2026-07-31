from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import traceback
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests

API_KEYS = {
    'gemini': os.environ.get('GEMINI_API_KEY'),
    'groq': os.environ.get('GROQ_API_KEY'),
    'openrouter': os.environ.get('OPENROUTER_API_KEY'),
    'mistral': os.environ.get('MISTRAL_API_KEY'),
    'cohere': os.environ.get('COHERE_API_KEY')
}

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid JSON data provided.'}), 400

    model = data.get('model')
    message = data.get('message')

    if not model or not message:
        return jsonify({'error': 'Model and message are required.'}), 400

    try:
        if model == 'gemini':
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={API_KEYS['gemini']}"
            payload = {'contents': [{'parts': [{'text': message}]}]}
            response = requests.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            reply = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', 'No response from Gemini')
            return jsonify({'reply': reply})

        elif model == 'groq':
            url = 'https://api.groq.com/openai/v1/chat/completions'
            headers = {'Authorization': f"Bearer {API_KEYS['groq']}"}
            payload = {'model': 'llama3-8b-8192', 'messages': [{'role': 'user', 'content': message}]}
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            reply = data.get('choices', [{}])[0].get('message', {}).get('content', 'No response from Groq')
            return jsonify({'reply': reply})

        elif model == 'openrouter':
            url = 'https://openrouter.ai/api/v1/chat/completions'
            headers = {'Authorization': f"Bearer {API_KEYS['openrouter']}"}
            payload = {'model': 'openai/gpt-3.5-turbo', 'messages': [{'role': 'user', 'content': message}]}
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            reply = data.get('choices', [{}])[0].get('message', {}).get('content', 'No response from Open Router')
            return jsonify({'reply': reply})

        elif model == 'mistral':
            url = 'https://api.mistral.ai/v1/chat/completions'
            headers = {'Authorization': f"Bearer {API_KEYS['mistral']}"}
            payload = {'model': 'mistral-small-latest', 'messages': [{'role': 'user', 'content': message}]}
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            reply = data.get('choices', [{}])[0].get('message', {}).get('content', 'No response from Mistral')
            return jsonify({'reply': reply})

        elif model == 'cohere':
            url = 'https://api.cohere.com/v1/chat'
            headers = {'Authorization': f"Bearer {API_KEYS['cohere']}"}
            payload = {'message': message, 'model': 'command-r-plus'}
            response = requests.post(url, headers=headers, json=payload)
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

if __name__ == '__main__':
    app.run(port=5000, debug=True)
