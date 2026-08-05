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
    const { data: rawProjects, error } = await client.from('projects').select('id,name,description').order('created_at', { ascending: false });
    if (error) {
      if (select) select.innerHTML = '<option value="">Could not load projects</option>';
      if (list) list.textContent = 'Could not load projects.';
      setStatus(`Projects could not load: ${error.message}`, '#b91c1c');
      return;
    }
    const projects = (rawProjects || []).filter(p => !p.description?.startsWith('[DELETED]'));
    if (!projects?.length) {
      if (select) select.innerHTML = '<option value="">No AOS projects yet</option>';
      if (list) list.textContent = 'No projects saved yet';
      return;
    }
    if (select) select.innerHTML = '<option value="">Choose a project after connecting</option>' + projects.map(project => `<option value="${project.id}">${project.name.replace(/[<>&"]/g, '')}</option>`).join('');
    if (list) list.innerHTML = projects.map(project => `<span class="proj-chip">${project.name.replace(/[<>&"]/g, '')}</span>`).join('');
    const requestedProject = new URLSearchParams(window.location.search).get('project_id');
    if (requestedProject && projects.some(project => project.id === requestedProject) && select) select.value = requestedProject;
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
      const message = error instanceof TypeError && /fetch/i.test(error.message)
        ? 'The AOS backend is not responding. Restart the Railway service, then try again.'
        : (error.message || 'GitHub connection could not start.');
      setStatus(message, '#b91c1c');
    }
  }

  function showConnectedProfile(profile) {
    const title = document.getElementById('gh-connect-title');
    const subtitle = document.getElementById('gh-connect-subtitle');
    const iconWrapper = document.getElementById('gh-connect-icon-wrapper');
    const footer = document.getElementById('gh-connect-footer');
    const btn = document.getElementById('github-connect-button');
    const selectLabel = document.querySelector('label[for="github-proj-select"]');

    if (title) title.textContent = `@${profile.username}`;
    if (subtitle) {
      subtitle.innerHTML = '<span style="color:#10b981;font-weight:600">✓ GitHub Connected</span>';
    }
    if (iconWrapper) {
      iconWrapper.innerHTML = `<img src="${profile.avatar || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'}" alt="GitHub Profile" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #7c3aed;">`;
      iconWrapper.style.background = 'none';
      iconWrapper.style.padding = '0';
    }
    if (selectLabel) selectLabel.textContent = 'Select AOS Project to Link:';
    
    if (btn) {
      const button = btn.cloneNode(false);
      button.id = 'github-connect-button';
      button.type = 'button';
      button.className = btn.className;
      button.textContent = 'Link project & Create GitHub Repo';
      btn.replaceWith(button);
      button.addEventListener('click', () => {
        const select = document.getElementById('github-proj-select');
        if (!select || !select.value) {
          setStatus('Please select an AOS project from the dropdown first.', '#b91c1c');
          return;
        }
        if (window.createRepository) {
          window.createRepository();
        }
      });
    }

    if (footer) {
      footer.innerHTML = `<a href="#" id="github-disconnect-link" style="color:#ef4444;text-decoration:underline;font-weight:600;">Disconnect GitHub Account</a>`;
      document.getElementById('github-disconnect-link').onclick = async (e) => {
        e.preventDefault();
        if (!confirm('Are you sure you want to disconnect your GitHub account?')) return;
        try {
          const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
          const { data: { session } } = await client.auth.getSession();
          const base = (window.AOS_AI_API_URL || '').replace(/\/api\/chat(?:\?.*)?$/, '');
          await fetch(`${base}/api/github/disconnect`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
          window.location.reload();
        } catch (err) {
          alert('Failed to disconnect: ' + err.message);
        }
      };
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
      if (new URLSearchParams(window.location.search).get('github') === 'connected') {
        const message = error instanceof TypeError && /fetch/i.test(error.message)
          ? 'GitHub is connected, but the AOS backend is not responding. Restart Railway, then reload this page.'
          : (error.message || 'GitHub connection could not be loaded.');
        setStatus(message, '#b91c1c');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise);
  else initialise();
})();
