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

  const closeViewer = () => document.getElementById('image-viewer')?.classList.remove('open');

  const openViewer = (source, caption) => {
    let viewer = document.getElementById('image-viewer');
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.id = 'image-viewer';
      viewer.setAttribute('role', 'dialog');
      viewer.setAttribute('aria-modal', 'true');
      const close = document.createElement('button');
      close.className = 'viewer-close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Close full screen preview');
      close.textContent = '×';
      close.addEventListener('click', closeViewer);
      const image = document.createElement('img');
      image.id = 'image-viewer-preview';
      const label = document.createElement('p');
      label.className = 'viewer-caption';
      label.id = 'image-viewer-caption';
      viewer.append(close, image, label);
      viewer.addEventListener('click', (event) => { if (event.target === viewer) closeViewer(); });
      document.body.appendChild(viewer);
    }
    viewer.querySelector('#image-viewer-preview').src = source;
    viewer.querySelector('#image-viewer-preview').alt = caption;
    viewer.querySelector('#image-viewer-caption').textContent = caption;
    viewer.classList.add('open');
  };

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeViewer(); });

  document.addEventListener('aos-generation-history', (event) => {
    const gallery = document.getElementById('img-gallery');
    event.detail.filter((file) => file.generation_type === 'image' && file.resolved_url).forEach((file) => {
      document.getElementById('img-gallery-empty')?.remove();
      const item = document.createElement('figure');
      item.className = 'gallery-img';
      const image = document.createElement('img');
      image.src = file.resolved_url;
      image.alt = file.title;
      const caption = document.createElement('figcaption');
      caption.textContent = `Saved image · ${new Date(file.created_at).toLocaleDateString()}`;
      item.append(image, caption);
      item.addEventListener('click', () => openViewer(file.resolved_url, file.title));
      gallery.appendChild(item);
    });
  });

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
      const preview = document.createElement('img');
      preview.src = result.image_url;
      preview.alt = rawPrompt;
      preview.loading = 'eager';
      preview.addEventListener('error', () => {
        item.remove();
        showToast('The generated image could not be displayed. Please try again.');
      }, { once: true });
      const caption = document.createElement('figcaption');
      caption.textContent = `${result.provider || 'AI'} · ${result.model || 'image'}`;
      item.append(preview, caption);
      item.addEventListener('click', () => openViewer(result.image_url, rawPrompt));
      item.setAttribute('title', 'Click to view full screen');
      // The newest result remains visible as the first preview card on the right.
      gallery.prepend(item);
      const projectId = new URLSearchParams(location.search).get('project_id');
      if (projectId) {
        try {
          // Hugging Face returns a data URL. Persist the actual bytes in the
          // private project bucket so the image survives logout and reload.
          const imageBlob = await (await fetch(result.image_url)).blob();
          const filename = `generated-image-${Date.now()}.png`;
          if (!window.AOSGenerationStorage) throw new Error('Generation storage is not ready. Refresh and try again.');
          await window.AOSGenerationStorage.saveBlob({
            blob: imageBlob,
            filename,
            title: rawPrompt.slice(0, 90) || 'Generated image',
            type: 'Image',
            prompt: rawPrompt
          });
        } catch (storageError) {
          console.error('Generation history storage failed:', storageError);
          showToast(`Image created, but its project history was not saved: ${storageError.message}`);
        }
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
