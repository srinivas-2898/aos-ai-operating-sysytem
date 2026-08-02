/* Project-first dashboard. Projects are the only entry point to AOS tools. */
const SUPABASE_URL = 'https://gdqapoopqijohrtovjza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI';
const aosSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let dashboardUser = null;
let projects = [];
let selectedTool = 'chat.html';

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const projectUrl = (id, page = 'chat.html') => `${page}?project_id=${encodeURIComponent(id)}`;

function toast(message) {
  const target = document.getElementById('toast');
  target.textContent = message;
  target.classList.add('show');
  setTimeout(() => target.classList.remove('show'), 2800);
}

function renderDashboard() {
  const recent = projects.slice(0, 3);
  const container = document.getElementById('dash-projects');
  if (container) {
    container.innerHTML = recent.length ? `<div class="dashboard-list">${recent.map(dashboardProjectRow).join('')}</div>` : '<div class="empty-state"><p>No projects yet. Create one when you open a tool.</p></div>';
  }
  const activity = document.getElementById('dash-activity');
  if (activity) activity.innerHTML = projects.length ? `<div class="dashboard-list">${recent.map(dashboardActivityRow).join('')}</div>` : '<div class="empty-state"><p>Your project activity will appear here.</p></div>';
  attachToolPickers();
}

function dashboardProjectRow(project) {
  return `<button class="dashboard-row" onclick="openProject('${project.id}')"><span class="dashboard-row-icon">&#128193;</span><span style="min-width:0;flex:1"><span class="dashboard-row-title" style="display:block">${esc(project.name)}</span><span class="dashboard-row-meta" style="display:block">${esc(project.description)}</span></span><span style="color:#93c5fd;font-size:18px">›</span></button>`;
}

function dashboardActivityRow(project) {
  const date = new Date(project.last_opened_at || project.created_at);
  const label = project.last_opened_at && project.last_opened_at !== project.created_at ? 'Opened project' : 'Created project';
  return `<button class="dashboard-row" onclick="openProject('${project.id}')"><span class="dashboard-row-icon" style="background:#f0fdf4;color:#16a34a">&#10003;</span><span style="min-width:0;flex:1"><span class="dashboard-row-title" style="display:block">${label}: ${esc(project.name)}</span><span class="dashboard-row-meta" style="display:block">${esc(date.toLocaleString())}</span></span></button>`;
}

function attachToolPickers() {
  const toolPages = {
    'AI Chat': 'chat.html',
    'Generation Studio': 'generation-projects.html',
    'Development Studio': 'ide.html'
  };
  document.querySelectorAll('#view-dashboard .feature-card, #view-developer .feature-card').forEach((card) => {
    const title = card.querySelector('h3')?.textContent.trim();
    const tool = toolPages[title];
    if (!tool || card.dataset.projectPickerBound) return;
    card.dataset.projectPickerBound = 'true';
    card.addEventListener('click', (event) => {
      event.preventDefault();
      if (tool === 'generation-projects.html') { window.location.href = tool; return; }
      openToolProjectPicker(tool);
    });
  });
}

function projectCard(project) {
  const opened = new Date(project.last_opened_at || project.created_at).toLocaleString();
  const created = new Date(project.created_at).toLocaleDateString();
  return `<button class="project-card" style="text-align:left;cursor:pointer" onclick="openProject('${project.id}')"><h3>${esc(project.name)}</h3><p class="pc-desc">${esc(project.description)}</p><span class="pc-tech">${esc(project.programming_language || project.framework || 'Project workspace')}</span><p style="font-size:11px;color:#9ca3af;margin:14px 0 0">Opened ${esc(opened)} · Created ${esc(created)}</p></button>`;
}

async function loadProjects() {
  const { data, error } = await aosSupabase.from('projects').select('*').order('last_opened_at', { ascending: false });
  if (error) throw error;
  projects = data || [];
  renderDashboard();
}

function openToolProjectPicker(tool = 'chat.html') {
  selectedTool = tool;
  const modal = document.getElementById('create-modal');
  modal.querySelector('.modal').innerHTML = `<div style="padding:4px"><h2 style="margin-bottom:8px">Select a Project</h2><p class="modal-subtitle" style="margin:0 0 22px">All ${tool === 'chat.html' ? 'chat history' : 'tool resources'} stay inside the selected project.</p><div style="display:grid;gap:12px"><button onclick="openCreateProject()" style="display:flex;align-items:center;gap:14px;width:100%;padding:18px;border:1px solid #2563eb;border-radius:12px;background:#2563eb;color:#fff;text-align:left;cursor:pointer"><span style="display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:rgba(255,255,255,.18);font-size:22px">+</span><span><strong style="display:block;font-size:15px">Create New Project</strong><small style="display:block;margin-top:3px;opacity:.82">Start a new dedicated workspace</small></span></button><button onclick="showExistingProjects()" style="display:flex;align-items:center;gap:14px;width:100%;padding:18px;border:1px solid #dbe3ef;border-radius:12px;background:#fff;color:#1f2937;text-align:left;cursor:pointer"><span style="display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:#eff6ff;color:#2563eb;font-size:17px">&#128193;</span><span><strong style="display:block;font-size:15px">Open Existing Project</strong><small style="display:block;margin-top:3px;color:#6b7280">Continue with a saved workspace</small></span></button></div><div style="display:flex;justify-content:flex-end;margin-top:22px;padding-top:16px;border-top:1px solid #eef2f7"><button class="btn-cancel" style="margin:0" onclick="closeCreateProject()">Cancel</button></div></div>`;
  modal.classList.add('open');
}

function showExistingProjects() {
  const modal = document.getElementById('create-modal');
  modal.querySelector('.modal').innerHTML = `<h2>Existing Projects</h2><p class="modal-subtitle">Only projects in your account are shown.</p><div class="ps-list">${projects.length ? projects.map((project) => `<button class="ps-item" style="width:100%;text-align:left;background:#fff" onclick="openProject('${project.id}')"><div class="ps-item-name">${esc(project.name)}</div><div class="ps-item-desc">${esc(project.description)}</div><small style="color:#9ca3af">Last opened ${esc(new Date(project.last_opened_at || project.created_at).toLocaleString())}</small></button>`).join('') : '<div style="padding:20px;text-align:center;color:#6b7280">No projects yet. Create one first.</div>'}</div><div class="modal-actions"><button class="btn-cancel" onclick="openToolProjectPicker(selectedTool)">Back</button><button class="btn-primary" onclick="openCreateProject()">Create Project</button></div>`;
  modal.classList.add('open');
}

function openCreateProject() {
  const modal = document.getElementById('create-modal');
  modal.querySelector('.modal').innerHTML = `
    <div style="padding:4px">
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:24px">
        <div style="display:grid;place-items:center;width:44px;height:44px;flex:none;border-radius:13px;background:linear-gradient(135deg,#dbeafe,#e0f2fe);color:#2563eb"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 12v5M9.5 14.5h5"/></svg></div>
        <div><h2 style="margin:1px 0 6px;color:#0f172a">Create New Project</h2><p style="margin:0;color:#64748b;font-size:14px;line-height:1.5">Set up a focused workspace for your chats, files, and AI tools.</p></div>
      </div>
      <div style="display:grid;gap:18px">
        <label style="display:grid;gap:7px;font-size:13px;font-weight:700;color:#334155"><span>Project Name <b style="color:#ef4444">*</b></span><input id="project-name" placeholder="e.g. Customer Portal" style="box-sizing:border-box;width:100%;padding:13px 14px;border:1px solid #dbe3ef;border-radius:10px;background:#f8fafc;color:#0f172a;font:400 14px inherit;outline:none"></label>
        <label style="display:grid;gap:7px;font-size:13px;font-weight:700;color:#334155"><span>Project Description <b style="color:#ef4444">*</b></span><textarea id="project-description" placeholder="Describe what you want to build and its main goal..." style="box-sizing:border-box;width:100%;min-height:96px;resize:vertical;padding:13px 14px;border:1px solid #dbe3ef;border-radius:10px;background:#f8fafc;color:#0f172a;font:400 14px inherit;outline:none"></textarea></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <label style="display:grid;gap:7px;font-size:13px;font-weight:700;color:#334155"><span>Programming Language</span><input id="project-language" placeholder="e.g. TypeScript" style="box-sizing:border-box;width:100%;padding:13px 14px;border:1px solid #dbe3ef;border-radius:10px;background:#f8fafc;color:#0f172a;font:400 14px inherit;outline:none"></label>
          <label style="display:grid;gap:7px;font-size:13px;font-weight:700;color:#334155"><span>Framework</span><input id="project-framework" placeholder="e.g. React" style="box-sizing:border-box;width:100%;padding:13px 14px;border:1px solid #dbe3ef;border-radius:10px;background:#f8fafc;color:#0f172a;font:400 14px inherit;outline:none"></label>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:26px;padding-top:18px;border-top:1px solid #e8eef6"><button class="btn-cancel" style="margin:0;padding:11px 19px" onclick="closeCreateProject()">Cancel</button><button style="display:inline-flex;align-items:center;gap:8px;padding:11px 19px;border:0;border-radius:10px;background:linear-gradient(135deg,#2563eb,#3b82f6);box-shadow:0 6px 14px rgba(37,99,235,.2);color:#fff;font:700 14px inherit;cursor:pointer" onclick="createProject()"><span>+</span>Create Project</button></div>
    </div>`;
  modal.classList.add('open');
}

function closeCreateProject() { document.getElementById('create-modal').classList.remove('open'); }

async function createProject() {
  const name = document.getElementById('project-name').value.trim();
  const description = document.getElementById('project-description').value.trim();
  if (!name || !description) return toast('Project name and description are required.');
  const project = { name, description, programming_language: document.getElementById('project-language').value.trim() || null, framework: document.getElementById('project-framework').value.trim() || null };
  try {
    const { data, error } = await aosSupabase.from('projects').insert(project).select().single();
    if (error) throw error;
    const { error: chatError } = await aosSupabase.from('chat_sessions').insert({ project_id: data.id, title: 'New Chat' });
    if (chatError) throw chatError;
    window.location.href = projectUrl(data.id, selectedTool);
  } catch (error) {
    console.error(error);
    toast(`Could not create project: ${error.message}`);
  }
}

async function openProject(projectId) {
  try {
    const { error } = await aosSupabase.from('projects').update({ last_opened_at: new Date().toISOString() }).eq('id', projectId);
    if (error) throw error;
    window.location.href = projectUrl(projectId, selectedTool);
  } catch (error) { toast(`Could not open project: ${error.message}`); }
}

function professionalProjectCard(project) {
  const opened = new Date(project.last_opened_at || project.created_at).toLocaleString();
  const created = new Date(project.created_at).toLocaleDateString();
  const stack = [project.programming_language, project.framework].filter(Boolean).join(' · ') || 'Project workspace';
  const lang = (project.programming_language || '').toLowerCase();
  const fw = (project.framework || '').toLowerCase();
  
  // Contextual icon + color based on tech stack
  let iconSvg, logoBg, logoColor;
  if (lang.includes('python')) {
    iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 12l2 2 4-4"/></svg>';
    logoBg = 'linear-gradient(135deg,#fef9c3,#fde68a)'; logoColor = '#b45309';
  } else if (lang.includes('typescript') || lang.includes('javascript')) {
    iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
    logoBg = 'linear-gradient(135deg,#fef3c7,#fde68a)'; logoColor = '#d97706';
  } else if (lang.includes('java') || lang.includes('kotlin')) {
    iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
    logoBg = 'linear-gradient(135deg,#fee2e2,#fecaca)'; logoColor = '#dc2626';
  } else if (lang.includes('sql') || fw.includes('supabase') || fw.includes('postgres')) {
    iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>';
    logoBg = 'linear-gradient(135deg,#e0f2fe,#bae6fd)'; logoColor = '#0284c7';
  } else if (fw.includes('react') || fw.includes('next')) {
    iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/></svg>';
    logoBg = 'linear-gradient(135deg,#dbeafe,#bfdbfe)'; logoColor = '#2563eb';
  } else if (fw.includes('vue') || fw.includes('angular') || fw.includes('svelte')) {
    iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg>';
    logoBg = 'linear-gradient(135deg,#dcfce7,#bbf7d0)'; logoColor = '#16a34a';
  } else {
    // Default folder/workspace icon
    iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="9" y1="14" x2="15" y2="14"/></svg>';
    logoBg = 'linear-gradient(135deg,#eff6ff,#e0e7ff)'; logoColor = '#3b82f6';
  }

  return `<button class="project-card project-card-pro" onclick="openProject('${project.id}')"><div class="project-card-top"><span class="project-card-logo" style="background:${logoBg};color:${logoColor}">${iconSvg}</span><span class="project-card-open">Open <b>›</b></span></div><h3>${esc(project.name)}</h3><p class="pc-desc">${esc(project.description)}</p><span class="pc-tech"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>${esc(stack)}</span><div class="project-card-footer"><span>Last opened</span><strong>${esc(opened)}</strong><span class="project-created">Created ${esc(created)}</span></div></button>`;
}


function switchView(name) {
  if (name === 'dashboard') {
    document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
    document.getElementById('view-dashboard').classList.add('active');
    return renderDashboard();
  }
  if (name === 'projects') {
    document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
    document.getElementById('view-projects').classList.add('active');
    document.getElementById('projects-grid').innerHTML = projects.length ? projects.map(professionalProjectCard).join('') : '<div class="empty-state" style="grid-column:1/-1;padding:40px"><p>No projects yet.</p></div>';
  }
}

async function performLogout() { await aosSupabase.auth.signOut(); window.location.href = 'index.html'; }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('create-modal').addEventListener('click', (event) => { if (event.target.id === 'create-modal') closeCreateProject(); });
  aosSupabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) { window.location.href = 'index.html'; return; }
    dashboardUser = session.user;
    const name = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User';
    document.querySelectorAll('[data-username]').forEach((element) => { element.textContent = name; });
    try { await loadProjects(); } catch (error) { console.error(error); toast(`Could not load projects: ${error.message}`); }
  });
});
