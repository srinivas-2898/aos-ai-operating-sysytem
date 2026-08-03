"""Server-side GitHub OAuth and repository management. Tokens never reach the browser."""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from cryptography.fernet import Fernet, InvalidToken
import base64, hashlib, hmac, json, os, time, requests

router = APIRouter(prefix="/api/github", tags=["github"])
GH_API = "https://api.github.com"

class ProjectRequest(BaseModel): project_id: str
class ConnectRequest(BaseModel): project_id: str | None = None
class RepositoryRequest(ProjectRequest): name: str = ""; description: str = ""; private: bool = True; auto_init: bool = True; gitignore_template: str | None = None; license_template: str | None = None
class RenameRequest(ProjectRequest): name: str
class CommitRequest(ProjectRequest): message: str = "Update project files"

def cfg(name):
    value = os.getenv(name)
    if not value: raise HTTPException(503, f"{name} is not configured on the server.")
    return value
def service_headers(): return {"apikey": cfg("SUPABASE_SERVICE_ROLE_KEY"), "Authorization": f"Bearer {cfg('SUPABASE_SERVICE_ROLE_KEY')}", "Content-Type":"application/json"}
def rest(path, method="GET", payload=None, params=None, extra_headers=None):
    headers=service_headers(); headers.update(extra_headers or {})
    response = requests.request(method, f"{cfg('SUPABASE_URL').rstrip('/')}/rest/v1/{path}", headers=headers, json=payload, params=params, timeout=30)
    if not response.ok:
        try: detail = response.json().get("message") or response.json().get("hint") or response.text
        except ValueError: detail = response.text
        raise HTTPException(502, f"Supabase request failed: {detail[:300]}")
    return response.json() if response.content else None
def github(method, path, token, payload=None):
    response = requests.request(method, f"{GH_API}{path}", headers={"Authorization":f"Bearer {token}","Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}, json=payload, timeout=45)
    if not response.ok: raise HTTPException(response.status_code, f"GitHub API: {response.text[:300]}")
    return response.json() if response.content else {}
def cipher():
    try: return Fernet(cfg("TOKEN_ENCRYPTION_KEY").encode())
    except ValueError as error: raise HTTPException(503, "TOKEN_ENCRYPTION_KEY is invalid. Generate a Fernet key for Railway.") from error
def encrypt(value): return cipher().encrypt(value.encode()).decode()
def decrypt(value):
    try: return cipher().decrypt(value.encode()).decode()
    except InvalidToken as error: raise HTTPException(500, "Stored GitHub token cannot be decrypted.") from error
def state(data):
    raw = base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")
    sig = hmac.new(cfg("OAUTH_STATE_SECRET").encode(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"
def read_state(value):
    try:
        raw, sig = value.rsplit(".",1); expected=hmac.new(cfg("OAUTH_STATE_SECRET").encode(),raw.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig,expected): raise ValueError()
        data=json.loads(base64.urlsafe_b64decode(raw+"="*(-len(raw)%4)))
        if data["exp"] < time.time(): raise ValueError()
        return data
    except Exception as error: raise HTTPException(400,"Invalid or expired OAuth state.") from error
def current_user(request: Request):
    token=request.headers.get("authorization","").replace("Bearer ","")
    if not token: raise HTTPException(401,"Sign in is required.")
    response=requests.get(f"{cfg('SUPABASE_URL').rstrip('/')}/auth/v1/user",headers={"Authorization":f"Bearer {token}","apikey":cfg('SUPABASE_ANON_KEY')},timeout=20)
    if not response.ok: raise HTTPException(401,"Invalid Supabase session.")
    return response.json()["id"]
def owned_project(user_id, project_id):
    data=rest("projects",params={"id":f"eq.{project_id}","user_id":f"eq.{user_id}","select":"id,name"})
    if not data: raise HTTPException(404,"Project not found.")
    return data[0]
def connection(user_id):
    rows=rest("github_connections",params={"user_id":f"eq.{user_id}","select":"*"})
    if not rows: raise HTTPException(409,"Connect GitHub before using repositories.")
    return rows[0]
def repository(user_id, project_id):
    rows=rest("github_repositories",params={"project_id":f"eq.{project_id}","user_id":f"eq.{user_id}","select":"*"})
    if not rows: raise HTTPException(404,"No GitHub repository is linked to this project.")
    return rows[0]

@router.post("/connect")
def connect(body: ConnectRequest, request: Request):
    user=current_user(request)
    if body.project_id: owned_project(user,body.project_id)
    callback=cfg("GITHUB_OAUTH_REDIRECT_URI")
    oauth_state=state({"user":user,"project":body.project_id,"exp":time.time()+600})
    url=f"https://github.com/login/oauth/authorize?client_id={cfg('GITHUB_CLIENT_ID')}&redirect_uri={callback}&scope=read:user%20repo&state={oauth_state}"
    return {"authorization_url":url}

@router.get("/callback")
def callback(code: str, state: str):
    data=read_state(state)
    exchange=requests.post("https://github.com/login/oauth/access_token",headers={"Accept":"application/json"},data={"client_id":cfg("GITHUB_CLIENT_ID"),"client_secret":cfg("GITHUB_CLIENT_SECRET"),"code":code,"redirect_uri":cfg("GITHUB_OAUTH_REDIRECT_URI")},timeout=30).json()
    token=exchange.get("access_token")
    if not token: raise HTTPException(400,"GitHub authorization failed.")
    profile=github("GET","/user",token)
    record={"user_id":data["user"],"github_user_id":profile["id"],"github_username":profile["login"],"github_avatar":profile.get("avatar_url"),"access_token":encrypt(token),"refresh_token":encrypt(exchange["refresh_token"]) if exchange.get("refresh_token") else None}
    rest("github_connections?on_conflict=user_id","POST",record,extra_headers={"Prefer":"resolution=merge-duplicates,return=minimal"})
    url = f"{cfg('AOS_WEB_URL').rstrip('/')}/deploy.html?github=connected"
    if data.get("project"):
        url += f"&project_id={data['project']}"
    return RedirectResponse(url)

@router.get("/status")
def status(project_id: str, request: Request):
    user=current_user(request); owned_project(user,project_id); conn=connection(user)
    repo=rest("github_repositories",params={"project_id":f"eq.{project_id}","select":"*"})
    return {"connected":True,"username":conn["github_username"],"avatar":conn.get("github_avatar"),"repository":repo[0] if repo else None}

@router.post("/repositories")
def create_repository(body: RepositoryRequest, request: Request):
    user=current_user(request); project=owned_project(user,body.project_id); token=decrypt(connection(user)["access_token"])
    name=body.name or "-".join(char.lower() if char.isalnum() else "-" for char in project["name"]).strip("-")[:100]
    repo=github("POST","/user/repos",token,{"name":name,"description":body.description or "","private":body.private,"auto_init":body.auto_init,"gitignore_template":body.gitignore_template,"license_template":body.license_template})
    data={"project_id":body.project_id,"user_id":user,"repository_id":repo["id"],"repository_name":repo["name"],"repository_url":repo["html_url"],"default_branch":repo.get("default_branch","main"),"clone_url":repo.get("clone_url"),"ssh_url":repo.get("ssh_url")}
    rest("github_repositories?on_conflict=project_id","POST",data,extra_headers={"Prefer":"resolution=merge-duplicates,return=representation"}); return data

@router.post("/repositories/rename")
def rename_repository(body: RenameRequest, request: Request):
    user=current_user(request); owned_project(user,body.project_id); repo=repository(user,body.project_id); token=decrypt(connection(user)["access_token"])
    owner=connection(user)["github_username"]; updated=github("PATCH",f"/repos/{owner}/{repo['repository_name']}",token,{"name":body.name})
    rest("github_repositories", "PATCH", {"repository_name":updated["name"],"repository_url":updated["html_url"]}, {"id":f"eq.{repo['id']}"}); return {"name":updated["name"],"url":updated["html_url"]}

@router.delete("/repositories")
def delete_repository(project_id: str, request: Request):
    user=current_user(request); owned_project(user,project_id); repo=repository(user,project_id); token=decrypt(connection(user)["access_token"]); owner=connection(user)["github_username"]
    github("DELETE",f"/repos/{owner}/{repo['repository_name']}",token); rest("github_repositories","DELETE",params={"id":f"eq.{repo['id']}"}); return {"ok":True}

@router.post("/push")
def push_changes(body: CommitRequest, request: Request):
    user=current_user(request); owned_project(user,body.project_id); repo=repository(user,body.project_id); token=decrypt(connection(user)["access_token"]); owner=connection(user)["github_username"]
    files=rest("project_files",params={"project_id":f"eq.{body.project_id}","select":"path,content"})
    pushed=0
    for file in files:
        path=file["path"].lstrip("/"); existing=requests.get(f"{GH_API}/repos/{owner}/{repo['repository_name']}/contents/{path}",headers={"Authorization":f"Bearer {token}","Accept":"application/vnd.github+json"},timeout=30)
        payload={"message":body.message,"content":base64.b64encode(file.get("content","").encode()).decode(),"branch":repo["default_branch"]}
        if existing.ok: payload["sha"]=existing.json().get("sha")
        github("PUT",f"/repos/{owner}/{repo['repository_name']}/contents/{path}",token,payload); pushed+=1
    return {"ok":True,"files_pushed":pushed}

@router.post("/disconnect")
def disconnect(request: Request):
    user=current_user(request); rest("github_connections", "DELETE", params={"user_id":f"eq.{user}"}); return {"ok":True}
