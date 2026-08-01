/* Real server-side image generation; keys remain in Railway variables. */
(() => {
  const endpoint = () => {
    const chatUrl = window.AOS_AI_API_URL || '/api/chat';
    return chatUrl.replace(/\/api\/chat(?:\?.*)?$/, '/api/generate/image');
  };

  window.generateImage = async () => {
    const prompt = document.getElementById('img-prompt').value.trim();
    if (!prompt) { showToast('Describe the image you want to create.'); return; }
    const provider = document.getElementById('img-provider').value;
    const button = document.getElementById('img-gen-btn');
    const gallery = document.getElementById('img-gallery');
    button.disabled = true;
    button.textContent = 'Generating image…';
    document.getElementById('img-gallery-empty')?.remove();
    const loading = document.createElement('div');
    loading.className = 'skeleton skeleton-img';
    loading.style.cssText = 'aspect-ratio:1;border-radius:12px;min-height:180px';
    gallery.appendChild(loading);
    try {
      const response = await fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, provider }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.image_url) throw new Error(body.error || 'Image provider returned no image.');
      loading.remove();
      const item = document.createElement('figure');
      item.className = 'gallery-img';
      item.style.cssText = 'margin:0;overflow:hidden;border-radius:12px;background:#f8fafc';
      item.innerHTML = `<img src="${body.image_url}" alt="${esc(prompt)}" style="width:100%;height:100%;min-height:180px;object-fit:cover;display:block"><figcaption style="padding:9px 10px;font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(body.provider)} · ${esc(body.model)}</figcaption>`;
      gallery.appendChild(item);
      const projectId = new URLSearchParams(window.location.search).get('project_id');
      if (projectId && body.image_url.startsWith('http')) {
        await supabase.from('generated_images').insert({ project_id: projectId, prompt, storage_path: body.image_url, metadata: { provider: body.provider, model: body.model } });
      }
      showToast('Image generated successfully.');
    } catch (error) {
      loading.remove();
      showToast(error.message || 'Image generation failed.');
    } finally {
      button.disabled = false;
      button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Generate Image';
    }
  };
})();
