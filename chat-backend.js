/* Supabase-backed chat runtime. All chat state is persisted in Supabase. */
const SUPABASE_URL = 'https://gdqapoopqijohrtovjza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// When AOS is deployed on Railway, Flask and the frontend share one domain.
// A separate API URL can still be supplied for split Hosting/API deployments.
const AI_API_URL = window.AOS_AI_API_URL || '/api/chat';

let currentUser = null;
let currentProject = null;
let chatSessions = [];
let activeSessionId = null;
let isSending = false;

const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const formatMessage = (value) => escapeHtml(value).replace(/\n/g, '<br>');
const sessionTitle = (text) => text.trim().replace(/\s+/g, ' ').slice(0, 48) || 'New Chat';

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function populateUserUI(user) {
  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';
  const initial = name.charAt(0).toUpperCase();
  document.querySelectorAll('.user-name, .username, [data-username]').forEach((el) => { el.textContent = name; });
  document.querySelectorAll('.user-email, .useremail, [data-email]').forEach((el) => { el.textContent = user.email || ''; });
  document.querySelectorAll('.user-avatar, .avatar-initial, [data-initial]').forEach((el) => { el.textContent = initial; });
}

function renderEmptyState() {
  document.getElementById('messages-area').innerHTML = '<div class="chat-empty" id="chat-empty-state"><div class="chat-empty-icon">&#128172;</div><h3>How can I help you today?</h3><p>Start a conversation to save it securely to your chat history.</p></div>';
}

function renderMessage(message) {
  const initial = message.role === 'user' ? 'U' : 'A';
  const date = message.created_at ? new Date(message.created_at) : null;
  const time = date && !Number.isNaN(date.valueOf()) ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="msg ${message.role}"><div class="msg-avatar">${initial}</div><div class="msg-content"><div class="msg-bubble">${formatMessage(message.content)}</div><div class="msg-time">${time}</div></div></div>`;
}

function renderChatSidebar(filterText = '') {
  const target = document.getElementById('conv-list');
  const query = filterText.trim().toLowerCase();
  const sessions = query ? chatSessions.filter((chat) => (chat.title || '').toLowerCase().includes(query)) : chatSessions;
  if (!sessions.length) {
    target.innerHTML = '<div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:13px">No conversations found.</div>';
    return;
  }
  target.innerHTML = sessions.map((session) => `<div class="conv-item${session.id === activeSessionId ? ' active' : ''}" data-session-id="${session.id}"><div class="conv-item-title">${escapeHtml(session.title || 'New Chat')}</div><div class="conv-item-time">${new Date(session.created_at).toLocaleDateString()}</div><div class="conv-item-actions"><button class="conv-item-action" data-action="rename" title="Rename chat">&#9998;</button><button class="conv-item-action" data-action="delete" title="Delete chat">&#128465;</button></div></div>`).join('');
}

async function loadChatSessions({ openFirst = true } = {}) {
  const { data, error } = await supabaseClient.from('chat_sessions').select('*').eq('project_id', currentProject.id).order('created_at', { ascending: false });
  if (error) throw error;
  chatSessions = data || [];
  renderChatSidebar(document.getElementById('chat-search')?.value || '');
  if (openFirst && chatSessions.length) await openChatSession(chatSessions[0].id);
  if (openFirst && !chatSessions.length) renderEmptyState();
}

async function startNewChat() {
  if (!currentUser) return;
  try {
    // user_id is assigned by Postgres from auth.uid(); never trust a client-provided user id.
    const { data, error } = await supabaseClient.from('chat_sessions').insert({ project_id: currentProject.id, title: 'New Chat' }).select().single();
    if (error) throw error;
    chatSessions.unshift(data);
    activeSessionId = data.id;
    renderChatSidebar(document.getElementById('chat-search')?.value || '');
    renderEmptyState();
    document.getElementById('chat-input').focus();
  } catch (error) {
    console.error('Could not create chat:', error);
    showToast(`Could not create chat: ${error.message}`);
  }
}

async function openChatSession(sessionId) {
  activeSessionId = sessionId;
  const area = document.getElementById('messages-area');
  area.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">Loading messages...</div>';
  renderChatSidebar(document.getElementById('chat-search')?.value || '');
  try {
    const { data, error } = await supabaseClient.from('messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true });
    if (error) throw error;
    area.innerHTML = data?.length ? data.map(renderMessage).join('') : '';
    if (!data?.length) renderEmptyState();
    area.scrollTop = area.scrollHeight;
  } catch (error) {
    console.error('Could not load messages:', error);
    area.innerHTML = '<div style="padding:24px;text-align:center;color:#ef4444;font-size:13px">Could not load this conversation.</div>';
    showToast(`Could not load messages: ${error.message}`);
  }
}

async function renameChatSession(sessionId) {
  const session = chatSessions.find((item) => item.id === sessionId);
  const title = window.prompt('Enter a new name for this conversation:', session?.title || '');
  if (title === null) return;
  const trimmed = title.trim();
  if (!trimmed) return showToast('A chat name is required.');
  const { error } = await supabaseClient.from('chat_sessions').update({ title: trimmed }).eq('id', sessionId);
  if (error) return showToast(`Could not rename chat: ${error.message}`);
  session.title = trimmed;
  renderChatSidebar(document.getElementById('chat-search')?.value || '');
}

async function deleteChatSession(sessionId) {
  if (!window.confirm('Delete this conversation and all of its messages?')) return;
  const { error } = await supabaseClient.from('chat_sessions').delete().eq('id', sessionId);
  if (error) return showToast(`Could not delete chat: ${error.message}`);
  chatSessions = chatSessions.filter((session) => session.id !== sessionId);
  if (activeSessionId === sessionId) {
    activeSessionId = null;
    if (chatSessions.length) await openChatSession(chatSessions[0].id);
    else renderEmptyState();
  }
  renderChatSidebar(document.getElementById('chat-search')?.value || '');
}

async function requestAiReply(message) {
  const model = document.getElementById('model-select').value;
  const response = await fetch(AI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, message }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `AI service returned ${response.status}`);
  if (!body.reply) throw new Error('AI service returned an empty response.');
  return body.reply;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content || isSending) return;
  if (!activeSessionId) await startNewChat();
  if (!activeSessionId) return;
  isSending = true;
  document.getElementById('send-btn').disabled = true;
  const sessionId = activeSessionId;
  const area = document.getElementById('messages-area');
  try {
    const { data: userMessage, error: userError } = await supabaseClient.from('messages').insert({ session_id: sessionId, project_id: currentProject.id, role: 'user', content }).select().single();
    if (userError) throw userError;
    document.getElementById('chat-empty-state')?.remove();
    area.insertAdjacentHTML('beforeend', renderMessage(userMessage));
    input.value = '';
    autoResize(input);
    const indicator = document.createElement('div');
    indicator.id = 'ai-loading-indicator';
    indicator.className = 'msg ai';
    indicator.innerHTML = '<div class="msg-avatar">A</div><div class="msg-content"><div class="msg-bubble"><em>Thinking...</em></div></div>';
    area.appendChild(indicator);
    area.scrollTop = area.scrollHeight;
    const reply = await requestAiReply(content);
    indicator.remove();
    const { data: assistantMessage, error: assistantError } = await supabaseClient.from('messages').insert({ session_id: sessionId, project_id: currentProject.id, role: 'ai', content: reply }).select().single();
    if (assistantError) throw assistantError;
    area.insertAdjacentHTML('beforeend', renderMessage(assistantMessage));
    const session = chatSessions.find((item) => item.id === sessionId);
    if (session?.title === 'New Chat') {
      const title = sessionTitle(content);
      const { error } = await supabaseClient.from('chat_sessions').update({ title }).eq('id', sessionId);
      if (!error) session.title = title;
      renderChatSidebar(document.getElementById('chat-search')?.value || '');
    }
  } catch (error) {
    document.getElementById('ai-loading-indicator')?.remove();
    console.error('Could not send message:', error);
    showToast(`Message was not completed: ${error.message}`);
  } finally {
    isSending = false;
    document.getElementById('send-btn').disabled = false;
    area.scrollTop = area.scrollHeight;
  }
}

function filterChats(text) { renderChatSidebar(text); }
function autoResize(element) { element.style.height = 'auto'; element.style.height = `${Math.min(element.scrollHeight, 150)}px`; }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('hidden'); }
function toggleDropdown() { document.getElementById('user-dropdown').classList.toggle('open'); }
async function performLogout() { await supabaseClient.auth.signOut(); window.location.href = 'index.html'; }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('send-btn').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChatMessage(); } });
  document.getElementById('chat-input').addEventListener('input', (event) => autoResize(event.target));
  document.getElementById('conv-list').addEventListener('click', (event) => {
    const row = event.target.closest('[data-session-id]');
    if (!row) return;
    const id = row.dataset.sessionId;
    if (event.target.closest('[data-action="rename"]')) renameChatSession(id);
    else if (event.target.closest('[data-action="delete"]')) deleteChatSession(id);
    else openChatSession(id);
  });
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (!session) { window.location.href = 'index.html'; return; }
    currentUser = session.user;
    populateUserUI(currentUser);
    const projectId = new URLSearchParams(window.location.search).get('project_id');
    if (!projectId) { window.location.href = 'mode-selection.html'; return; }
    try {
      const { data, error } = await supabaseClient.from('projects').select('*').eq('id', projectId).single();
      if (error) throw error;
      currentProject = data;
      const crumb = document.querySelector('.tb-breadcrumb');
      if (crumb) crumb.lastChild.textContent = ` ${currentProject.name}`;
      await supabaseClient.from('projects').update({ last_opened_at: new Date().toISOString() }).eq('id', currentProject.id);
      await loadChatSessions();
    } catch (error) {
      console.error(error);
      showToast(`Could not open project: ${error.message}`);
      window.setTimeout(() => { window.location.href = 'mode-selection.html'; }, 1200);
    }
  });
});
