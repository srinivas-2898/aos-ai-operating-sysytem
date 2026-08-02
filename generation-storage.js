/* Project-isolated persistence for Generation Studio outputs. */
(() => {
  const projectId = new URLSearchParams(location.search).get('project_id');
  const client = window.supabase.createClient('https://gdqapoopqijohrtovjza.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI');
  const typeFor = (label) => ({ PDF: 'pdf', Word: 'word', Excel: 'excel', PowerPoint: 'powerpoint', Presentation: 'powerpoint', Image: 'image' })[label] || 'other';
  async function activeSession() {
    const { data: { session } } = await client.auth.getSession();
    if (!session || !projectId) throw new Error('Open a project before generating files.');
    return session;
  }
  async function saveBlob({ blob, filename, title, type, prompt }) {
    const session = await activeSession();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${session.user.id}/${projectId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await client.storage.from('generation-files').upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await client.from('generation_files').insert({ project_id: projectId, title, generation_type: typeFor(type), prompt, storage_path: path, status: 'ready' });
    if (error) { await client.storage.from('generation-files').remove([path]); throw error; }
  }
  async function saveExternal({ title, type, prompt, fileUrl, thumbnailUrl = null }) {
    await activeSession();
    const { error } = await client.from('generation_files').insert({ project_id: projectId, title, generation_type: typeFor(type), prompt, file_url: fileUrl, thumbnail_url: thumbnailUrl, status: 'ready' });
    if (error) throw error;
  }
  async function loadHistory() {
    try {
      await activeSession();
      const { data, error } = await client.from('generation_files').select('*').eq('project_id', projectId).eq('status', 'ready').order('created_at', { ascending: false });
      if (error) throw error;
      const files = await Promise.all((data || []).map(async (file) => {
        if (file.file_url) return { ...file, resolved_url: file.file_url };
        const { data: signed, error: signedError } = await client.storage.from('generation-files').createSignedUrl(file.storage_path, 3600);
        return signedError ? file : { ...file, resolved_url: signed.signedUrl };
      }));
      document.dispatchEvent(new CustomEvent('aos-generation-history', { detail: files }));
    } catch (error) {
      console.error('Could not load generation history:', error);
      window.showToast?.(`Could not load saved files: ${error.message}`);
    }
  }
  window.AOSGenerationStorage = { saveBlob, saveExternal, loadHistory };
  document.addEventListener('DOMContentLoaded', loadHistory);
})();
