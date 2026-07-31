
const SUPABASE_URL = 'https://gdqapoopqijohrtovjza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cachedProjects = [];
let currentUser = null;
let currentChatProjectId = null;
let chatSessions = [];
let activeChatIndex = -1;
let currentMessages = [];

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function initUser() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) { window.location.href = 'index.html'; return; }
    const user = session.user;
    currentUser = user;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || 'U';
    const email = user.email;
    const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
    
    const welcomeEl = document.querySelector('[data-welcome], .welcome-text, h1, h2');
    if (welcomeEl && welcomeEl.textContent.includes('User')) {
      welcomeEl.textContent = 'Welcome, ' + name + '!';
    }
    
    const userNameEls = document.querySelectorAll('.user-name, [data-username], .username');
    userNameEls.forEach(el => el.textContent = name);
    
    const avatarEls = document.querySelectorAll('.user-avatar, .avatar, [data-avatar]');
    avatarEls.forEach(el => {
      if (avatarUrl) {
        el.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        el.style.background = 'transparent';
      } else {
        el.textContent = initials;
      }
    });
    
    const emailEls = document.querySelectorAll('.user-email, [data-email]');
    emailEls.forEach(el => el.textContent = email || '');
    
    const uidEl = document.getElementById('settings-uid');
    if (uidEl) uidEl.textContent = user.id || '';
    
  } catch (err) {
    console.error('Session init error:', err);
  }
  await fetchProjectsFromDB();
  renderDashProjects();
}


async function fetchProjectsFromDB() {
  if (!currentUser) return;
  const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching projects:', error);
  } else {
    cachedProjects = data || [];
  }
}

function loadProjects() {
  return cachedProjects;
}

function switchView(name) {
  if (name === 'chat') {
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('chat-shell').classList.add('active');
    return;
  }
  document.getElementById('app-shell').style.display = 'flex';
  document.getElementById('chat-shell').classList.remove('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const v = document.getElementById('view-' + name);
  if (v) v.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.getElementById('nav-' + name);
  if (nav) nav.classList.add('active');
  if (name === 'dashboard') renderDashProjects();
  if (name === 'projects') renderProjectsView();
}

function toggleSidebar() {
  document.getElementById('main-sidebar').classList.toggle('collapsed');
}

function toggleChatSidebar() {
  document.getElementById('chat-sidebar').classList.toggle('expanded');
}

async function saveProjects(arr) {
  // This function is kept for signature compatibility but we save one-by-one to Supabase now
  cachedProjects = arr;
}

function renderDashProjects() {
  const projects = loadProjects();
  const el = document.getElementById('dash-projects');
  if (!projects.length) {
    el.innerHTML = '<div class="empty-state"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><p>No projects yet</p></div>';
    return;
  }
  el.innerHTML = projects.slice(0,3).map((p,i) => `
    <div class="proj-item">
      <div><div class="proj-item-name">${esc(p.name)}</div><div class="proj-item-tech">${esc(p.tech_stack||'')}</div></div>
      <button class="proj-item-del" onclick="deleteProject(${i})" title="Delete">✕</button>
    </div>`).join('');
}

function renderProjectsView() {
  const projects = loadProjects();
  const el = document.getElementById('projects-grid');
  if (!projects.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:40px"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><p>No projects yet. Create your first project!</p></div>';
    return;
  }
  el.innerHTML = projects.map((p,i) => `
    <div class="project-card">
      <button class="pc-del" onclick="deleteProject(${i})" title="Delete">✕</button>
      <h3>${esc(p.name)}</h3>
      <p class="pc-desc">${esc(p.description||'No description')}</p>
      ${p.tech_stack ? `<span class="pc-tech">${esc(p.tech_stack)}</span>` : ''}
      ${p.deploy_url ? `<a class="pc-url" href="${esc(p.deploy_url)}" target="_blank">${esc(p.deploy_url)}</a>` : ''}
    </div>`).join('');
}

function openCreateProject() {
  document.getElementById('proj-name').value = '';
  document.getElementById('proj-desc').value = '';
  document.getElementById('proj-tech').value = '';
  document.getElementById('proj-url').value = '';
  document.getElementById('create-modal').classList.add('open');
}

function closeCreateProject() {
  document.getElementById('create-modal').classList.remove('open');
}

async function submitCreateProject() {
  const name = document.getElementById('proj-name').value.trim();
  if (!name) { showToast('Project name is required'); return; }
  const newProj = {
    user_id: currentUser.id,
    name,
    description: document.getElementById('proj-desc').value.trim(),
    tech_stack: document.getElementById('proj-tech').value.trim(),
    deploy_url: document.getElementById('proj-url').value.trim()
  };
  const { data, error } = await supabase.from('projects').insert([newProj]).select();
  if (error) {
    showToast('Failed to create project');
    return;
  }
  if (data && data[0]) {
    cachedProjects.unshift(data[0]);
  }
  closeCreateProject();
  renderDashProjects();
  renderProjectsView();
  showToast('Project created!');
  return data[0];
}

let selectedChatProjectId = null;

function openProjectSelectModal() {
  const projects = loadProjects();
  const listEl = document.getElementById('ps-list');
  selectedChatProjectId = null;
  document.getElementById('new-chat-proj-name').value = '';
  document.getElementById('new-chat-proj-desc').value = '';
  
  if (!projects.length) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:13px">No existing projects</div>';
  } else {
    listEl.innerHTML = projects.map(p => `
      <div class="ps-item" id="ps-item-${p.id}" onclick="selectChatProject('${p.id}')">
        <div class="ps-item-name">${esc(p.name)}</div>
        <div class="ps-item-desc">${esc(p.description || 'No description')}</div>
      </div>
    `).join('');
  }
  document.getElementById('project-select-modal').classList.add('open');
}

function closeProjectSelectModal() {
  document.getElementById('project-select-modal').classList.remove('open');
}

function selectChatProject(id) {
  selectedChatProjectId = id;
  document.querySelectorAll('.ps-item').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('ps-item-' + id);
  if (el) el.classList.add('selected');
}

async function submitProjectSelect() {
  const newName = document.getElementById('new-chat-proj-name').value.trim();
  const newDesc = document.getElementById('new-chat-proj-desc').value.trim();
  
  if (newName) {
    const newProj = {
      user_id: currentUser.id,
      name: newName,
      description: newDesc
    };
    const { data, error } = await supabase.from('projects').insert([newProj]).select();
    if (error) {
      console.error('Supabase Insert Error:', error);
      showToast('Failed to create project: ' + error.message);
    }
    if (!error && data && data[0]) {
      cachedProjects.unshift(data[0]);
      selectedChatProjectId = data[0].id;
      renderDashProjects();
      renderProjectsView();
    }
  }
  
  if (!selectedChatProjectId) {
    showToast('Please select or create a project');
    return;
  }
  
  currentChatProjectId = selectedChatProjectId;
  const proj = cachedProjects.find(p => p.id === currentChatProjectId);
  if (proj) {
    document.getElementById('current-project-title').textContent = proj.name;
  }
  
  closeProjectSelectModal();
  switchView('chat');
  await loadChatSessionsFromDB();
}

async function deleteProject(i) {
  const proj = cachedProjects[i];
  if (!proj) return;
  const { error } = await supabase.from('projects').delete().eq('id', proj.id);
  if (error) {
    showToast('Failed to delete project');
    return;
  }
  cachedProjects.splice(i, 1);
  renderDashProjects();
  renderProjectsView();
  showToast('Project deleted');
}

async function loadChatSessionsFromDB() {
  if (!currentChatProjectId || !currentUser) return;
  const { data, error } = await supabase.from('chat_sessions')
    .select('*')
    .eq('project_id', currentChatProjectId)
    .order('created_at', { ascending: false });
  
  if (!error) {
    chatSessions = data || [];
    renderChatSidebar();
    if (chatSessions.length > 0) {
      openChatSession(0);
    } else {
      startNewChat();
    }
  }
}

async function saveChatSessionToDB(sessionIndex) {
  if (sessionIndex < 0 || sessionIndex >= chatSessions.length) return;
  const session = chatSessions[sessionIndex];
  
  if (session.id) {
    // Update existing
    await supabase.from('chat_sessions').update({ messages: session.messages }).eq('id', session.id);
  } else {
    // Insert new
    const { data, error } = await supabase.from('chat_sessions').insert([{
      user_id: currentUser.id,
      project_id: currentChatProjectId,
      title: session.title,
      messages: session.messages
    }]).select();
    
    if (!error && data && data[0]) {
      chatSessions[sessionIndex] = data[0];
    }
  }
}

function renderChatSidebar() {
  const el = document.getElementById('chat-sessions-list');
  if (!chatSessions.length) {
    el.innerHTML = '<div style="padding:16px 10px;font-size:13px;color:#9ca3af;text-align:center">No conversations yet</div>';
    return;
  }
  
  el.innerHTML = `
    <div class="chat-section">
      <div class="chat-section-title">Previous Chats</div>
      ${chatSessions.map((s,i) => `
        <div class="session-item${i===activeChatIndex?' active-session':''}" onclick="openChatSession(${i})">
          <div style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(s.title||'Conversation '+(i+1))}</div>
          <svg class="session-options" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </div>`).join('')}
    </div>
  `;
}

function startNewChat() {
  activeChatIndex = -1;
  currentMessages = [];
  const area = document.getElementById('messages-area');
  area.innerHTML = '<div class="chat-empty" id="chat-empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>Start a conversation with AI</p></div>';
  document.getElementById('chat-input').value = '';
  renderChatSidebar();
}

function openChatSession(i) {
  activeChatIndex = i;
  currentMessages = chatSessions[i].messages || [];
  const area = document.getElementById('messages-area');
  if (!currentMessages.length) {
    area.innerHTML = `
      <div class="chat-empty" id="chat-empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <p style="font-size:16px;font-weight:600;color:#374151">How can I help you today?</p>
      </div>`;
  } else {
    area.innerHTML = currentMessages.map(m =>
      `<div class="msg ${m.role}"><div class="msg-bubble">${esc(m.content)}</div></div>`).join('');
    area.scrollTop = area.scrollHeight;
  }
  renderChatSidebar();
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  const emptyState = document.getElementById('chat-empty-state');
  if (emptyState) emptyState.remove();
  currentMessages.push({ role: 'user', content: text });
  const area = document.getElementById('messages-area');
  const userDiv = document.createElement('div');
  userDiv.className = 'msg user';
  userDiv.innerHTML = `<div class="msg-bubble">${esc(text)}</div>`;
  area.appendChild(userDiv);
  area.scrollTop = area.scrollHeight;
  input.value = '';
  autoResize(input);
  setTimeout(() => {
    const responses = [
      'That\'s a great question! Let me help you with that.',
      'I can assist with that. Here\'s what I suggest...',
      'Interesting! Based on your request, I would recommend...',
      'Sure! Here\'s a thoughtful response to your message.',
      'I understand what you\'re looking for. Let me explain...'
    ];
    const reply = responses[Math.floor(Math.random() * responses.length)];
    currentMessages.push({ role: 'ai', content: reply });
    const aiDiv = document.createElement('div');
    aiDiv.className = 'msg ai';
    aiDiv.innerHTML = `<div class="msg-bubble">${esc(reply)}</div>`;
    area.appendChild(aiDiv);
    area.scrollTop = area.scrollHeight;
    
    if (activeChatIndex === -1) {
      const session = { title: text.slice(0,40) + (text.length>40?'...':''), messages: currentMessages };
      chatSessions.unshift(session);
      activeChatIndex = 0;
      saveChatSessionToDB(0);
    } else {
      chatSessions[activeChatIndex].messages = currentMessages;
      saveChatSessionToDB(activeChatIndex);
    }
    renderChatSidebar();
  }, 800);
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function toggleUserDropdown() {
  document.getElementById('user-dropdown').classList.toggle('open');
}

function closeDropdown() {
  document.getElementById('user-dropdown').classList.remove('open');
}

function showModal(title, body) {
  document.getElementById('info-modal-title').textContent = title;
  document.getElementById('info-modal-body').textContent = body;
  document.getElementById('info-modal').classList.add('open');
}

function closeInfoModal() {
  document.getElementById('info-modal').classList.remove('open');
}

async function performLogout() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

document.addEventListener('click', function(e) {
  const dd = document.getElementById('user-dropdown');
  const btn = document.getElementById('user-btn');
  if (dd.classList.contains('open') && !dd.contains(e.target) && !btn.contains(e.target)) closeDropdown();
});

document.getElementById('create-modal').addEventListener('click', function(e) {
  if (e.target === this) closeCreateProject();
});

document.getElementById('project-select-modal').addEventListener('click', function(e) {
  if (e.target === this) closeProjectSelectModal();
});

function openChatStartModal(e) {
  if (e) e.preventDefault();
  document.getElementById('chat-start-modal').classList.add('open');
  switchChatStartTab('new');
  loadChatExistProjects();
}

function closeChatStartModal() {
  document.getElementById('chat-start-modal').classList.remove('open');
}

function switchChatStartTab(tab) {
  const newBtn = document.getElementById('tab-new-proj');
  const existBtn = document.getElementById('tab-exist-proj');
  if (tab === 'new') {
    newBtn.style.background = '#2563eb';
    newBtn.style.color = '#fff';
    newBtn.style.borderColor = '#2563eb';
    
    existBtn.style.background = '#fff';
    existBtn.style.color = '#374151';
    existBtn.style.borderColor = '#e5e7eb';
    
    document.getElementById('chat-start-new').style.display = 'block';
    document.getElementById('chat-start-exist').style.display = 'none';
  } else {
    existBtn.style.background = '#2563eb';
    existBtn.style.color = '#fff';
    existBtn.style.borderColor = '#2563eb';
    
    newBtn.style.background = '#fff';
    newBtn.style.color = '#374151';
    newBtn.style.borderColor = '#e5e7eb';
    
    document.getElementById('chat-start-exist').style.display = 'block';
    document.getElementById('chat-start-new').style.display = 'none';
  }
}

async function loadChatExistProjects() {
  const listEl = document.getElementById('chat-exist-list');
  listEl.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:13px">Loading projects...</div>';
  
  if (!currentUser) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:#ef4444;font-size:13px">Please sign in first.</div>';
    return;
  }
  
  const { data, error } = await supabase.from('projects')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
    
  if (error || !data || data.length === 0) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:13px">No existing projects found.</div>';
    return;
  }
  
  listEl.innerHTML = data.map(p => `
    <div class="ps-item" onclick="submitChatStartExist('${p.id}')">
      <div class="ps-item-name">${esc(p.name)}</div>
      <div class="ps-item-desc">${esc(p.description || 'No description')}</div>
    </div>
  `).join('');
}

async function submitChatStartNew() {
  const name = document.getElementById('chat-new-proj-name').value.trim();
  const desc = document.getElementById('chat-new-proj-desc').value.trim();
  if (!name) {
    showToast('Project Name is required.');
    return;
  }
  
  const btn = document.querySelector('#chat-start-new .btn-primary');
  const originalText = btn.textContent;
  btn.textContent = 'Creating...';
  btn.disabled = true;
  
  const { data, error } = await supabase.from('projects').insert([{
    user_id: currentUser.id,
    name: name,
    description: desc
  }]).select();
  
  btn.textContent = originalText;
  btn.disabled = false;
  
  if (error || !data || data.length === 0) {
    showToast('Error creating project.');
    console.error(error);
    return;
  }
  
  closeChatStartModal();
  currentChatProjectId = data[0].id;
  const titleEl = document.getElementById('current-project-title');
  if (titleEl) titleEl.textContent = data[0].name;
  switchView('chat');
  await loadChatSessionsFromDB();
}

async function submitChatStartExist(projectId) {
  closeChatStartModal();
  currentChatProjectId = projectId;
  const project = cachedProjects.find(p => p.id === projectId);
  if (project) {
    const titleEl = document.getElementById('current-project-title');
    if (titleEl) titleEl.textContent = project.name;
  }
  switchView('chat');
  await loadChatSessionsFromDB();
}

document.getElementById('chat-start-modal').addEventListener('click', function(e) {
  if (e.target === this) closeChatStartModal();
});

document.addEventListener('DOMContentLoaded', initUser);
