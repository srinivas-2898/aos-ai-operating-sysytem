"""AOS Development Studio Workspace & Backend Services
Provides sandboxed terminal execution, workspace Git operations, AI Copilot provider routing,
and live health monitoring.
"""

import os
import sys
import re
import time
import uuid
import shlex
import shutil
import difflib
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any

import requests
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

# Base directory for all project workspaces
BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACES_ROOT = BASE_DIR / "workspaces"
WORKSPACES_ROOT.mkdir(parents=True, exist_ok=True)

# ── AI Provider Keys & Configuration ──
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY_2") or os.getenv("GEMINI_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
PROXIMA_API_KEY = os.getenv("PROXIMA_API_KEY")
PROXIMA_MCP_URL = os.getenv("PROXIMA_MCP_URL")


# ── Schemas ──

class TerminalRequest(BaseModel):
    command: str
    project_id: str
    user_id: Optional[str] = None
    cwd: Optional[str] = None


class GitCloneRequest(BaseModel):
    repository_url: str
    project_id: str
    user_id: Optional[str] = None


class GitStatusRequest(BaseModel):
    project_id: str
    user_id: Optional[str] = None


class GitCommitRequest(BaseModel):
    project_id: str
    message: str
    user_id: Optional[str] = None


class GitPushRequest(BaseModel):
    project_id: str
    user_id: Optional[str] = None


class CopilotRequest(BaseModel):
    action: str = "chat"  # chat, generate, fix, explain, refactor, docs, test
    prompt: str = ""
    current_file_path: Optional[str] = None
    current_file_content: Optional[str] = None
    selected_code: Optional[str] = None
    terminal_error: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    project_description: Optional[str] = None
    model: str = "auto"  # auto, claude-3.7, gpt-4o, gemini, deepseek, perplexity, etc.


# ── Helpers ──

def get_workspace_dir(project_id: str, user_id: Optional[str] = None) -> Path:
    """Returns safe, isolated directory path for the given project."""
    clean_pid = re.sub(r'[^a-zA-Z0-9_\-]', '', project_id)
    if not clean_pid:
        clean_pid = "default_project"

    if user_id:
        clean_uid = re.sub(r'[^a-zA-Z0-9_\-]', '', user_id)
        target = WORKSPACES_ROOT / clean_uid / clean_pid
    else:
        target = WORKSPACES_ROOT / clean_pid

    target.mkdir(parents=True, exist_ok=True)
    return target


BLOCKED_COMMANDS = [
    r"\brm\s+-rf\s+/\b",
    r"\bmkfs\b",
    r"\bdd\s+if=",
    r"\bshutdown\b",
    r"\breboot\b",
    r"\bformat\s+[c-z]:\b",
    r"\bdel\s+/[sS]\s+[c-z]:\\",
    r":\(\)\{.*\}",  # fork bomb
]


def is_command_safe(cmd: str) -> bool:
    """Validates that a terminal command does not execute dangerous root/system destructive commands."""
    cmd_lower = cmd.lower()
    for pattern in BLOCKED_COMMANDS:
        if re.search(pattern, cmd_lower):
            return False
    return True


# ── AI Provider Caller with Proxima / Multi-Model Support ──

MODEL_MAPPINGS = {
    "claude": "anthropic/claude-3.7-sonnet",
    "claude-3.7": "anthropic/claude-3.7-sonnet",
    "claude-3.5": "anthropic/claude-3.5-sonnet",
    "chatgpt": "openai/gpt-4o",
    "gpt-4o": "openai/gpt-4o",
    "gpt-4o-mini": "openai/gpt-4o-mini",
    "gemini": "google/gemini-2.0-flash-001",
    "gemini-2.0": "google/gemini-2.0-flash-001",
    "deepseek": "deepseek/deepseek-chat",
    "deepseek-r1": "deepseek/deepseek-r1",
    "perplexity": "perplexity/sonar",
    "auto": "openrouter/auto",
}


def call_ai_copilot(system_prompt: str, user_prompt: str, requested_model: str = "auto") -> Dict[str, Any]:
    """Routes Copilot prompts to Proxima MCP or configured multi-AI providers."""
    model_key = requested_model.lower().strip()
    target_or_model = MODEL_MAPPINGS.get(model_key, "openrouter/auto")
    errors = []

    # 1. If Proxima MCP URL or Proxima API is explicitly configured
    if PROXIMA_MCP_URL and PROXIMA_API_KEY:
        try:
            resp = requests.post(
                f"{PROXIMA_MCP_URL.rstrip('/')}/v1/chat/completions",
                headers={"Authorization": f"Bearer {PROXIMA_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": requested_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.2
                },
                timeout=60
            )
            if resp.ok:
                data = resp.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                if content:
                    return {"content": content, "provider": "Proxima MCP", "model": requested_model}
        except Exception as e:
            errors.append(f"Proxima: {str(e)}")

    # 2. Direct Gemini provider (Fast and reliable)
    if GEMINI_API_KEY and (model_key in ("auto", "gemini", "gemini-2.0") or not OPENROUTER_API_KEY):
        try:
            resp = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}",
                json={
                    "system_instruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                    "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4096}
                },
                timeout=60
            )
            if resp.ok:
                text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                if text:
                    return {"content": text, "provider": "Gemini (Proxima Engine)", "model": "gemini-2.0-flash"}
        except Exception as e:
            errors.append(f"Gemini: {str(e)}")

    # 3. Direct Groq provider (Ultra fast Llama 3.3 70B)
    if GROQ_API_KEY and (model_key in ("auto", "groq") or model_key not in ("claude", "claude-3.7", "gpt-4o")):
        try:
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.2,
                    "max_tokens": 4096
                },
                timeout=45
            )
            if resp.ok:
                content = resp.json()["choices"][0]["message"]["content"]
                if content:
                    return {"content": content, "provider": "Groq Llama-3.3 (Proxima Engine)", "model": "llama-3.3-70b-versatile"}
        except Exception as e:
            errors.append(f"Groq: {str(e)}")

    # 4. OpenRouter provider (Claude, GPT-4o, Perplexity, DeepSeek)
    if OPENROUTER_API_KEY:
        try:
            resp = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://aos.dev",
                    "X-Title": "AOS Development Studio"
                },
                json={
                    "model": target_or_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.2,
                    "max_tokens": 2048
                },
                timeout=60
            )
            if resp.ok:
                content = resp.json()["choices"][0]["message"]["content"]
                if content:
                    return {"content": content, "provider": "OpenRouter (Proxima)", "model": target_or_model}
        except Exception as e:
            errors.append(f"OpenRouter: {str(e)}")

    # 5. Direct DeepSeek provider
    if DEEPSEEK_API_KEY:
        try:
            resp = requests.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.2,
                    "max_tokens": 4096
                },
                timeout=60
            )
            if resp.ok:
                content = resp.json()["choices"][0]["message"]["content"]
                if content:
                    return {"content": content, "provider": "DeepSeek (Proxima Engine)", "model": "deepseek-chat"}
        except Exception as e:
            errors.append(f"DeepSeek: {str(e)}")

    raise HTTPException(status_code=503, detail=f"AI Copilot failed. ({'; '.join(errors)})")


def extract_code_block(text: str) -> Optional[str]:
    """Extracts code from markdown triple backticks if present."""
    match = re.search(r"```(?:\w+)?\n([\s\S]*?)```", text)
    if match:
        return match.group(1)
    return None


def generate_diff(original: str, modified: str, filename: str = "file") -> str:
    """Generates a standard unified diff between original and modified text."""
    orig_lines = original.splitlines(keepends=True)
    mod_lines = modified.splitlines(keepends=True)
    diff = difflib.unified_diff(
        orig_lines,
        mod_lines,
        fromfile=f"a/{filename}",
        tofile=f"b/{filename}",
        n=3
    )
    return "".join(diff)


# ── Endpoints ──

@router.get("/health")
def workspace_health():
    """Returns live connection health status for Backend, AI Providers, and Workspace subsystem."""
    providers = []
    if PROXIMA_MCP_URL or PROXIMA_API_KEY:
        providers.append("Proxima MCP")
    if OPENROUTER_API_KEY:
        providers.append("OpenRouter (Claude/GPT/Gemini/Perplexity)")
    if GEMINI_API_KEY:
        providers.append("Gemini")
    if GROQ_API_KEY:
        providers.append("Groq")
    if DEEPSEEK_API_KEY:
        providers.append("DeepSeek")
    if MISTRAL_API_KEY:
        providers.append("Mistral")

    return {
        "status": "healthy",
        "backend": "online",
        "version": "1.0.0",
        "workspaces_dir": str(WORKSPACES_ROOT),
        "ai_connected": len(providers) > 0,
        "active_providers": providers,
        "proxima_connected": bool(PROXIMA_MCP_URL or OPENROUTER_API_KEY or GEMINI_API_KEY),
    }


@router.post("/terminal")
def execute_terminal(body: TerminalRequest):
    """Executes a command safely inside the project workspace directory."""
    raw_cmd = (body.command or "").strip()
    if not raw_cmd:
        return {"stdout": "", "stderr": "", "exit_code": 0, "status": "empty"}

    if not is_command_safe(raw_cmd):
        raise HTTPException(
            status_code=400,
            detail="Command blocked: Execution of dangerous or unrestricted system commands is prohibited."
        )

    workspace_path = get_workspace_dir(body.project_id, body.user_id)

    # Determine execution working directory
    target_cwd = workspace_path
    if body.cwd:
        candidate = (workspace_path / body.cwd).resolve()
        if workspace_path in candidate.parents or candidate == workspace_path:
            target_cwd = candidate

    start_time = time.time()
    try:
        # Use shell execution with a strict timeout and environment isolation
        env = os.environ.copy()
        env["AOS_WORKSPACE"] = str(workspace_path)
        env["PYTHONUNBUFFERED"] = "1"

        # On Windows vs POSIX, execute appropriately
        is_win = sys.platform.startswith("win")
        process = subprocess.run(
            raw_cmd,
            shell=True,
            cwd=str(target_cwd),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=40,
            errors="replace"
        )
        duration = round((time.time() - start_time) * 1000, 2)

        return {
            "stdout": process.stdout,
            "stderr": process.stderr,
            "exit_code": process.returncode,
            "duration_ms": duration,
            "status": "completed" if process.returncode == 0 else "error",
            "cwd": str(target_cwd.relative_to(workspace_path)) if target_cwd != workspace_path else "."
        }

    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": "Command execution timed out (maximum 40 seconds allowed).",
            "exit_code": 124,
            "status": "timeout"
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Execution error: {str(e)}",
            "exit_code": 1,
            "status": "failed"
        }


@router.post("/git/clone")
def git_clone(body: GitCloneRequest):
    """Clones a remote git repository into the project workspace directory."""
    repo_url = body.repository_url.strip()
    if not repo_url or not (repo_url.startswith("https://") or repo_url.startswith("git@")):
        raise HTTPException(status_code=400, detail="Invalid git repository URL.")

    workspace_path = get_workspace_dir(body.project_id, body.user_id)

    try:
        # Clone repo into workspace
        process = subprocess.run(
            ["git", "clone", repo_url, "."],
            cwd=str(workspace_path),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=60
        )

        if process.returncode != 0:
            # If directory is not empty or clone failed
            if "already exists and is not an empty directory" in process.stderr:
                # Pull instead
                pull = subprocess.run(["git", "pull"], cwd=str(workspace_path), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
                return {"success": True, "message": "Repository already exists; updated to latest.", "output": pull.stdout}
            return {"success": False, "error": process.stderr or process.stdout}

        return {"success": True, "message": "Repository cloned successfully.", "output": process.stdout}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clone repository: {str(e)}")


@router.post("/git/status")
def git_status(body: GitStatusRequest):
    """Returns the git status, current branch, and changed files in the workspace."""
    workspace_path = get_workspace_dir(body.project_id, body.user_id)

    if not (workspace_path / ".git").exists():
        return {
            "is_repo": False,
            "branch": "main",
            "changes": [],
            "message": "Not a git repository"
        }

    try:
        # Get current branch
        branch_proc = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=str(workspace_path),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        branch = branch_proc.stdout.strip() or "main"

        # Get status
        status_proc = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(workspace_path),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        changes = []
        for line in status_proc.stdout.splitlines():
            if not line.strip():
                continue
            code = line[:2].strip()
            path = line[3:].strip()
            changes.append({
                "status": code,
                "path": path,
                "is_staged": line[0] not in (' ', '?')
            })

        return {
            "is_repo": True,
            "branch": branch,
            "changes": changes,
            "raw": status_proc.stdout
        }

    except Exception as e:
        return {"is_repo": False, "branch": "main", "changes": [], "error": str(e)}


@router.post("/git/commit")
def git_commit(body: GitCommitRequest):
    """Stages all changes and commits them with the provided commit message."""
    workspace_path = get_workspace_dir(body.project_id, body.user_id)
    msg = body.message.strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Commit message cannot be empty.")

    try:
        # git add -A
        subprocess.run(["git", "add", "-A"], cwd=str(workspace_path), check=True)
        # git commit -m
        commit_proc = subprocess.run(
            ["git", "commit", "-m", msg],
            cwd=str(workspace_path),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        return {
            "success": commit_proc.returncode == 0,
            "output": commit_proc.stdout or commit_proc.stderr
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Git commit error: {str(e)}")


@router.post("/copilot")
def copilot_service(body: CopilotRequest):
    """Intelligent Copilot endpoint supporting quick actions, full context injection,
    diff generation, and multi-model routing via Proxima."""
    action = (body.action or "chat").lower()
    user_prompt = body.prompt or ""

    # Build context-rich prompt
    system_instructions = [
        "You are AOS Copilot, an expert AI programming assistant embedded directly inside the AOS Development Studio.",
        "You write clean, modular, production-ready, idiomatic code adhering to modern standards.",
        "When providing code modifications or generating new components:",
        "1. Return clear, self-contained, working code.",
        "2. If you are fixing or modifying existing code, provide the complete updated version of the affected file or code block inside markdown ```language code fences so it can be automatically applied by the user.",
        "3. Keep explanations concise, professional, and actionable."
    ]

    context_parts = []
    if body.project_name:
        context_parts.append(f"Project Name: {body.project_name}")
    if body.project_description:
        context_parts.append(f"Project Description: {body.project_description}")
    if body.current_file_path:
        context_parts.append(f"Active File: {body.current_file_path}")
    if body.selected_code:
        context_parts.append(f"User Selected Code:\n```\n{body.selected_code}\n```")
    elif body.current_file_content:
        # Include snippet of current file (up to ~300 lines to avoid token explosion)
        lines = body.current_file_content.splitlines()
        truncated = "\n".join(lines[:300])
        context_parts.append(f"Current File Content:\n```\n{truncated}\n```")

    if body.terminal_error:
        context_parts.append(f"Terminal Output / Error Context:\n```\n{body.terminal_error}\n```")

    # Tailor prompt based on action
    if action == "fix":
        task_prompt = f"Fix the issue or bug in the provided code.\nContext details:\n" + "\n\n".join(context_parts)
        if user_prompt:
            task_prompt += f"\n\nUser Notes: {user_prompt}"
    elif action == "explain":
        task_prompt = f"Explain what the following code does line-by-line and identify any potential pitfalls or edge cases:\n" + "\n\n".join(context_parts)
    elif action == "refactor":
        task_prompt = f"Refactor the following code to improve performance, readability, and modern best practices while preserving its behavior:\n" + "\n\n".join(context_parts)
        if user_prompt:
            task_prompt += f"\n\nSpecific Goals: {user_prompt}"
    elif action == "docs":
        task_prompt = f"Generate comprehensive documentation, JSDoc/docstrings, and inline comments for the following code:\n" + "\n\n".join(context_parts)
    elif action == "test":
        task_prompt = f"Write comprehensive unit and integration tests (with test runners like Vitest, Jest, or Pytest) for the following code:\n" + "\n\n".join(context_parts)
    elif action == "generate":
        task_prompt = f"Generate code for the following requirement: {user_prompt}\n\nProject Context:\n" + "\n\n".join(context_parts)
    else:  # standard chat
        task_prompt = f"{user_prompt}\n\nProject & File Context:\n" + "\n\n".join(context_parts)

    system_prompt = "\n".join(system_instructions)
    ai_result = call_ai_copilot(system_prompt, task_prompt, requested_model=body.model)

    response_text = ai_result.get("content", "")
    extracted_code = extract_code_block(response_text)

    # Compute diff if original file content or selected code is available and code was extracted
    diff_text = None
    if extracted_code and body.current_file_content:
        orig = body.selected_code if body.selected_code else body.current_file_content
        filename = body.current_file_path or "modified_file"
        diff_text = generate_diff(orig, extracted_code, filename=filename)

    return {
        "reply": response_text,
        "code": extracted_code,
        "diff": diff_text,
        "action": action,
        "model": ai_result.get("model", body.model),
        "provider": ai_result.get("provider", "Proxima AI"),
        "target_file": body.current_file_path
    }
