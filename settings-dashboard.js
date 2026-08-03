(() => {
  const SUPABASE_URL = 'https://gdqapoopqijohrtovjza.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI';

  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const client = () => window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_KEY);
  const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
  const validUrl = value => /^https?:\/\//i.test(String(value || '')) ? String(value) : '';
  const timeLabel = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Time unavailable';

  function provider(provider) {
    const name = String(provider || 'Deployment');
    const normalized = name.toLowerCase();
    const map = {
      netlify: ['N', 'linear-gradient(135deg,#14b8a6,#0e7490)'],
      vercel: ['▲', 'linear-gradient(135deg,#111827,#334155)'],
      firebase: ['◆', 'linear-gradient(135deg,#f59e0b,#ea580c)'],
      render: ['R', 'linear-gradient(135deg,#7c3aed,#a855f7)'],
      railway: ['R', 'linear-gradient(135deg,#111827,#4f46e5)'],
      cloudflare: ['CF', 'linear-gradient(135deg,#f97316,#f59e0b)']
    };
    return { name, mark: map[normalized]?.[0] || '↗', color: map[normalized]?.[1] || 'linear-gradient(135deg,#2563eb,#7c3aed)' };
  }

  function sourceLabel(item) {
    const source = validUrl(item.metadata?.source_url);
    if (!source) return item.metadata?.source_type === 'aos-project' ? 'AOS project files' : 'Source not recorded';
    try {
      const parsed = new URL(source);
      return `${parsed.hostname.replace(/^www\./, '')} · ${parsed.pathname.replace(/^\//, '').replace(/\.git$/, '')}`;
    } catch (_) { return 'GitHub repository'; }
  }

  function renderProjects(container, projects) {
    if (!container) return;
    if (!projects?.length) {
      container.innerHTML = '<div class="settings-empty"><b>No projects yet</b>Create a project to start building in AOS.</div>';
      return;
    }
    container.innerHTML = projects.map(project => `
      <article class="project-mini">
        <div class="project-mini-top"><span class="project-mini-icon">✦</span><strong>${escapeHtml(project.name || 'Untitled project')}</strong></div>
        <p>${escapeHtml(project.description || 'No description provided yet.')}</p>
        <time>Created ${escapeHtml(timeLabel(project.created_at))}</time>
      </article>`).join('');
  }

  function renderDeployments(container, deployments) {
    if (!container) return;
    if (!deployments?.length) {
      container.innerHTML = '<div class="settings-empty"><b>No deployment history yet</b>Successful deployments will appear here automatically.</div>';
      return;
    }
    container.innerHTML = deployments.map(item => {
      const service = provider(item.provider);
      const status = String(item.status || 'pending').toLowerCase();
      const project = item.projects?.name || 'AOS project';
      const source = sourceLabel(item);
      const url = validUrl(item.deployment_url);
      const urlHtml = url ? ` · <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open live site ↗</a>` : '';
      return `<article class="deployment-row">
        <span class="provider-logo" style="background:${service.color}">${escapeHtml(service.mark)}</span>
        <div class="deployment-main"><div class="deployment-name"><span>${escapeHtml(project)}</span><span>·</span><span>${escapeHtml(service.name)}</span></div>
          <div class="deployment-meta">${escapeHtml(source)} · ${escapeHtml(timeLabel(item.created_at))}${urlHtml}</div></div>
        <span class="deployment-status status-${escapeHtml(status)}">${escapeHtml(status)}</span>
      </article>`;
    }).join('');
  }

  async function showSettings() {
    const view = document.getElementById('view-settings');
    if (!view) return;
    document.querySelectorAll('.view').forEach(item => item.classList.remove('active'));
    view.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById('nav-settings')?.classList.add('active');

    const supabase = client();
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const user = session.user;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'AOS user';
    const initial = name.trim().charAt(0).toUpperCase() || 'A';
    setText('settings-hub-name', name); setText('settings-hub-email', user.email || 'No email'); setText('settings-hub-id', user.id.slice(0, 8)); setText('settings-avatar', initial);
    setText('settings-name', name); setText('settings-email', user.email || '—'); setText('settings-uid', user.id);

    const [projectsResult, deploymentsResult] = await Promise.all([
      supabase.from('projects').select('id,name,description,created_at').order('created_at', { ascending: false }),
      supabase.from('deployments').select('project_id,provider,status,deployment_url,metadata,created_at,projects(name)').order('created_at', { ascending: false }).limit(50)
    ]);

    const projects = projectsResult.data || [];
    const deployments = deploymentsResult.data || [];
    const projectsTarget = document.getElementById('settings-hub-projects');
    const deploymentsTarget = document.getElementById('settings-hub-deployments');
    if (projectsResult.error && projectsTarget) projectsTarget.innerHTML = '<div class="settings-empty"><b>Projects unavailable</b>Please reload this page.</div>';
    else renderProjects(projectsTarget, projects);
    if (deploymentsResult.error && deploymentsTarget) deploymentsTarget.innerHTML = '<div class="settings-empty"><b>Deployment history unavailable</b>Run the Supabase project migration, then reload.</div>';
    else renderDeployments(deploymentsTarget, deployments);

    setText('settings-project-count', String(projects.length));
    setText('settings-deployment-count', String(deployments.length));
    setText('settings-live-count', String(deployments.filter(item => ['success', 'ready'].includes(String(item.status || '').toLowerCase())).length));
  }

  function bind() {
    const navigation = document.getElementById('nav-settings');
    if (!navigation) return;
    navigation.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); showSettings(); }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  window.showAosSettings = showSettings;
  if (new URLSearchParams(window.location.search).get('view') === 'settings') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showSettings); else showSettings();
  }
})();
