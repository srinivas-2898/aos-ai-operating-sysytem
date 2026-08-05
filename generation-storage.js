/* Project-isolated persistence for Generation Studio outputs. */
(() => {
  const projectId = new URLSearchParams(location.search).get('project_id');
  const client = window.supabase.createClient('https://gdqapoopqijohrtovjza.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI');
  const typeFor = (label) => ({ PDF: 'pdf', Resume: 'pdf', Invoice: 'pdf', 'Business Plan': 'pdf', 'Research Paper': 'pdf', Word: 'word', Excel: 'excel', PowerPoint: 'powerpoint', Presentation: 'powerpoint', Image: 'image', Video: 'video', HTML: 'html' })[label] || 'other';
  async function activeSession() {
    const { data: { session } } = await client.auth.getSession();
    if (!session || !projectId) throw new Error('Open a project before generating files.');
    return session;
  }
  async function saveBlob({ blob, filename, title, type, prompt, metadata = {} }) {
    const session = await activeSession();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${session.user.id}/${projectId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await client.storage.from('generation-files').upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await client.from('generation_files').insert({ project_id: projectId, title, generation_type: typeFor(type), prompt, storage_path: path, status: 'ready', ...metadata }).select();
    if (error) { await client.storage.from('generation-files').remove([path]); throw error; }
    return data?.[0];
  }
  async function saveExternal({ title, type, prompt, fileUrl, thumbnailUrl = null }) {
    await activeSession();
    const { data, error } = await client.from('generation_files').insert({ project_id: projectId, title, generation_type: typeFor(type), prompt, file_url: fileUrl, thumbnail_url: thumbnailUrl, status: 'ready' }).select();
    if (error) throw error;
    return data?.[0];
  }
  async function deleteFile(fileId) {
    await activeSession();
    const { data: file, error: fetchError } = await client.from('generation_files').select('storage_path').eq('id', fileId).single();
    if (fetchError) throw fetchError;
    if (file && file.storage_path) {
      const { error: storageError } = await client.storage.from('generation-files').remove([file.storage_path]);
      if (storageError) console.error('Could not delete storage object:', storageError);
    }
    const { error: dbError } = await client.from('generation_files').delete().eq('id', fileId);
    if (dbError) throw dbError;
  }
  async function getSignedUrl(storagePath, expiresIn = 3600) {
    await activeSession();
    const { data, error } = await client.storage.from('generation-files').createSignedUrl(storagePath, expiresIn);
    if (error) throw error;
    return data.signedUrl;
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
  async function clearAllByType(generationType) {
    const session = await activeSession();
    // Get all files of this type for the project
    const { data: files, error: fetchErr } = await client.from('generation_files')
      .select('id, storage_path')
      .eq('project_id', projectId)
      .eq('generation_type', generationType);
    if (fetchErr) throw fetchErr;
    // Delete storage objects
    const storagePaths = (files || []).filter(f => f.storage_path).map(f => f.storage_path);
    if (storagePaths.length > 0) {
      await client.storage.from('generation-files').remove(storagePaths);
    }
    // Delete database records
    const { error: delErr } = await client.from('generation_files')
      .delete()
      .eq('project_id', projectId)
      .eq('generation_type', generationType);
    if (delErr) throw delErr;
    return (files || []).length;
  }
  window.AOSGenerationStorage = { saveBlob, saveExternal, loadHistory, deleteFile, getSignedUrl, clearAllByType };
  document.addEventListener('DOMContentLoaded', loadHistory);
})();
