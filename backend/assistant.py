"""AOS AI Assistant Backend Services
Provides intent detection, project context assembly, database persistence, and action verification.
"""

import os
import re
import json
import requests
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel

router = APIRouter(prefix="/api/assistant", tags=["assistant"])

# ── Helpers & Supabase client operations (Reused from github_oauth.py) ──

def cfg(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise HTTPException(503, f"{name} is not configured on the server.")
    return value


def service_headers(token: Optional[str] = None) -> Dict[str, str]:
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if service_key:
        return {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json"
        }
    
    # Fallback to user session token and anon key
    anon_key = cfg("SUPABASE_ANON_KEY")
    headers = {
        "apikey": anon_key,
        "Content-Type": "application/json"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    else:
        headers["Authorization"] = f"Bearer {anon_key}"
    return headers


def rest(path: str, method: str = "GET", payload: Any = None, params: Any = None, extra_headers: Any = None, token: Optional[str] = None) -> Any:
    headers = service_headers(token)
    if extra_headers:
        headers.update(extra_headers)
    
    url = f"{cfg('SUPABASE_URL').rstrip('/')}/rest/v1/{path}"
    response = requests.request(method, url, headers=headers, json=payload, params=params, timeout=30)
    
    if not response.ok:
        try:
            detail = response.json().get("message") or response.json().get("hint") or response.text
        except ValueError:
            detail = response.text
        raise HTTPException(502, f"Supabase request failed: {detail[:300]}")
    
    return response.json() if response.content else None


def current_user(request: Request) -> str:
    token = request.headers.get("authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(401, "Sign in is required.")
    
    url = f"{cfg('SUPABASE_URL').rstrip('/')}/auth/v1/user"
    response = requests.get(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": cfg('SUPABASE_ANON_KEY')
        },
        timeout=20
    )
    if not response.ok:
        raise HTTPException(401, "Invalid Supabase session.")
    return response.json()["id"]


def verify_project_ownership(user_id: str, project_id: str, token: Optional[str] = None) -> Dict[str, Any]:
    rows = rest("projects", params={"id": f"eq.{project_id}", "user_id": f"eq.{user_id}", "select": "*"}, token=token)
    if not rows:
        raise HTTPException(403, "Access denied. You do not own this project workspace.")
    return rows[0]


# ── AI Reasoning Engine (Reused and adapted from main.py / app.py) ──

def call_ai_provider(system_prompt: str, user_prompt: str) -> str:
    """Executes structured query against configured core LLMs, preferring JSON output."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    failures = []

    # Get credentials
    gemini_key = os.getenv("GEMINI_API_KEY_2") or os.getenv("GEMINI_API_KEY")
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    openrouter_model = os.getenv("OPENROUTER_MODEL", "openrouter/auto")
    groq_key = os.getenv("GROQ_API_KEY")
    groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")

    def openai_compatible(url: str, api_key: str, model: str) -> str:
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": 2048,
            "temperature": 0.2,
            "response_format": {"type": "json_object"}
        }
        res = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=45
        )
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"]

    # Try DeepSeek first (as preferred in main.py)
    if deepseek_key:
        try:
            return openai_compatible("https://api.deepseek.com/v1/chat/completions", deepseek_key, "deepseek-chat")
        except Exception as e:
            failures.append(f"DeepSeek: {type(e).__name__}")

    # Fallback to Gemini
    if gemini_key:
        try:
            # We supply formatting constraints directly in system instruction
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent"
            response = requests.post(
                url,
                params={"key": gemini_key},
                json={
                    "system_instruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                    "generationConfig": {
                        "temperature": 0.2,
                        "maxOutputTokens": 2048,
                        "responseMimeType": "application/json"
                    }
                },
                timeout=45
            )
            response.raise_for_status()
            return response.json()["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as e:
            failures.append(f"Gemini: {type(e).__name__}")

    # Fallback to OpenRouter
    if openrouter_key:
        try:
            return openai_compatible("https://openrouter.ai/api/v1/chat/completions", openrouter_key, openrouter_model)
        except Exception as e:
            failures.append(f"OpenRouter: {type(e).__name__}")

    # Fallback to Groq
    if groq_key:
        try:
            return openai_compatible("https://api.groq.com/openai/v1/chat/completions", groq_key, groq_model)
        except Exception as e:
            failures.append(f"Groq: {type(e).__name__}")

    raise HTTPException(
        status_code=502,
        detail=f"All AI reasoning cores failed to respond ({'; '.join(failures)}). Check keys and API status."
    )


# ── Endpoint Schemas ──

class AssistantMessageRequest(BaseModel):
    message: str
    project_id: Optional[str] = None
    chat_id: Optional[str] = None
    page: Optional[str] = 'dashboard'


class PreferencesRequest(BaseModel):
    voice_enabled: bool
    speech_enabled: bool
    welcome_enabled: bool
    preferred_language: str


class AssistantActionRequest(BaseModel):
    action_type: str
    project_id: Optional[str] = None
    payload: Dict[str, Any] = {}


# ── Routes ──

@router.post("/message")
async def assistant_message(body: AssistantMessageRequest, request: Request):
    user_id = current_user(request)
    token = request.headers.get("authorization", "").replace("Bearer ", "") or None
    
    # 1. Collect Project context if project_id is active
    project_ctx = None
    recent_messages = []
    deployments = []
    generations = []
    
    if body.project_id:
        try:
            project_info = verify_project_ownership(user_id, body.project_id, token=token)
            project_ctx = {
                "id": project_info["id"],
                "name": project_info["name"],
                "description": project_info["description"],
                "language": project_info.get("programming_language"),
                "framework": project_info.get("framework")
            }
            
            # Fetch recent chat log messages to build conversation history context
            if body.chat_id:
                recent_messages = rest(
                    "messages",
                    params={
                        "session_id": f"eq.{body.chat_id}",
                        "order": "created_at.desc",
                        "limit": "10"
                    },
                    token=token
                )
            
            # Fetch project deployments
            deployments = rest(
                "deployments",
                params={
                    "project_id": f"eq.{body.project_id}",
                    "order": "updated_at.desc",
                    "limit": "2"
                },
                token=token
            )

            # Fetch project unified generations
            generations = rest(
                "generation_files",
                params={
                    "project_id": f"eq.{body.project_id}",
                    "order": "created_at.desc",
                    "limit": "5"
                },
                token=token
            )
        except HTTPException as e:
            # If ownership query fails, we continue without project context to allow normal conversation
            if e.status_code == 403:
                raise e
            pass

    # 2. Construct System Prompt & Context for the AI reasoning agent
    context_data = {
        "user_id": user_id,
        "current_page": body.page,
        "project": project_ctx,
        "recent_chat_messages": [
            {"role": m.get("role"), "content": m.get("content")} for m in reversed(recent_messages or [])
        ],
        "active_deployments": [
            {"provider": d.get("provider"), "status": d.get("status"), "url": d.get("deployment_url")} for d in (deployments or [])
        ],
        "recent_generations": [
            {"title": g.get("title"), "type": g.get("generation_type"), "status": g.get("status")} for g in (generations or [])
        ]
    }

    system_prompt = f"""
You are the AOS AI Assistant core reasoning engine.
Your personality is intelligent, calm, professional, futuristic, helpful, slightly witty, concise, and natural.
Your primary role is to assist the user inside their AI Operating System, answering questions AND outputting structured commands (actions) when the user wants to navigate the OS, perform creation tasks, or run generators.

Core Directives:
1. For general or silly queries, answer normally. Do not return any specific action structure.
2. For navigation or generation requests (e.g. "open generation studio", "generate UI", "show deployments", "go to ide"), match it to the correct INTENT and construct a structured ACTION object.
3. Use the provided project context. If the user refers to "this", "my project", "generate UI for this project", refer to the active project name and ID in the context.
4. Dangerous operations (DELETE_PROJECT, DELETE_CHAT, DELETE_FILE, DEPLOY_PRODUCTION) must set "requires_confirmation": true.
5. IMPORTANT: The following intents REQUIRE an active project context: OPEN_CHAT, NEW_CHAT, OPEN_GENERATION_STUDIO, GENERATE_UI, GENERATE_IMAGE, GENERATE_VIDEO, GENERATE_PDF, GENERATE_DOCUMENT, GENERATE_PPT, OPEN_DEVELOPMENT_STUDIO, RUN_CODE, CREATE_FILE, EDIT_FILE, BUILD_PROJECT. If the user requests one of these but there is NO active project in the context, still return the intent and action but set "project_required": true in the action object so the frontend can prompt the user to select a project first.
6. When user says "show my projects", "list projects", "existing projects", or similar, return intent LIST_PROJECTS.
7. When the user describes a new project they want to create (e.g., "Create a React and Python project called E-commerce Website for selling clothes"), detect the intent as CREATE_PROJECT, and populate the action payload with the extracted fields:
   - "name": (the name of the project, e.g. "E-commerce Website")
   - "description": (a brief summary of what the project does)
   - "language": (the programming language, e.g. "Python", "TypeScript", or "JavaScript")
   - "framework": (the framework, e.g. "React", "Django", "FastAPI")
   Make sure the reply field is a friendly message confirming the creation, e.g. "Creating project E-commerce Website now."

List of valid intents:
- OPEN_CHAT
- NEW_CHAT
- LIST_PROJECTS
- SHOW_PROJECTS
- CREATE_PROJECT
- OPEN_PROJECT
- SEARCH_PROJECT
- OPEN_GENERATION_STUDIO
- GENERATE_UI
- GENERATE_IMAGE
- GENERATE_VIDEO
- GENERATE_PDF
- GENERATE_DOCUMENT
- GENERATE_PPT
- OPEN_DEVELOPMENT_STUDIO
- OPEN_DEPLOYMENT_STUDIO
- SHOW_DEPLOYMENTS
- OPEN_SETTINGS
- OPEN_GITHUB
- CREATE_GITHUB_REPOSITORY
- DEPLOY_PROJECT
- RUN_CODE
- CREATE_FILE
- EDIT_FILE
- BUILD_PROJECT
- DELETE_PROJECT
- DELETE_CHAT
- DELETE_FILE
- DEPLOY_PRODUCTION

RESPONSE FORMAT:
You MUST respond with a single valid JSON object containing exactly these fields:
{{
  "reply": "Friendly response string (keep it brief, under 2 sentences, ready for speech Synthesis)",
  "intent": "INTENT_NAME_HERE" or "NORMAL_CONVERSATION",
  "action": {{
    "type": "INTENT_NAME_HERE",
    "project_id": "current_project_id_if_applicable",
    "requires_confirmation": false,
    "project_required": false,
    "payload": {{}} // any relevant parameters (e.g. prompt text, new project name, file path, etc)
  }} or null
}}
"""

    user_query = f"""
Current Context JSON:
{json.dumps(context_data, indent=2)}

User Prompt: "{body.message}"
"""

    # 3. Call AI reasoning
    ai_raw_response = call_ai_provider(system_prompt, user_query)
    
    # Intents that require an active project to function
    PROJECT_SCOPED_INTENTS = {
        "OPEN_CHAT", "NEW_CHAT", "OPEN_GENERATION_STUDIO",
        "GENERATE_UI", "GENERATE_IMAGE", "GENERATE_VIDEO",
        "GENERATE_PDF", "GENERATE_DOCUMENT", "GENERATE_PPT",
        "OPEN_DEVELOPMENT_STUDIO", "RUN_CODE", "CREATE_FILE",
        "EDIT_FILE", "BUILD_PROJECT"
    }

    try:
        # Clean response markup if any
        cleaned = re.sub(r"^```json\s*", "", ai_raw_response.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)
        response_json = json.loads(cleaned)
        
        # Verify action permissions if the AI tried to trigger a project-scoped action
        action = response_json.get("action")
        if action and action.get("project_id"):
            # Ensure the user actually owns the project they are targeting
            verify_project_ownership(user_id, action["project_id"], token=token)
        
        # Auto-set project_required if action needs a project but none is active
        if action and action.get("type") in PROJECT_SCOPED_INTENTS and not body.project_id:
            action["project_required"] = True
            response_json["reply"] = "Please select an existing project or create a new project."
            
        return response_json
    except Exception as e:
        print("Parsing assistant response error:", e, "Raw output was:", ai_raw_response)
        return {
            "reply": "I encountered an error parsing my internal instruction set.",
            "intent": "NORMAL_CONVERSATION",
            "action": None
        }


@router.post("/action")
async def assistant_action(body: AssistantActionRequest, request: Request):
    """Executes a backed action requested by the assistant (e.g., project modifications)."""
    user_id = current_user(request)
    token = request.headers.get("authorization", "").replace("Bearer ", "") or None
    
    # 1. Project creation
    if body.action_type == "CREATE_PROJECT":
        name = body.payload.get("name")
        description = body.payload.get("description") or "Created by AOS AI Assistant"
        if not name:
            raise HTTPException(400, "Project name is required to execute creation.")
        
        new_project = rest(
            "projects",
            method="POST",
            payload={
                "user_id": user_id,
                "name": name,
                "description": description,
                "programming_language": body.payload.get("language") or "Python",
                "framework": body.payload.get("framework") or "FastAPI"
            },
            extra_headers={"Prefer": "return=representation"},
            token=token
        )
        return {"success": True, "project": new_project[0] if new_project else {}}
        
    # 2. Verified Project Deletion (requires confirmation check)
    elif body.action_type == "DELETE_PROJECT":
        if not body.project_id:
            raise HTTPException(400, "Project ID is required for deletion.")
        
        # Verify ownership
        verify_project_ownership(user_id, body.project_id, token=token)
        
        # Perform deletion
        rest(
            "projects",
            method="DELETE",
            params={"id": f"eq.{body.project_id}"},
            token=token
        )
        return {"success": True, "message": "Project deleted successfully."}
        
    raise HTTPException(400, f"Unsupported action type: {body.action_type}")


@router.get("/projects")
async def list_user_projects(request: Request):
    """Returns all projects belonging to the authenticated user, for voice readout."""
    user_id = current_user(request)
    token = request.headers.get("authorization", "").replace("Bearer ", "") or None
    rows = rest(
        "projects",
        params={
            "user_id": f"eq.{user_id}",
            "select": "id,name,description",
            "order": "last_opened_at.desc.nullslast"
        },
        token=token
    )
    # Filter out soft-deleted projects
    projects = [r for r in (rows or []) if not (r.get("description") or "").startswith("[DELETED]")]
    return {"projects": projects}


@router.get("/preferences")
async def get_preferences(request: Request):
    user_id = current_user(request)
    token = request.headers.get("authorization", "").replace("Bearer ", "") or None
    rows = rest("assistant_preferences", params={"user_id": f"eq.{user_id}", "select": "*"}, token=token)
    if not rows:
        # Create default
        new_row = rest(
            "assistant_preferences",
            method="POST",
            payload={
                "user_id": user_id,
                "voice_enabled": True,
                "speech_enabled": True,
                "welcome_enabled": True,
                "preferred_language": "en-US"
            },
            extra_headers={"Prefer": "return=representation"},
            token=token
        )
        return new_row[0] if new_row else {}
    return rows[0]


@router.put("/preferences")
async def update_preferences(body: PreferencesRequest, request: Request):
    user_id = current_user(request)
    token = request.headers.get("authorization", "").replace("Bearer ", "") or None
    rows = rest(
        "assistant_preferences",
        method="POST",
        payload={
            "user_id": user_id,
            "voice_enabled": body.voice_enabled,
            "speech_enabled": body.speech_enabled,
            "welcome_enabled": body.welcome_enabled,
            "preferred_language": body.preferred_language
        },
        extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
        token=token
    )
    return rows[0] if rows else {}
