/* Project-first dashboard. Projects are the only entry point to AOS tools. */
const SUPABASE_URL = 'https://gdqapoopqijohrtovjza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI';
const aosSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let dashboardUser = null;
let projects = [];

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const projectUrl = (id, page = 'chat.html') => `${page}?project_id=${encodeURIComponent(id)}`;

function toast(message) {
  const target = document.getElementById('toast');
  target.textContent = message;
  target.classList.add('show');
  setTimeout(() => target.classList.remove('show'), 2800);
}

function renderDashboard() {
  const dashboard = document.getElementById('view-dashboard');
  const recent = projects.slice(0, 3);
  dashboard.innerHTML = `
    <section style="max-width:980px;margin:48px auto;padding:0 24px">
      <div style="text-align:center;margin-bottom:32px"><p style="color:#2563eb;font-weight:700;margin-bottom:8px">PROJECT WORKSPACE</p><h1 style="font-size:38px;color:#111827;margin:0">Choose a project to begin</h1><p style="color:#6b7280;margin-top:12px">Every chat, file, deployment and AI result stays inside its own secure project.</p></div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px">
        <button onclick="openCreateProject()" style="text-align:left;padding:32px;border:1px solid #bfdbfe;border-radius:18px;background:#f0f9ff;cursor:pointer;transition:.2s"><div style="font-size:32px;color:#2563eb">+</div><h2 style="color:#111827;margin:16px 0 8px">Create New Project</h2><p style="margin:0;color:#4b5563;line-height:1.6">Create a dedicated workspace, then start its first AI conversation.</p></button>
        <button onclick="showExistingProjects()" style="text-align:left;padding:32px;border:1px solid #e5e7eb;border-radius:18px;background:#fff;cursor:pointer;transition:.2s"><div style="font-size:30px">&#128193;</div><h2 style="color:#111827;margin:16px 0 8px">Open Existing Project</h2><p style="margin:0;color:#4b5563;line-height:1.6">Restore the chats and resources saved for one of your projects.</p></button>
      </div>
      <div style="margin-top:42px"><h2 style="font-size:18px;color:#111827">Recent projects</h2><div id="dashboard-recent" class="projects-grid"></div></div>
    </section>`;
  const container = document.getElementById('dashboard-recent');
  container.innerHTML = recent.length ? recent.map(projectCard).join('') : '<div class="empty-state" style="grid-column:1/-1;padding:32px"><p>No projects yet. Create your first workspace above.</p></div>';
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

function showExistingProjects() {
  const modal = document.getElementById('create-modal');
  modal.querySelector('.modal').innerHTML = `<h2>Existing Projects</h2><p class="modal-subtitle">Only projects in your account are shown.</p><div class="ps-list">${projects.length ? projects.map((project) => `<button class="ps-item" style="width:100%;text-align:left;background:#fff" onclick="openProject('${project.id}')"><div class="ps-item-name">${esc(project.name)}</div><div class="ps-item-desc">${esc(project.description)}</div><small style="color:#9ca3af">Last opened ${esc(new Date(project.last_opened_at || project.created_at).toLocaleString())}</small></button>`).join('') : '<div style="padding:20px;text-align:center;color:#6b7280">No projects yet. Create one first.</div>'}</div><div class="modal-actions"><button class="btn-cancel" onclick="closeCreateProject()">Close</button><button class="btn-primary" onclick="openCreateProject()">Create Project</button></div>`;
  modal.classList.add('open');
}

function openCreateProject() {
  const modal = document.getElementById('create-modal');
  modal.querySelector('.modal').innerHTML = `<h2>Create New Project</h2><p class="modal-subtitle">A project is required before you can use any AOS tool.</p><div class="form-group"><label>Project Name <span style="color:#ef4444">*</span></label><input id="project-name" placeholder="e.g. Customer portal"></div><div class="form-group"><label>Project Description / Bio <span style="color:#ef4444">*</span></label><textarea id="project-description" placeholder="What are you building?"></textarea></div><div class="form-group"><label>Programming Language</label><input id="project-language" placeholder="e.g. TypeScript"></div><div class="form-group"><label>Framework</label><input id="project-framework" placeholder="e.g. React"></div><div class="modal-actions"><button class="btn-cancel" onclick="closeCreateProject()">Cancel</button><button class="btn-primary" onclick="createProject()">Create Project</button></div>`;
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
    window.location.href = projectUrl(data.id);
  } catch (error) {
    console.error(error);
    toast(`Could not create project: ${error.message}`);
  }
}

async function openProject(projectId) {
  try {
    const { error } = await aosSupabase.from('projects').update({ last_opened_at: new Date().toISOString() }).eq('id', projectId);
    if (error) throw error;
    window.location.href = projectUrl(projectId);
  } catch (error) { toast(`Could not open project: ${error.message}`); }
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
    document.getElementById('projects-grid').innerHTML = projects.length ? projects.map(projectCard).join('') : '<div class="empty-state" style="grid-column:1/-1;padding:40px"><p>No projects yet.</p></div>';
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
