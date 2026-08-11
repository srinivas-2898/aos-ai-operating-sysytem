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


class FileReadRequest(BaseModel):
    path: str
    project_id: Optional[str] = "default-project"
    user_id: Optional[str] = None


class FileSaveRequest(BaseModel):
    path: str
    content: str
    project_id: Optional[str] = "default-project"
    user_id: Optional[str] = None


class FileCreateRequest(BaseModel):
    path: str
    is_directory: bool = False
    content: Optional[str] = ""
    project_id: Optional[str] = "default-project"
    user_id: Optional[str] = None


class FileDeleteRequest(BaseModel):
    path: str
    project_id: Optional[str] = "default-project"
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
    """Returns safe, isolated directory path for the given project or workspace."""
    clean_pid = re.sub(r'[^a-zA-Z0-9_\-]', '', project_id or "default-project")
    if not clean_pid or clean_pid == "default-project" or clean_pid == "root":
        return BASE_DIR

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


# ── Proxima AI Provider Connection (http://localhost:3210) ──
PROXIMA_SERVER_URL = os.getenv("PROXIMA_SERVER_URL", "http://localhost:3210")

PROXIMA_MODEL_MAPPINGS = {
    "perplexity": "perplexity",
    "pplx": "perplexity",
    "sonar": "perplexity",
    "chatgpt": "chatgpt",
    "gpt-4o": "chatgpt",
    "gpt-4": "chatgpt",
    "openai": "chatgpt",
    "claude": "claude",
    "claude-3.5": "claude",
    "claude-3.7": "claude",
    "anthropic": "claude",
    "gemini": "gemini",
    "gemini-1.5": "gemini",
    "gemini-2.0": "gemini",
    "google": "gemini",
    "auto": "perplexity",
}


def call_ai_copilot(system_prompt: str, user_prompt: str, requested_model: str = "perplexity") -> Dict[str, Any]:
    """Exclusively routes Copilot prompts to the local Proxima server (http://localhost:3210)."""
    model_key = (requested_model or "perplexity").lower().strip()
    proxima_model = PROXIMA_MODEL_MAPPINGS.get(model_key, "perplexity")

    try:
        resp = requests.post(
            f"{PROXIMA_SERVER_URL.rstrip('/')}/v1/chat/completions",
            headers={"Content-Type": "application/json"},
            json={
                "model": proxima_model,
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
                provider_info = data.get("proxima", {}).get("provider", proxima_model)
                return {
                    "content": content,
                    "provider": f"Proxima ({provider_info.title()})",
                    "model": proxima_model,
                    "success": True
                }
            else:
                return {
                    "content": "Proxima processed the request but returned an empty response. Please verify your logged-in provider in Proxima.",
                    "provider": "Proxima",
                    "model": proxima_model,
                    "success": False
                }
        else:
            return {
                "content": f"Proxima error ({resp.status_code}): {resp.text}",
                "provider": "Proxima",
                "model": proxima_model,
                "success": False
            }
    except requests.exceptions.ConnectionError:
        return {
            "content": f"Could not connect to Proxima server at {PROXIMA_SERVER_URL}. Please verify that the Proxima app is open with REST API enabled.",
            "provider": "Proxima (Offline)",
            "model": proxima_model,
            "success": False
        }
    except Exception as e:
        return {
            "content": f"Error communicating with Proxima: {str(e)}",
            "provider": "Proxima",
            "model": proxima_model,
            "success": False
        }

def extract_code_block(text: str) -> Optional[str]:
    """Extracts code from markdown triple backticks if present."""
    match = re.search(r"```(?:\w+)?\n([\s\S]*?)```", text)
    if match:
        return match.group(1)
    return None


def extract_generated_files(text: str, default_filename: Optional[str] = None, prompt_hint: Optional[str] = None) -> List[Dict[str, str]]:
    """Extracts multiple files with paths and contents from Proxima AI response text."""
    files = []
    
    # Check if prompt specifies a target filename like "create index.html" or "create a main.py"
    inferred_filename = default_filename
    if not inferred_filename and prompt_hint:
        fn_match = re.search(r'([a-zA-Z0-9_\-\.\/]+\.(?:html|css|js|ts|jsx|tsx|py|json|md|sql|sh|yaml|yml|rs|go|cpp|c|java))', prompt_hint, re.IGNORECASE)
        if fn_match:
            inferred_filename = fn_match.group(1).strip()

    # Pattern 1: ```language filename="path/file.ext" or ```html index.html
    fence_pattern = re.compile(
        r'```(?:[\w\.\-]+)?\s*(?:filename=["\']?([\w\.\-\/]+)["\']?|file:\s*([\w\.\-\/]+)|([\w\.\-\/]+\.[a-zA-Z0-9]+))?\s*\n(.*?)```',
        re.DOTALL
    )
    for match in fence_pattern.finditer(text):
        fn = match.group(1) or match.group(2) or match.group(3)
        content = match.group(4).strip()
        if fn and content:
            files.append({"path": fn.strip(), "content": content})
        elif content and inferred_filename and not files:
            files.append({"path": inferred_filename, "content": content})

    # Pattern 2: Header markers like "FILE: index.html" or "### index.html" before a code fence
    if not files:
        header_pattern = re.compile(
            r'(?:FILE:|File:|###|\*\*)\s*([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)[\*\:]?\s*\n+```(?:[\w\.\-]+)?\s*\n(.*?)```',
            re.DOTALL
        )
        for m in header_pattern.finditer(text):
            fn = m.group(1).strip()
            content = m.group(2).strip()
            if fn and content:
                files.append({"path": fn, "content": content})

    # Pattern 3: Fallback single code block
    if not files:
        single = extract_code_block(text)
        if single and inferred_filename:
            files.append({"path": inferred_filename, "content": single.strip()})

    return files


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


def scan_dir_recursive(dir_path: Path, base_path: Path, max_depth: int = 6, current_depth: int = 0) -> List[Dict[str, Any]]:
    """Recursively scans directory into structured tree."""
    if current_depth > max_depth:
        return []

    IGNORE_PATTERNS = {
        '.git', 'node_modules', '__pycache__', '.venv', 'venv', '.firebase',
        '.gemini', '.idea', '.vscode', '.next', 'dist', 'build', '.pytest_cache'
    }

    entries = []
    try:
        items = sorted(list(dir_path.iterdir()), key=lambda x: (not x.is_dir(), x.name.lower()))
        for item in items:
            if item.name in IGNORE_PATTERNS:
                continue

            rel_path = str(item.relative_to(base_path)).replace("\\", "/")
            if item.is_dir():
                children = scan_dir_recursive(item, base_path, max_depth, current_depth + 1)
                entries.append({
                    "name": item.name,
                    "path": rel_path,
                    "kind": "directory",
                    "children": children
                })
            else:
                try:
                    size = item.stat().st_size
                except Exception:
                    size = 0
                entries.append({
                    "name": item.name,
                    "path": rel_path,
                    "kind": "file",
                    "size": size
                })
    except Exception as e:
        pass

    return entries


@router.get("/files")
def get_workspace_files(project_id: str = "default-project", user_id: Optional[str] = None):
    """Returns the hierarchical file tree of the project workspace."""
    workspace_path = get_workspace_dir(project_id, user_id)
    tree = scan_dir_recursive(workspace_path, workspace_path)
    return {
        "project_id": project_id,
        "root_name": workspace_path.name or "AOS-AI-OPERATING-SYSTEM",
        "tree": tree
    }


@router.post("/file/read")
def read_workspace_file(body: FileReadRequest):
    """Reads file content from workspace."""
    workspace_path = get_workspace_dir(body.project_id, body.user_id)
    clean_rel = body.path.lstrip("/\\")
    file_path = (workspace_path / clean_rel).resolve()

    if workspace_path not in file_path.parents and file_path != workspace_path:
        raise HTTPException(status_code=403, detail="Access denied outside workspace root")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
        return {
            "path": body.path,
            "content": content,
            "size": file_path.stat().st_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")


@router.post("/file/save")
def save_workspace_file(body: FileSaveRequest):
    """Saves file content to workspace."""
    workspace_path = get_workspace_dir(body.project_id, body.user_id)
    clean_rel = body.path.lstrip("/\\")
    file_path = (workspace_path / clean_rel).resolve()

    if workspace_path not in file_path.parents and file_path != workspace_path:
        raise HTTPException(status_code=403, detail="Access denied outside workspace root")

    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(body.content, encoding="utf-8")
        return {
            "success": True,
            "path": body.path,
            "size": file_path.stat().st_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")


@router.post("/file/create")
def create_workspace_item(body: FileCreateRequest):
    """Creates a new file or directory in workspace."""
    workspace_path = get_workspace_dir(body.project_id, body.user_id)
    clean_rel = body.path.lstrip("/\\")
    target_path = (workspace_path / clean_rel).resolve()

    if workspace_path not in target_path.parents and target_path != workspace_path:
        raise HTTPException(status_code=403, detail="Access denied outside workspace root")

    try:
        if body.is_directory:
            target_path.mkdir(parents=True, exist_ok=True)
        else:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            if not target_path.exists():
                target_path.write_text(body.content or "", encoding="utf-8")
        return {"success": True, "path": body.path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create item: {str(e)}")


@router.post("/file/delete")
def delete_workspace_item(body: FileDeleteRequest):
    """Deletes a file or directory in workspace."""
    workspace_path = get_workspace_dir(body.project_id, body.user_id)
    clean_rel = body.path.lstrip("/\\")
    target_path = (workspace_path / clean_rel).resolve()

    if workspace_path not in target_path.parents:
        raise HTTPException(status_code=403, detail="Access denied outside workspace root")

    if not target_path.exists():
        return {"success": True}

    try:
        if target_path.is_dir():
            shutil.rmtree(target_path)
        else:
            target_path.unlink()
        return {"success": True, "path": body.path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete item: {str(e)}")



@router.post("/terminal")
def execute_terminal(body: TerminalRequest):
    """Executes a command safely inside the project workspace directory using PowerShell/Shell."""
    raw_cmd = (body.command or "").strip()
    workspace_path = get_workspace_dir(body.project_id, body.user_id)

    # Determine execution working directory
    target_cwd = workspace_path
    if body.cwd:
        candidate = Path(body.cwd)
        if not candidate.is_absolute():
            candidate = (workspace_path / body.cwd).resolve()
        if candidate.exists() and candidate.is_dir():
            target_cwd = candidate

    if not raw_cmd:
        return {
            "stdout": "",
            "stderr": "",
            "exit_code": 0,
            "status": "empty",
            "cwd": str(target_cwd),
            "rel_cwd": str(target_cwd.relative_to(workspace_path)) if target_cwd != workspace_path else "."
        }

    if not is_command_safe(raw_cmd):
        raise HTTPException(
            status_code=400,
            detail="Command blocked: Execution of dangerous or unrestricted system commands is prohibited."
        )

    # Handle built-in cd command
    if raw_cmd == "cd" or raw_cmd == "cd ~":
        target_cwd = workspace_path
        return {
            "stdout": "",
            "stderr": "",
            "exit_code": 0,
            "status": "completed",
            "cwd": str(target_cwd),
            "rel_cwd": "."
        }
    elif raw_cmd.startswith("cd "):
        target_arg = raw_cmd[3:].strip().strip('"').strip("'")
        new_target = (target_cwd / target_arg).resolve() if not Path(target_arg).is_absolute() else Path(target_arg)
        if new_target.exists() and new_target.is_dir():
            target_cwd = new_target
            return {
                "stdout": "",
                "stderr": "",
                "exit_code": 0,
                "status": "completed",
                "cwd": str(target_cwd),
                "rel_cwd": str(target_cwd.relative_to(workspace_path)) if target_cwd != workspace_path and target_cwd.is_relative_to(workspace_path) else str(target_cwd)
            }
        else:
            return {
                "stdout": "",
                "stderr": f"cd: {target_arg}: No such directory",
                "exit_code": 1,
                "status": "error",
                "cwd": str(target_cwd),
                "rel_cwd": str(target_cwd.relative_to(workspace_path)) if target_cwd != workspace_path and target_cwd.is_relative_to(workspace_path) else "."
            }

    start_time = time.time()
    try:
        env = os.environ.copy()
        env["AOS_WORKSPACE"] = str(workspace_path)
        env["PYTHONUNBUFFERED"] = "1"

        is_win = sys.platform.startswith("win")
        if is_win:
            # Use PowerShell for rich Windows CLI execution
            cmd_args = ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", raw_cmd]
            process = subprocess.run(
                cmd_args,
                cwd=str(target_cwd),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=45,
                errors="replace"
            )
        else:
            process = subprocess.run(
                raw_cmd,
                shell=True,
                cwd=str(target_cwd),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=45,
                errors="replace"
            )

        duration = round((time.time() - start_time) * 1000, 2)
        rel_cwd = "."
        try:
            if target_cwd != workspace_path and target_cwd.is_relative_to(workspace_path):
                rel_cwd = str(target_cwd.relative_to(workspace_path))
            else:
                rel_cwd = str(target_cwd)
        except Exception:
            rel_cwd = str(target_cwd)

        return {
            "stdout": process.stdout,
            "stderr": process.stderr,
            "exit_code": process.returncode,
            "duration_ms": duration,
            "status": "completed" if process.returncode == 0 else "error",
            "cwd": str(target_cwd),
            "rel_cwd": rel_cwd
        }

    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": "Command execution timed out (maximum 45 seconds allowed).",
            "exit_code": 124,
            "status": "timeout",
            "cwd": str(target_cwd),
            "rel_cwd": "."
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Execution error: {str(e)}",
            "exit_code": 1,
            "status": "failed",
            "cwd": str(target_cwd),
            "rel_cwd": "."
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
    generated_files = extract_generated_files(response_text, body.current_file_path, prompt_hint=body.prompt)

    # Automatically save generated files to project directory on disk
    created_files_info = []
    if generated_files:
        proj_name = body.project_name or body.project_id or "default"
        clean_proj = re.sub(r'[^a-zA-Z0-9_\-]', '_', proj_name)
        proj_dir = WORKSPACES_ROOT / clean_proj
        proj_dir.mkdir(parents=True, exist_ok=True)

        for gf in generated_files:
            file_rel = gf.get("path", "").lstrip("/\\")
            content = gf.get("content", "")
            if not file_rel:
                continue
            dest_file = proj_dir / file_rel
            dest_file.parent.mkdir(parents=True, exist_ok=True)
            with open(dest_file, "w", encoding="utf-8") as fp:
                fp.write(content)
            created_files_info.append({
                "path": file_rel,
                "content": content,
                "local_path": str(dest_file.resolve())
            })

    # Compute diff if original file content or selected code is available and code was extracted
    diff_text = None
    if extracted_code and body.current_file_content:
        orig = body.selected_code if body.selected_code else body.current_file_content
        filename = body.current_file_path or "modified_file"
        diff_text = generate_diff(orig, extracted_code, filename=filename)

    return {
        "reply": response_text,
        "code": extracted_code,
        "created_files": created_files_info,
        "diff": diff_text,
        "action": action,
        "model": ai_result.get("model", body.model),
        "provider": ai_result.get("provider", "Proxima"),
        "target_file": body.current_file_path
    }


class ProjectSyncRequest(BaseModel):
    project_id: str
    project_name: Optional[str] = "aos_project"
    files: Optional[List[Dict[str, Any]]] = None


@router.post("/sync_local_project")
def sync_local_project(req: ProjectSyncRequest):
    """Saves/creates the project folder and files onto the user's laptop/local machine."""
    clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', req.project_name or req.project_id)
    project_dir = WORKSPACES_ROOT / clean_name
    project_dir.mkdir(parents=True, exist_ok=True)

    saved_files = []
    if req.files:
        for f in req.files:
            file_path = f.get("path", "")
            content = f.get("content", "")
            if not file_path:
                continue
            dest_file = project_dir / file_path
            dest_file.parent.mkdir(parents=True, exist_ok=True)
            with open(dest_file, "w", encoding="utf-8") as fp:
                fp.write(content or "")
            saved_files.append(file_path)

    return {
        "success": True,
        "local_path": str(project_dir.resolve()),
        "saved_files": saved_files,
        "project_id": req.project_id
    }


# ── Runtime Detection & Package Installation ──

LANGUAGE_RUNTIMES = {
    "python":    {"cmd": ["python", "--version"],   "alt": ["python3", "--version"],  "install_hint": "Install from https://python.org or run: winget install Python.Python.3"},
    "node":      {"cmd": ["node", "--version"],      "alt": ["nodejs", "--version"],   "install_hint": "Install from https://nodejs.org or run: winget install OpenJS.NodeJS"},
    "java":      {"cmd": ["java", "-version"],       "alt": None,                      "install_hint": "Install JDK from https://adoptium.net or run: winget install EclipseAdoptium.Temurin.21.JDK"},
    "javac":     {"cmd": ["javac", "-version"],      "alt": None,                      "install_hint": "Install JDK (includes javac) from https://adoptium.net"},
    "g++":       {"cmd": ["g++", "--version"],       "alt": ["g++.exe", "--version"],  "install_hint": "Install MinGW-w64 from https://mingw-w64.org or run: winget install GnuWin32.gcc"},
    "gcc":       {"cmd": ["gcc", "--version"],       "alt": ["gcc.exe", "--version"],  "install_hint": "Install MinGW-w64 from https://mingw-w64.org"},
    "go":        {"cmd": ["go", "version"],          "alt": None,                      "install_hint": "Install from https://go.dev or run: winget install GoLang.Go"},
    "cargo":     {"cmd": ["cargo", "--version"],     "alt": None,                      "install_hint": "Install Rust/Cargo from https://rustup.rs"},
    "php":       {"cmd": ["php", "--version"],       "alt": None,                      "install_hint": "Install from https://windows.php.net or XAMPP: https://apachefriends.org"},
    "ruby":      {"cmd": ["ruby", "--version"],      "alt": None,                      "install_hint": "Install from https://rubyinstaller.org"},
    "git":       {"cmd": ["git", "--version"],       "alt": None,                      "install_hint": "Install from https://git-scm.com or run: winget install Git.Git"},
    "npm":       {"cmd": ["npm", "--version"],       "alt": None,                      "install_hint": "Comes with Node.js. Install Node from https://nodejs.org"},
    "pip":       {"cmd": ["pip", "--version"],       "alt": ["pip3", "--version"],     "install_hint": "Comes with Python. Install Python from https://python.org"},
    "typescript":{"cmd": ["tsc", "--version"],       "alt": None,                      "install_hint": "Run: npm install -g typescript"},
    "kotlin":    {"cmd": ["kotlinc", "-version"],    "alt": None,                      "install_hint": "Install from https://kotlinlang.org"},
}


@router.get("/runtimes")
def check_runtimes():
    """Check which language runtimes and tools are installed and available in PATH."""
    results = {}
    for name, info in LANGUAGE_RUNTIMES.items():
        found = False
        version_str = ""
        cmd_to_try = [info["cmd"]]
        if info.get("alt"):
            cmd_to_try.append(info["alt"])

        for cmd in cmd_to_try:
            try:
                proc = subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    timeout=5,
                    errors="replace"
                )
                output = (proc.stdout or "").strip()
                if output and (proc.returncode == 0 or proc.returncode == 1):
                    # java -version returns on stderr, still works
                    found = True
                    # Extract version line
                    version_str = output.split("\n")[0].strip()
                    break
            except (FileNotFoundError, subprocess.TimeoutExpired, PermissionError):
                continue

        results[name] = {
            "installed": found,
            "version": version_str if found else None,
            "install_hint": info["install_hint"] if not found else None
        }

    installed_count = sum(1 for v in results.values() if v["installed"])
    return {
        "runtimes": results,
        "installed_count": installed_count,
        "total_checked": len(results),
        "platform": sys.platform
    }


class PackageInstallRequest(BaseModel):
    package: str
    manager: str = "pip"          # pip | npm | gem | cargo | go
    project_id: Optional[str] = "default"
    global_install: bool = False


@router.post("/install")
def install_package(body: PackageInstallRequest):
    """Install a package using pip, npm, gem, or cargo into the workspace or globally."""
    pkg = (body.package or "").strip()
    if not pkg:
        raise HTTPException(status_code=400, detail="Package name is required.")

    manager = (body.manager or "pip").lower().strip()
    workspace_path = get_workspace_dir(body.project_id)

    # Build install command
    if manager == "pip":
        cmd = ["pip", "install", pkg] if body.global_install else ["pip", "install", pkg, "--user"]
    elif manager == "pip3":
        cmd = ["pip3", "install", pkg]
    elif manager == "npm":
        if body.global_install:
            cmd = ["npm", "install", "-g", pkg]
        else:
            cmd = ["npm", "install", pkg]
    elif manager == "npx":
        cmd = ["npx", pkg]
    elif manager == "gem":
        cmd = ["gem", "install", pkg]
    elif manager == "cargo":
        cmd = ["cargo", "install", pkg]
    elif manager == "go":
        cmd = ["go", "install", f"{pkg}@latest"]
    else:
        raise HTTPException(status_code=400, detail=f"Unknown package manager: {manager}. Use pip, npm, gem, cargo, or go.")

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(workspace_path),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
            errors="replace"
        )
        success = proc.returncode == 0
        output = (proc.stdout or "") + (proc.stderr or "")
        return {
            "success": success,
            "package": pkg,
            "manager": manager,
            "command": " ".join(cmd),
            "output": output.strip(),
            "exit_code": proc.returncode
        }
    except FileNotFoundError:
        return {
            "success": False,
            "package": pkg,
            "manager": manager,
            "output": f"'{manager}' is not installed or not in PATH. Please install {manager} first.",
            "exit_code": 127
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "package": pkg,
            "manager": manager,
            "output": f"Package installation timed out after 120 seconds.",
            "exit_code": 124
        }
    except Exception as e:
        return {
            "success": False,
            "package": pkg,
            "manager": manager,
            "output": str(e),
            "exit_code": 1
        }
