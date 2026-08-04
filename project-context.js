/* Shared project gate for AOS tools outside the chat workspace. */
(async () => {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('project_id');
  if (!projectId) { window.location.replace('mode-selection.html'); return; }
  const client = window.supabase.createClient(
    'https://gdqapoopqijohrtovjza.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI'
  );
  const { data: { session } } = await client.auth.getSession();
  if (!session) { window.location.replace('index.html'); return; }
  const { data: project, error } = await client.from('projects').select('*').eq('id', projectId).single();
  if (error || !project) { window.location.replace('mode-selection.html'); return; }
  window.AOS_PROJECT = project;
  await client.from('projects').update({ last_opened_at: new Date().toISOString() }).eq('id', project.id);
  document.querySelectorAll('[data-project-name]').forEach((element) => { element.textContent = project.name; });
  document.querySelectorAll('.right-panel h2').forEach((heading) => {
    heading.innerHTML = '';
    const name = document.createElement('strong');
    name.textContent = project.name;
    name.style.cssText = 'display:block;font:700 22px "Plus Jakarta Sans",Inter,system-ui;color:#14213d;letter-spacing:-.35px';
    heading.append(name);
  });
})();
