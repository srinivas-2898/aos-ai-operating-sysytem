/* Supabase-backed chat runtime. All chat state is persisted in Supabase. */
const SUPABASE_URL = 'https://gdqapoopqijohrtovjza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// When AOS is deployed on Railway, Flask and the frontend share one domain.
// A separate API URL can still be supplied for split Hosting/API deployments.
const AI_API_URL = window.AOS_AI_API_URL || '/api/chat';
const getBackendUrl = (path) => {
  const base = AI_API_URL.replace(/\/api\/chat(?:\?.*)?$/, '');
  return `${base}${path}`;
};

let currentUser = null;
let currentProject = null;
let chatSessions = [];
let activeSessionId = null;
let isSending = false;

let projectContext = {
  project_name: '',
  description: '',
  features: [],
  platform: '',
  target_users: '',
  full_conversation: ''
}

let messageCount = 0
let projectSaved = false

const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const formatMessage = (value) => {
  if (!value) return '';
  
  // First escape HTML to prevent XSS
  let escaped = String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
    
  // 1. Code blocks: ```lang\ncode\n```
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)\n```/g;
  escaped = escaped.replace(codeBlockRegex, (match, lang, code) => {
    const lines = code.trim().split('\n');
    const lineNumbersHtml = lines.map((_, i) => `<span class="line-num">${i + 1}</span>`).join('');
    const codeLinesHtml = lines.map(line => `<span class="code-line">${line || ' '}</span>`).join('');
    
    const displayLang = lang.toUpperCase() || 'CODE';
    const filename = lang ? `index.${lang}` : 'snippet.txt';
    const safeCodeText = code.replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/'/g, "\\'").replace(/"/g, '\\"');
    
    return `
      <div class="code-container">
        <div class="code-header">
          <span class="file-info">
            <svg class="file-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ${filename}
          </span>
          <span class="lang-tag">${displayLang}</span>
          <button class="copy-btn" onclick="navigator.clipboard.writeText(\`${safeCodeText}\`); showToast('Code copied to clipboard!')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
        <div class="code-body">
          <div class="line-numbers">${lineNumbersHtml}</div>
          <pre class="code-pre"><code>${codeLinesHtml}</code></pre>
        </div>
      </div>
    `;
  });
  
  // 2. Inline code: `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  
  // 3. Bold: **text**
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // 4. Links: [text](url)
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="chat-link" target="_blank">$1</a>');

  // 5. Bullet lists: * item or - item (must be at start of line or after \n)
  escaped = escaped.replace(/(?:^|\n)[*\-]\s+(.+)/g, '\n<li>$1</li>');
  escaped = escaped.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  
  // Convert remaining newlines to <br>
  escaped = escaped.replace(/\n/g, '<br>');
  
  return escaped;
};

const sessionTitle = (text) => text.trim().replace(/\s+/g, ' ').slice(0, 48) || 'New Chat';

function showToast(message) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2800);
  }
}

function populateUserUI(user) {
  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';
  const initial = name.charAt(0).toUpperCase();
  document.querySelectorAll('.user-name, .username, [data-username]').forEach((el) => { el.textContent = name; });
  document.querySelectorAll('.user-email, .useremail, [data-email]').forEach((el) => { el.textContent = user.email || ''; });
  document.querySelectorAll('.user-avatar, .avatar-initial, [data-initial]').forEach((el) => { el.textContent = initial; });
}

function renderEmptyState() {
  const area = document.getElementById('messages-area');
  const banner = document.getElementById('project-setup-banner');
  const bannerOuterHTML = banner ? banner.outerHTML : '';
  
  area.innerHTML = bannerOuterHTML + '<div class="chat-empty" id="chat-empty-state"><div class="chat-empty-icon">&#128172;</div><h3>How can I help you today?</h3><p>Start a conversation to save it securely to your chat history.</p></div>';
  
  const newBanner = document.getElementById('project-setup-banner');
  const savedName = localStorage.getItem('aos_project_name');
  if (savedName) {
    if (newBanner) newBanner.style.display = 'none';
    projectContext.project_name = savedName;
  } else {
    if (newBanner) newBanner.style.display = 'block';
  }
}

function renderMessage(message) {
  const isUser = message.role === 'user';
  const initial = isUser ? 'U' : 'A';
  
  let avatarHtml = `<div class="msg-avatar">${initial}</div>`;
  if (!isUser) {
    avatarHtml = `
      <div class="msg-avatar">
        <svg class="ai-avatar-svg" width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="18" cy="18" r="18" fill="#0A1629"/>
          <path d="M18 8L27 24H23L18 15L13 24H9L18 8Z" fill="url(#aos-grad-mob)"/>
          <path d="M18 18L21 24H15L18 18Z" fill="#30D5C8"/>
          <defs>
            <linearGradient id="aos-grad-mob" x1="18" y1="8" x2="18" y2="24" gradientUnits="userSpaceOnUse">
              <stop stop-color="#3b82f6"/>
              <stop offset="1" stop-color="#06b6d4"/>
            </linearGradient>
          </defs>
        </svg>
        <span class="desktop-avatar-text">A</span>
      </div>
    `;
  }
  
  const date = message.created_at ? new Date(message.created_at) : null;
  const time = date && !Number.isNaN(date.valueOf()) ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const checkmarkHtml = isUser ? ` <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px; vertical-align:middle;"><path d="M2 12l5.25 5L22 6"/><path d="M8 12l2.25 2.5L16 9"/></svg>` : '';
  
  return `<div class="msg ${message.role}">${avatarHtml}<div class="msg-content"><div class="msg-bubble">${formatMessage(message.content)}</div><div class="msg-time">${time}${checkmarkHtml}</div></div></div>`;
}

function renderSuggestionChipsForLatestMsg() {
  document.querySelectorAll('.suggestion-chips').forEach(el => el.remove());
  const area = document.getElementById('messages-area');
  const messages = area.querySelectorAll('.msg');
  if (!messages.length) return;
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg.classList.contains('ai')) return;
  
  const contentText = lastMsg.querySelector('.msg-bubble').textContent.toLowerCase();
  let chips = [];
  if (contentText.includes('landing page') || contentText.includes('html') || contentText.includes('css')) {
    chips = [
      { text: 'Add JavaScript', label: 'Add JavaScript', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>' },
      { text: 'Add pricing section', label: 'Add Pricing Section', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
      { text: 'Add FAQ section', label: 'Add FAQ Section', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' }
    ];
  } else {
    chips = [
      { text: 'Explain the code', label: 'Explain Code', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
      { text: 'Can you optimize this?', label: 'Optimize Code', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' },
      { text: 'Find bugs in this snippet', label: 'Find Bugs', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>' }
    ];
  }
  
  const chipsHtml = `
    <div class="suggestion-chips">
      ${chips.map(chip => `
        <div class="suggestion-chip" onclick="handleChipClick('${chip.text.replace(/'/g, "\\'")}')">
          ${chip.icon}
          <span>${chip.label}</span>
        </div>
      `).join('')}
    </div>
  `;
  lastMsg.insertAdjacentHTML('afterend', chipsHtml);
}

window.handleChipClick = function(text) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = text;
    sendChatMessage();
  }
};

function appendMessageWithDateCheck(m) {
  const area = document.getElementById('messages-area');
  const dividers = area.querySelectorAll('.date-divider');
  const todayStr = new Date().toDateString();
  let hasTodayDivider = false;
  dividers.forEach(div => {
    if (div.textContent === 'Today') hasTodayDivider = true;
  });
  if (!hasTodayDivider) {
    area.insertAdjacentHTML('beforeend', `<div class="date-divider">Today</div>`);
  }
  area.insertAdjacentHTML('beforeend', renderMessage(m));
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
    
    // Render with date dividers
    let html = '';
    let lastDateStr = '';
    if (data && data.length) {
      data.forEach(m => {
        if (m.created_at) {
          const dStr = new Date(m.created_at).toDateString();
          if (dStr !== lastDateStr) {
            let label = 'Today';
            const today = new Date().toDateString();
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            if (dStr === today) label = 'Today';
            else if (dStr === yesterday) label = 'Yesterday';
            else label = new Date(m.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            
            html += `<div class="date-divider">${label}</div>`;
            lastDateStr = dStr;
          }
        }
        html += renderMessage(m);
      });
    }
    
    area.innerHTML = html;
    if (!data?.length) {
      renderEmptyState();
      messageCount = 0;
      projectSaved = false;
      const existingBtn = document.getElementById('generate-btn-container');
      if (existingBtn) existingBtn.remove();
    } else {
      renderSuggestionChipsForLatestMsg();
      const aiMsgs = data.filter(m => m.role === 'ai');
      messageCount = aiMsgs.length;
      if (messageCount >= 3) {
        showGenerateButton();
      } else {
        const existingBtn = document.getElementById('generate-btn-container');
        if (existingBtn) existingBtn.remove();
      }
    }
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
    appendMessageWithDateCheck(userMessage);
    input.value = '';
    autoResize(input);
    const indicator = document.createElement('div');
    indicator.id = 'ai-loading-indicator';
    indicator.className = 'msg ai';
    indicator.innerHTML = `
      <div class="msg-avatar">
        <svg class="ai-avatar-svg" width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="18" cy="18" r="18" fill="#0A1629"/>
          <path d="M18 8L27 24H23L18 15L13 24H9L18 8Z" fill="url(#aos-grad-mob)"/>
          <path d="M18 18L21 24H15L18 18Z" fill="#30D5C8"/>
          <defs>
            <linearGradient id="aos-grad-mob" x1="18" y1="8" x2="18" y2="24" gradientUnits="userSpaceOnUse">
              <stop stop-color="#3b82f6"/>
              <stop offset="1" stop-color="#06b6d4"/>
            </linearGradient>
          </defs>
        </svg>
        <span class="desktop-avatar-text">A</span>
      </div>
      <div class="msg-content"><div class="msg-bubble"><em>Thinking...</em></div></div>
    `;
    area.appendChild(indicator);
    area.scrollTop = area.scrollHeight;
    const reply = await requestAiReply(content);
    indicator.remove();
    const { data: assistantMessage, error: assistantError } = await supabaseClient.from('messages').insert({ session_id: sessionId, project_id: currentProject.id, role: 'ai', content: reply }).select().single();
    if (assistantError) throw assistantError;
    appendMessageWithDateCheck(assistantMessage);
    renderSuggestionChipsForLatestMsg();

    messageCount++;
    if (messageCount >= 3) {
      analyzeAndExtractProject().catch(e => console.error('Project extraction failed:', e));
    }

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
  // Check if project name already saved in localStorage
  const savedProjectName = localStorage.getItem('aos_project_name');
  const setupBanner = document.getElementById('project-setup-banner');
  if (savedProjectName) {
    if (setupBanner) setupBanner.style.display = 'none';
    projectContext.project_name = savedProjectName;
  } else {
    if (setupBanner) setupBanner.style.display = 'block';
  }

  // On mobile viewports, start with the sidebar hidden and clean up placeholder
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('hidden');
    
    const chatInput = document.getElementById('chat-input');
    if (chatInput) chatInput.placeholder = 'Ask anything...';
    
    const disclaimer = document.querySelector('.chat-disclaimer');
    if (disclaimer) disclaimer.textContent = 'Shift + Enter for new line';
  }

  // Close dropdown or mobile sidebar when clicking outside
  document.addEventListener('click', (e) => {
    // 1. Dropdown close check
    const dd = document.getElementById('user-dropdown');
    const userBtn = document.getElementById('user-btn');
    if (dd && dd.classList.contains('open') && !dd.contains(e.target) && !userBtn.contains(e.target)) {
      dd.classList.remove('open');
    }
    
    // 2. Mobile sidebar close check
    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById('sidebar');
      const menuBtn = document.querySelector('.mobile-menu-btn');
      if (sidebar && !sidebar.classList.contains('hidden')) {
        if (!sidebar.contains(e.target) && (!menuBtn || !menuBtn.contains(e.target))) {
          sidebar.classList.add('hidden');
        }
      }
    }
  });

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
      localStorage.setItem('aos_current_project', JSON.stringify(currentProject));
      const crumb = document.querySelector('.tb-breadcrumb');
      if (crumb) crumb.lastChild.textContent = ` ${currentProject.name}`;

      // Mobile project selector updates
      const mobProjName = document.getElementById('mobile-proj-name');
      if (mobProjName) mobProjName.textContent = currentProject.name;
      
      const deployLink = document.getElementById('nav-deployments');
      if (deployLink) {
        deployLink.href = `deploy.html?project_id=${currentProject.id}`;
      }

      await supabaseClient.from('projects').update({ last_opened_at: new Date().toISOString() }).eq('id', currentProject.id);
      
      const genBtn = document.getElementById('floating-generate-btn');
      if (genBtn) genBtn.style.display = 'flex';
      
      await loadChatSessions();
      
      if (sessionStorage.getItem('aos_pending_generate') === 'true') {
        sessionStorage.removeItem('aos_pending_generate');
        setTimeout(() => {
          if (typeof openGenerationModal === 'function') openGenerationModal();
        }, 800);
      }
    } catch (error) {
      console.error(error);
      showToast(`Could not open project: ${error.message}`);
      window.setTimeout(() => { window.location.href = 'mode-selection.html'; }, 1200);
    }
  });
});

async function analyzeAndExtractProject() {
  const allMessages = getAllChatMessages()
  
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_DEEPSEEK_KEY',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'Extract project information from conversation. Return ONLY valid JSON: {"project_name": "name", "description": "full description", "features": ["feature1", "feature2"], "platform": "mobile/web/both", "target_users": "who uses it", "pages": ["page1", "page2", "page3"], "color_scheme": "suggested colors", "app_type": "navigation/ecommerce/social etc"}'
        },
        {
          role: 'user',
          content: 'Extract project info from this conversation: ' + allMessages
        }
      ],
      max_tokens: 1000
    })
  })
  
  const data = await response.json()
  const content = data.choices[0].message.content
  
  try {
    const extracted = JSON.parse(content)
    projectContext = { ...projectContext, ...extracted }
    projectContext.full_conversation = allMessages
    await saveProjectToSupabase()
    showGenerateButton()
  } catch(e) {
    console.log('Extraction failed', e)
  }
}

async function saveProjectToSupabase() {
  if (projectSaved) return
  const { data: { session } } = await supabaseClient.auth.getSession()
  if (!session) return
  
  const { data, error } = await supabaseClient
    .from('projects')
    .insert({
      user_id: session.user.id,
      name: projectContext.project_name || 'My Project',
      description: projectContext.description,
      status: 'planning',
      metadata: projectContext
    })
    .select()
  
  if (data && data[0]) {
    projectContext.project_id = data[0].id
    localStorage.setItem('aos_current_project', JSON.stringify(projectContext))
    projectSaved = true
  }
}

function getAllChatMessages() {
  const messages = document.querySelectorAll('.msg-bubble, .message-text, .chat-message, [class*="message"]')
  return Array.from(messages).map(m => m.textContent).join('\n')
}

function openGenerationModal() {
  const modal = document.getElementById('generate-options-modal');
  if (modal) modal.classList.add('open');
}

function closeGenerationModal() {
  const modal = document.getElementById('generate-options-modal');
  if (modal) modal.classList.remove('open');
}

async function triggerAutomaticGeneration(genType, event) {
  const messages = [];
  document.querySelectorAll('.msg').forEach(el => {
    const role = el.classList.contains('user') ? 'user' : 'ai';
    const contentEl = el.querySelector('.msg-bubble');
    if (contentEl) {
      messages.push({ role, content: contentEl.innerText.trim() });
    }
  });
  
  if (messages.length === 0) {
    showToast('Please type some instructions in the chat before generating.');
    return;
  }
  
  const btn = event ? event.currentTarget : null;
  let origText = '';
  if (btn) {
    origText = btn.innerHTML;
    btn.innerHTML = '<span style="display:flex;align-items:center;gap:8px;"><span class="opt-icon">⚡</span><strong>Extracting requirements...</strong></span>';
    btn.disabled = true;
  }
  
  try {
    const res = await fetch(getBackendUrl('/api/extract-prompt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, gen_type: genType })
    });
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    if (!data.success || !data.prompt) throw new Error('Failed to parse response prompt');
    
    // The prompt is temporary navigation state, not persistent project data.
    sessionStorage.setItem('aos_auto_prompt', data.prompt);
    
    let tabName = 'ui-screens';
    if (genType === 'video') tabName = 'videos';
    if (genType === 'pdf') tabName = 'documents';
    if (genType === 'presentation') tabName = 'presentations';
    
    sessionStorage.setItem('aos_pending_generate', 'true');
    closeGenerationModal();
    window.location.href = `generation.html?project_id=${currentProject.id}&auto=true#${tabName}`;
  } catch (err) {
    console.error(err);
    // Do not block the user's workflow if an AI provider is temporarily
    // unavailable. The existing chat is the real project brief, so carry it
    // into Generation Studio as a usable prompt instead of showing an error.
    const conversationPrompt = messages
      .map(({ role, content }) => `${role === 'user' ? 'User requirement' : 'AI context'}: ${content}`)
      .join('\n\n')
      .slice(0, 14000);
    sessionStorage.setItem('aos_auto_prompt', conversationPrompt);
    showToast('Opening Generation Studio with your chat requirements.');
    let tabName = 'ui-screens';
    if (genType === 'video') tabName = 'videos';
    if (genType === 'pdf') tabName = 'documents';
    if (genType === 'presentation') tabName = 'presentations';
    
    sessionStorage.setItem('aos_pending_generate', 'true');
    closeGenerationModal();
    window.location.href = `generation.html?project_id=${currentProject.id}&auto=true#${tabName}`;
  } finally {
    if (btn) {
      btn.innerHTML = origText;
      btn.disabled = false;
    }
  }
}

// Bind globally for inline HTML references
window.openGenerationModal = openGenerationModal;
window.closeGenerationModal = closeGenerationModal;
window.triggerAutomaticGeneration = triggerAutomaticGeneration;

function showGenerateButton() {
  const genBtn = document.getElementById('floating-generate-btn');
  if (genBtn) genBtn.style.display = 'flex';
}
window.showGenerateButton = showGenerateButton;

async function startProject() {
  const name = document.getElementById('project-name-input').value.trim()
  if (!name) {
    document.getElementById('project-name-input').style.borderColor = '#dc2626'
    return
  }
  projectContext.project_name = name
  localStorage.setItem('aos_project_name', name)
  document.getElementById('project-setup-banner').style.display = 'none'
  
  const welcomeMsg = 'Great! Tell me everything about ' + name + '. What does it do? Who uses it? What features do you want? What platform - mobile or web?'
  await addAIMessage(welcomeMsg)
}

async function addAIMessage(content) {
  if (!activeSessionId) {
    await startNewChat();
  }
  const sessionId = activeSessionId;
  const area = document.getElementById('messages-area');
  try {
    const { data: assistantMessage, error: assistantError } = await supabaseClient.from('messages').insert({ session_id: sessionId, project_id: currentProject.id, role: 'ai', content }).select().single();
    if (assistantError) throw assistantError;
    
    document.getElementById('chat-empty-state')?.remove();
    appendMessageWithDateCheck(assistantMessage);
    area.scrollTop = area.scrollHeight;
  } catch (error) {
    console.error('Could not save welcome message:', error);
    showToast(`Could not send welcome message: ${error.message}`);
  }
}

// Bind globally
window.startProject = startProject;
window.addAIMessage = addAIMessage;
