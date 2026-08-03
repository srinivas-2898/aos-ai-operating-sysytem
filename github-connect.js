/* Resilient GitHub OAuth control for the Deploy page. */
(() => {
  const SUPABASE_URL = 'https://gdqapoopqijohrtovjza.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI';

  function setStatus(message, color) {
    const status = document.getElementById('github-connect-status');
    if (!status) return;
    status.textContent = message;
    status.style.cssText = `display:block;margin:0 0 10px;font-size:12px;line-height:1.45;color:${color}`;
  }

  async function loadProjects(client) {
    const select = document.getElementById('github-proj-select');
    const list = document.getElementById('sidebar-proj-list');
    const { data: projects, error } = await client.from('projects').select('id,name').order('created_at', { ascending: false });
    if (error) {
      if (select) select.innerHTML = '<option value="">Could not load projects</option>';
      if (list) list.textContent = 'Could not load projects.';
      setStatus(`Projects could not load: ${error.message}`, '#b91c1c');
      return;
    }
    if (!projects?.length) {
      if (select) select.innerHTML = '<option value="">No AOS projects yet</option>';
      if (list) list.textContent = 'No projects saved yet';
      return;
    }
    if (select) select.innerHTML = '<option value="">Choose a project after connecting</option>' + projects.map(project => `<option value="${project.id}">${project.name.replace(/[<>&"]/g, '')}</option>`).join('');
    if (list) list.innerHTML = projects.map(project => `<span class="proj-chip">${project.name.replace(/[<>&"]/g, '')}</span>`).join('');
  }

  async function startConnection(client) {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('Your AOS session has expired. Please sign in again.');
      setStatus('Opening GitHub securely…', '#2563eb');
      const base = (window.AOS_AI_API_URL || '').replace(/\/api\/chat(?:\?.*)?$/, '');
      if (!base) throw new Error('The Railway API URL is not configured.');
      const response = await fetch(`${base}/api/github/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: '{}'
      });
      const raw = await response.text();
      let result = {};
      try { result = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`Server returned ${response.status}, not a valid API response.`); }
      if (!response.ok) throw new Error(result.detail || `GitHub OAuth failed (${response.status}).`);
      if (!result.authorization_url) throw new Error('GitHub authorization URL was not returned.');
      window.location.assign(result.authorization_url);
    } catch (error) {
      setStatus(error.message || 'GitHub connection could not start.', '#b91c1c');
    }
  }

  function showConnectedProfile(profile) {
    const card = document.getElementById('github-profile-card');
    const avatar = document.getElementById('github-profile-avatar');
    const name = document.getElementById('github-profile-name');
    if (!card || !avatar || !name) return;
    name.textContent = `@${profile.username}`;
    avatar.src = profile.avatar || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';
    card.style.display = 'flex';
    document.getElementById('gh-connected-badge').style.display = 'flex';
    const oldButton = document.getElementById('github-connect-button');
    if (oldButton) {
      const button = oldButton.cloneNode(false);
      button.id = 'github-connect-button';
      button.type = 'button';
      button.className = oldButton.className;
      button.textContent = 'Add your project to GitHub';
      oldButton.replaceWith(button);
      button.addEventListener('click', () => {
        const select = document.getElementById('github-proj-select');
        select?.focus();
        setStatus('Choose a project, then create its GitHub repository.', '#2563eb');
      });
    }
  }

  async function loadConnectedProfile(client) {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) return;
    const base = (window.AOS_AI_API_URL || '').replace(/\/api\/chat(?:\?.*)?$/, '');
    if (!base) return;
    const response = await fetch(`${base}/api/github/connection`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (response.status === 409) return;
    const raw = await response.text();
    let result = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch { return; }
    if (!response.ok) {
      if (new URLSearchParams(window.location.search).get('github') === 'connected') setStatus(result.detail || 'GitHub connection could not be loaded.', '#b91c1c');
      return;
    }
    showConnectedProfile(result);
  }

  function initialise() {
    if (!window.supabase?.createClient) return;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const oldButton = document.getElementById('github-connect-button');
    if (!oldButton) return;
    const button = oldButton.cloneNode(true);
    oldButton.replaceWith(button);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      startConnection(client);
    });
    loadProjects(client).catch(error => setStatus(error.message || 'Projects could not load.', '#b91c1c'));
    loadConnectedProfile(client).catch(error => {
      if (new URLSearchParams(window.location.search).get('github') === 'connected') setStatus(error.message || 'GitHub connection could not be loaded.', '#b91c1c');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise);
  else initialise();
})();
