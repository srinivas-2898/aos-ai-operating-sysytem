/* Image requests are sent only to the server. Never place provider keys here. */
(() => {
  const stylePrompts = {
    realistic: 'photorealistic, detailed', artistic: 'artistic, vibrant', anime: 'anime illustration',
    watercolor: 'watercolour painting', oilpainting: 'oil painting', digitalart: 'digital illustration', sketch: 'pencil sketch'
  };

  const imageEndpoint = () => {
    const chatUrl = window.AOS_AI_API_URL || '/api/chat';
    return chatUrl.replace(/\/api\/chat(?:\?.*)?$/, '/api/generate/image');
  };

  window.generateImage = async () => {
    const promptField = document.getElementById('img-prompt');
    const rawPrompt = promptField.value.trim();
    if (!rawPrompt) { showToast('Describe the image you want to create.'); promptField.focus(); return; }

    const style = document.getElementById('img-style').value;
    const ratio = document.getElementById('img-ratio').value;
    const model = document.getElementById('img-provider').value;
    const prompt = [rawPrompt, stylePrompts[style], `aspect ratio ${ratio}`].filter(Boolean).join(', ');
    const button = document.getElementById('img-gen-btn');
    const gallery = document.getElementById('img-gallery');
    button.disabled = true;
    button.textContent = 'Creating your image…';
    document.getElementById('img-gallery-empty')?.remove();

    const loading = document.createElement('div');
    loading.className = 'skeleton skeleton-img';
    loading.setAttribute('aria-label', 'Generating image');
    gallery.appendChild(loading);

    try {
      const response = await fetch(imageEndpoint(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.image_url) throw new Error(result.error || 'The image provider did not return an image.');

      const item = document.createElement('figure');
      item.className = 'gallery-img';
      item.innerHTML = `<img src="${result.image_url}" alt="${esc(rawPrompt)}"><figcaption>${esc(result.provider || 'AI')} · ${esc(result.model || 'image')}</figcaption>`;
      // The newest result remains visible as the first preview card on the right.
      gallery.prepend(item);
      const projectId = new URLSearchParams(location.search).get('project_id');
      if (projectId && result.image_url.startsWith('http')) {
        await supabase.from('generated_images').insert({ project_id: projectId, prompt: rawPrompt, storage_path: result.image_url, metadata: { provider: result.provider, model: result.model, style } });
      }
      showToast('Image generated successfully.');
    } catch (error) {
      showToast(error.message || 'Image generation failed.');
    } finally {
      loading.remove();
      button.disabled = false;
      button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Generate Image';
    }
  };
})();
