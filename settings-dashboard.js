(() => {
  const url = 'https://gdqapoopqijohrtovjza.supabase.co';
  const key = 'eyJhbGciOiJIUzI1NiIsInJlZiI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI';
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  const client = () => window.supabase?.createClient ? window.supabase.createClient(url, key) : null;
  async function showSettings() {
    const view = document.getElementById('view-settings');
    if (!view) return;
    document.querySelectorAll('.view').forEach(item => item.classList.remove('active'));
    view.classList.add('active');
    const supabase = client();
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { location.href = 'index.html'; return; }
    const user = session.user;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'AOS user';
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('settings-name', name); set('settings-email', user.email || '—'); set('settings-uid', user.id);
    const [projectsResult, deploymentsResult] = await Promise.all([
      supabase.from('projects').select('id,name,description,created_at').order('created_at', { ascending: false }),
      supabase.from('deployments').select('provider,status,deployment_url,created_at,projects(name)').order('created_at', { ascending: false }).limit(20)
    ]);
    const projectsEl = document.getElementById('settings-projects');
    const deploymentsEl = document.getElementById('settings-deployments');
    if (projectsEl) projectsEl.innerHTML = projectsResult.error ? '<div style="font-size:13px;color:#dc2626">Could not load projects.</div>' :
      projectsResult.data?.length ? projectsResult.data.map(project => `<div style="padding:12px 0;border-bottom:1px solid #eef2f7"><strong style="font-size:14px;color:#1e293b">${esc(project.name)}</strong><div style="font-size:12px;color:#71809a;margin-top:4px">${esc(project.description || 'No description')}</div></div>`).join('') : '<div style="font-size:13px;color:#94a3b8">No projects created yet.</div>';
    if (deploymentsEl) deploymentsEl.innerHTML = deploymentsResult.error ? '<div style="font-size:13px;color:#dc2626">Could not load deployments.</div>' :
      deploymentsResult.data?.length ? deploymentsResult.data.map(item => `<div style="padding:12px 0;border-bottom:1px solid #eef2f7;display:flex;justify-content:space-between;gap:12px"><div><strong style="font-size:14px;color:#1e293b">${esc(item.projects?.name || 'Project')} · ${esc(item.provider || 'Deployment')}</strong><div style="font-size:12px;color:#71809a;margin-top:4px">${new Date(item.created_at).toLocaleString()}${item.deployment_url ? ` · <a href="${esc(item.deployment_url)}" target="_blank" rel="noopener" style="color:#2563eb">Open</a>` : ''}</div></div><span style="height:max-content;padding:4px 8px;border-radius:99px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700;text-transform:uppercase">${esc(item.status || 'pending')}</span></div>`).join('') : '<div style="font-size:13px;color:#94a3b8">No saved deployments yet.</div>';
  }
  function bind() {
    const nav = document.getElementById('nav-settings');
    if (!nav) return;
    nav.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); showSettings(); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  window.showAosSettings = showSettings;
  if (new URLSearchParams(window.location.search).get('view') === 'settings') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showSettings);
    else showSettings();
  }
})();
