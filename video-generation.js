/* Real, project-scoped video generation. Provider credentials stay on Railway. */
(() => {
  let activeController = null;
  let progressTimer = null;
  const endpoint = () => (window.AOS_AI_API_URL || '/api/chat').replace(/\/api\/chat(?:\?.*)?$/, '/api/generate/video');
  const toast = (message) => window.showToast?.(message) || console.log(message);
  const escape = (value) => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function updateProgress(value, label) {
    const panel = document.getElementById('vid-progress');
    if (!panel) return;
    panel.hidden = false;
    document.getElementById('vid-progress-bar').style.width = `${Math.min(96, Math.max(4, value))}%`;
    document.getElementById('vid-progress-label').textContent = label;
  }

  function showLoading() {
    let value = 8;
    updateProgress(value, 'Sending your secure video request…');
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      value = Math.min(92, value + (value < 55 ? 7 : 2));
      updateProgress(value, value < 55 ? 'Pollinations is preparing your video…' : 'Rendering your video…');
    }, 1800);
  }

  function stopLoading() {
    clearInterval(progressTimer);
    progressTimer = null;
    const panel = document.getElementById('vid-progress');
    if (panel) panel.hidden = true;
  }

  function downloadVideo(url, filename = 'aos-generated-video.mp4') {
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.target = '_blank';
    document.body.appendChild(link); link.click(); link.remove();
  }

  async function copyVideoUrl(url) {
    await navigator.clipboard.writeText(url);
    toast('Video URL copied.');
  }

  function displayVideo(file, prepend = true) {
    const gallery = document.getElementById('vid-gallery');
    if (!gallery || !file.resolved_url) return;
    if (gallery.querySelector(`[data-video-id="${file.id}"]`)) return;
    document.getElementById('vid-gallery-empty')?.remove();
    const card = document.createElement('article');
    card.className = 'video-card';
    card.dataset.videoId = file.id || '';
    const prompt = file.prompt || file.title || 'Generated video';
    const duration = file.duration_seconds ? `${file.duration_seconds} sec` : 'Video';
    card.innerHTML = `<video controls preload="metadata" playsinline src="${escape(file.resolved_url)}"></video>
      <div class="video-card-info"><strong>${escape(file.title || 'Generated video')}</strong><p title="${escape(prompt)}">${escape(prompt)}</p><small>${duration} · ${new Date(file.created_at || Date.now()).toLocaleString()}</small></div>
      <div class="video-actions"><button type="button" data-action="download">Download</button><button type="button" data-action="copy">Copy URL</button><button type="button" data-action="share">Share</button><button type="button" data-action="regenerate">Regenerate</button><button type="button" data-action="delete" class="video-delete">Delete</button></div>`;
    card.querySelector('[data-action="download"]').onclick = () => downloadVideo(file.resolved_url);
    card.querySelector('[data-action="copy"]').onclick = () => copyVideoUrl(file.resolved_url);
    card.querySelector('[data-action="share"]').onclick = async () => {
      if (navigator.share) await navigator.share({ title: file.title, url: file.resolved_url }); else await copyVideoUrl(file.resolved_url);
    };
    card.querySelector('[data-action="regenerate"]').onclick = () => { document.getElementById('vid-prompt').value = prompt; window.generateVideo(); };
    card.querySelector('[data-action="delete"]').onclick = async () => {
      if (!confirm('Delete this video from this project?')) return;
      try { await window.AOSGenerationStorage.deleteFile(file.id); card.remove(); toast('Video deleted.'); }
      catch (error) { toast(`Could not delete video: ${error.message}`); }
    };
    if (prepend) gallery.prepend(card); else gallery.append(card);
  }

  async function saveVideoHistory(blob, settings) {
    return window.AOSGenerationStorage.saveBlob({
      blob, filename: `video-${Date.now()}.mp4`, title: settings.prompt.slice(0, 90) || 'Generated video', type: 'Video', prompt: settings.prompt,
      metadata: { negative_prompt: settings.negative_prompt || null, duration_seconds: settings.duration, aspect_ratio: settings.aspect_ratio, generation_style: settings.style, generation_quality: settings.quality, generation_seed: settings.seed || null }
    });
  }

  async function generateVideo() {
    const prompt = document.getElementById('vid-prompt').value.trim();
    if (!prompt) { toast('Describe the video you want to create.'); return; }
    if (activeController) return;
    const settings = { prompt, negative_prompt: document.getElementById('vid-negative-prompt').value.trim(), duration: Number(document.getElementById('vid-duration').value), aspect_ratio: document.getElementById('vid-aspect').value, quality: document.getElementById('vid-quality').value, style: document.getElementById('vid-style').value, seed: document.getElementById('vid-seed').value ? Number(document.getElementById('vid-seed').value) : null };
    const button = document.getElementById('vid-gen-btn');
    activeController = new AbortController(); button.disabled = true; button.textContent = 'Generating video…'; showLoading();
    try {
      const response = await fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings), signal: activeController.signal });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.detail || 'Video generation failed.'); }
      const blob = await response.blob();
      if (!blob.type.startsWith('video/')) throw new Error('The provider did not return a playable video.');
      
      // Render the video instantly via local object URL so it shows up immediately
      const objectUrl = URL.createObjectURL(blob);
      const tempId = `temp-${Date.now()}`;
      displayVideo({
        id: tempId,
        title: settings.prompt.slice(0, 90) || 'Generated video',
        prompt: settings.prompt,
        duration_seconds: settings.duration,
        created_at: new Date().toISOString(),
        resolved_url: objectUrl
      });
      toast('Video generated successfully.');

      // Save to project storage in the background
      try {
        updateProgress(100, 'Saving video to project history…');
        const saved = await saveVideoHistory(blob, settings);
        if (saved && saved.id) {
          // Update the temp card attributes & action handlers with real DB values
          const card = document.querySelector(`[data-video-id="${tempId}"]`);
          if (card) {
            card.dataset.videoId = saved.id;
            const deleteBtn = card.querySelector('[data-action="delete"]');
            if (deleteBtn) {
              deleteBtn.onclick = async () => {
                if (!confirm('Delete this video from this project?')) return;
                try {
                  await window.AOSGenerationStorage.deleteFile(saved.id);
                  card.remove();
                  toast('Video deleted.');
                } catch (error) {
                  toast(`Could not delete video: ${error.message}`);
                }
              };
            }
          }
        }
      } catch (saveError) {
        console.error('Failed to persist video history:', saveError);
        toast('Video is displayed, but could not be saved to project history.');
      }
    } catch (error) {
      if (error.name === 'AbortError') toast('Video generation cancelled.');
      else toast(`${error.message} Retry when you are ready.`);
    } finally { stopLoading(); activeController = null; button.disabled = false; button.textContent = 'Generate Video'; document.dispatchEvent(new CustomEvent('aos-generation-finished')); }
  }

  function initializeVideoGeneration() {
    document.getElementById('vid-cancel-btn')?.addEventListener('click', () => activeController?.abort());
  }

  // Register history listeners synchronously immediately as the script runs to prevent race conditions
  document.addEventListener('aos-generation-history', (event) => {
    event.detail.filter(file => file.generation_type === 'video' && file.resolved_url).forEach(file => displayVideo(file, false));
  });

  window.initializeVideoGeneration = initializeVideoGeneration;
  window.generateVideo = generateVideo;
  window.showLoading = showLoading;
  window.updateProgress = updateProgress;
  window.displayVideo = displayVideo;
  window.downloadVideo = downloadVideo;
  window.saveVideoHistory = saveVideoHistory;
  window.loadVideoHistory = () => window.AOSGenerationStorage.loadHistory();
  window.deleteVideo = (id) => window.AOSGenerationStorage.deleteFile(id);
  document.addEventListener('DOMContentLoaded', initializeVideoGeneration);
})();
