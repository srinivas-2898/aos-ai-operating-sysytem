
/* ===== FRONTEND with Auth — localStorage for data, Supabase for auth ===== */

const SUPABASE_URL = 'https://gdqapoopqijohrtovjza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let cachedProjects = [];
let currentProjectId = null;
let chatSessions = [];
let activeChatIndex = -1;
let currentMessages = [];

function esc(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function getTimeStr() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function genId() { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9); }

/* ---------- localStorage helpers ---------- */
function loadProjectsFromStorage() {
  if (!currentUser) return;
  try { cachedProjects = JSON.parse(localStorage.getItem('aos_projects_' + currentUser.id)) || []; }
  catch(e) { cachedProjects = []; }
}
function saveProjectsToStorage() {
  if (!currentUser) return;
  localStorage.setItem('aos_projects_' + currentUser.id, JSON.stringify(cachedProjects));
}
function loadChatsFromStorage(projectId) {
  if (!currentUser) return [];
  try { return JSON.parse(localStorage.getItem('aos_chats_' + currentUser.id + '_' + projectId)) || []; }
  catch(e) { return []; }
}
function saveChatsToStorage(projectId, sessions) {
  if (!currentUser) return;
  localStorage.setItem('aos_chats_' + currentUser.id + '_' + projectId, JSON.stringify(sessions));
}

/* ---------- Init ---------- */
async function init() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) { window.location.href = 'index.html'; return; }
  
  currentUser = session.user;
  const name = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const avatarUrl = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture;

  ['sb-avatar', 'tb-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (avatarUrl) {
        el.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        el.style.background = 'transparent';
      } else {
        el.textContent = initials;
      }
    }
  });
  
  const sbName = document.getElementById('sb-name');
  const sbEmail = document.getElementById('sb-email');
  const tbName = document.getElementById('tb-name');
  if (sbName) sbName.textContent = name;
  if (sbEmail) sbEmail.textContent = currentUser.email || '';
  if (tbName) tbName.textContent = name;

  loadProjectsFromStorage();

  const pid = new URLSearchParams(window.location.search).get('project_id');
  if (pid) {
    currentProjectId = pid;
    loadChatSessions();
  } else {
    showProjectSelectModal();
  }
}

/* ---------- Project select modal ---------- */
function showProjectSelectModal() {
  const listEl = document.getElementById('ps-list');
  if (!cachedProjects.length) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:13px">No existing projects found.</div>';
  } else {
    listEl.innerHTML = cachedProjects.map(p => `
      <div class="ps-item" id="ps-item-${p.id}" onclick="selectProject('${p.id}')">
        <div class="ps-item-name">${esc(p.name)}</div>
        <div class="ps-item-desc">${esc(p.description || 'No description')}</div>
      </div>
    `).join('');
  }
  document.getElementById('project-modal').classList.add('open');
}

let selectedProjectId = null;
function selectProject(id) {
  selectedProjectId = id;
  document.querySelectorAll('.ps-item').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('ps-item-' + id);
  if (el) el.classList.add('selected');
}

function submitProjectSelect() {
  const newName = document.getElementById('new-proj-name').value.trim();
  const newDesc = document.getElementById('new-proj-desc').value.trim();

  if (newName) {
    const newProj = { id: genId(), name: newName, description: newDesc, created_at: new Date().toISOString() };
    cachedProjects.unshift(newProj);
    saveProjectsToStorage();
    selectedProjectId = newProj.id;
  }
  if (!selectedProjectId) { showToast('Please select or create a project to continue.'); return; }

  currentProjectId = selectedProjectId;
  const url = new URL(window.location);
  url.searchParams.set('project_id', currentProjectId);
  window.history.replaceState({}, '', url);

  document.getElementById('project-modal').classList.remove('open');
  loadChatSessions();
}

/* ---------- Chat sessions ---------- */
function loadChatSessions() {
  if (!currentProjectId) return;
  chatSessions = loadChatsFromStorage(currentProjectId);
  renderChatSidebar();
  if (chatSessions.length > 0) openChatSession(0);
  else startNewChat();
}

function renderChatSidebar(filterText = '') {
  const el = document.getElementById('conv-list');
  const filteredSessions = filterText
    ? chatSessions.filter(s => (s.title || '').toLowerCase().includes(filterText.toLowerCase()))
    : chatSessions;

  if (!filteredSessions.length) {
    el.innerHTML = '<div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:13px">No conversations found.</div>';
    return;
  }

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const groups = { today: [], yesterday: [], older: [] };

  filteredSessions.forEach((s) => {
    const idx = chatSessions.findIndex(chat => chat.id === s.id);
    const d = new Date(s.created_at || Date.now()).toDateString();
    if (d === today) groups.today.push({ ...s, idx });
    else if (d === yesterday) groups.yesterday.push({ ...s, idx });
    else groups.older.push({ ...s, idx });
  });

  let html = '';
  if (groups.today.length) {
    html += `<div class="conv-group-title">Today</div>`;
    html += groups.today.map(s => sessionItemHTML(s)).join('');
  }
  if (groups.yesterday.length) {
    html += `<div class="conv-group-title">Yesterday</div>`;
    html += groups.yesterday.map(s => sessionItemHTML(s)).join('');
  }
  if (groups.older.length) {
    html += `<div class="conv-group-title">Older</div>`;
    html += groups.older.map(s => sessionItemHTML(s)).join('');
  }
  el.innerHTML = html;
}

function filterChats(text) { renderChatSidebar(text); }

function sessionItemHTML(s) {
  const time = new Date(s.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `<div class="conv-item${s.idx === activeChatIndex ? ' active' : ''}" onclick="openChatSession(${s.idx})">
    <div class="conv-item-title">${esc(s.title || 'New Conversation')}</div>
    <div class="conv-item-time">${time}</div>
    <svg class="conv-item-options" onclick="event.stopPropagation();deleteChatSession(${s.idx})" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
  </div>`;
}

function startNewChat() {
  activeChatIndex = -1;
  currentMessages = [];
  const project = cachedProjects.find(p => p.id === currentProjectId);
  const projectName = project ? project.name : 'Your Project';
  document.getElementById('messages-area').innerHTML = `
    <div class="chat-empty" id="chat-empty-state">
      <div class="chat-empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </div>
      <h3>Welcome to ${esc(projectName)}!</h3>
      <p>Tell me about your project — what are you building, what features do you need, or any questions you have. I'm here to help!</p>
    </div>`;
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
        <div class="chat-empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <h3>How can I help you today?</h3>
      </div>`;
  } else {
    area.innerHTML = currentMessages.map(m => msgHTML(m)).join('');
    area.scrollTop = area.scrollHeight;
  }
  renderChatSidebar();
}

function msgHTML(m) {
  const initial = m.role === 'user' ? 'U' : 'A';
  return `<div class="msg ${m.role}">
    <div class="msg-avatar">${initial}</div>
    <div class="msg-content">
      <div class="msg-bubble">${m.content}</div>
      <div class="msg-time">${m.time || ''} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:2px"><polyline points="20 6 9 17 4 12"/></svg></div>
    </div>
  </div>`;
}

async function fetchLLMResponse(model, message) {
  try {
    const res = await fetch('http://127.0.0.1:5000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, message: message })
    });
    const data = await res.json();
    if (data.error) {
      return `Error: ${data.error}`;
    }
    return data.reply || 'No response from backend';
  } catch(e) {
    console.error(e);
    return `Error: Failed to fetch response from backend. Make sure the python server is running on port 5000.`;
  }
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  if (!currentProjectId) { showToast('Please select a project first'); showProjectSelectModal(); return; }

  const emptyState = document.getElementById('chat-empty-state');
  if (emptyState) emptyState.remove();

  const time = getTimeStr();
  const escapedText = esc(text).replace(/\n/g, '<br>');
  currentMessages.push({ role: 'user', content: escapedText, time });

  const area = document.getElementById('messages-area');
  const userDiv = document.createElement('div');
  userDiv.innerHTML = msgHTML({ role: 'user', content: escapedText, time });
  area.appendChild(userDiv.firstElementChild);
  area.scrollTop = area.scrollHeight;

  input.value = '';
  autoResize(input);
  
  // Add loading indicator
  const loadingId = 'loading-' + Date.now();
  const aiLoadingDiv = document.createElement('div');
  aiLoadingDiv.id = loadingId;
  aiLoadingDiv.innerHTML = msgHTML({ role: 'ai', content: '<span style="color:#9ca3af;font-style:italic">Thinking...</span>', time: getTimeStr() });
  area.appendChild(aiLoadingDiv.firstElementChild);
  area.scrollTop = area.scrollHeight;

  // Call API
  const selectedModel = document.getElementById('model-select').value;
  const rawReply = await fetchLLMResponse(selectedModel, text);
  
  // Remove loading indicator
  const loadingEl = document.getElementById(loadingId);
  if (loadingEl) loadingEl.remove();

  // Format and save real reply
  const replyContent = esc(rawReply).replace(/\n/g, '<br>');
  const replyTime = getTimeStr();
  currentMessages.push({ role: 'ai', content: replyContent, time: replyTime });

  const aiDiv = document.createElement('div');
  aiDiv.innerHTML = msgHTML({ role: 'ai', content: replyContent, time: replyTime });
  area.appendChild(aiDiv.firstElementChild);
  area.scrollTop = area.scrollHeight;

  if (activeChatIndex === -1) {
    const title = text.slice(0, 30);
    const session = { id: genId(), title, messages: currentMessages, created_at: new Date().toISOString() };
    chatSessions.unshift(session);
    activeChatIndex = 0;
  } else {
    chatSessions[activeChatIndex].messages = currentMessages;
  }
  saveChatsToStorage(currentProjectId, chatSessions);
  renderChatSidebar();
}

function deleteChatSession(idx) {
  chatSessions.splice(idx, 1);
  saveChatsToStorage(currentProjectId, chatSessions);
  if (activeChatIndex === idx) {
    if (chatSessions.length > 0) openChatSession(0);
    else startNewChat();
  } else if (activeChatIndex > idx) activeChatIndex--;
  renderChatSidebar();
}

/* ---------- UI helpers ---------- */
function handleChatKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 150) + 'px'; }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('hidden'); }
function toggleDropdown() { document.getElementById('user-dropdown').classList.toggle('open'); }

document.addEventListener('click', function(e) {
  const dd = document.getElementById('user-dropdown'), btn = document.getElementById('user-btn');
  if (dd.classList.contains('open') && !dd.contains(e.target) && !btn.contains(e.target)) dd.classList.remove('open');
});

async function performLogout() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', init);
