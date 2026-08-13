/* Image requests are sent only to the server. Never place provider keys here. */
(() => {
  const showToast = window.showToast || ((msg) => console.log('Toast:', msg));
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
    const compactCaption = String(caption || 'Generated image')
      .replace(/\s+/g, ' ')
      .trim();
    viewer.querySelector('#image-viewer-caption').textContent = compactCaption.length > 96
      ? `${compactCaption.slice(0, 93)}…`
      : compactCaption;
    viewer.classList.add('open');
  };

  const addDeleteButton = (item, fileId) => {
    const btn = document.createElement('button');
    btn.className = 'delete-file-btn';
    btn.title = 'Delete image';
    btn.innerHTML = '×';
    btn.addEventListener('click', async (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (!confirm('Are you sure you want to delete this image?')) return;
      try {
        await window.AOSGenerationStorage.deleteFile(fileId);
        item.remove();
        showToast('Image deleted.');
        const gallery = document.getElementById('img-gallery');
        if (gallery && gallery.querySelectorAll('.gallery-img').length === 0) {
          const empty = document.createElement('div');
          empty.id = 'img-gallery-empty';
          empty.className = 'gallery-empty';
          empty.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><p>Your preview is available here.</p>`;
          gallery.appendChild(empty);
        }
      } catch (err) {
        showToast(`Could not delete image: ${err.message}`);
      }
    });
    item.appendChild(btn);
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
      addDeleteButton(item, file.id);
      gallery.appendChild(item);
    });
  });

  /** Save generated image to project history and add delete button */
  const saveToHistory = async (item, imageUrl, rawPrompt) => {
    const projectId = new URLSearchParams(location.search).get('project_id');
    if (!projectId) return;
    try {
      const dataURItoBlob = (dataURI) => {
        if (!dataURI || !dataURI.startsWith('data:')) return null;
        const parts = dataURI.split(',');
        if (parts.length < 2) return null;
        const byteString = atob(parts[1]);
        const mimeString = parts[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mimeString });
      };
      const imageBlob = dataURItoBlob(imageUrl);
      if (!imageBlob) return; // Skip non-data-URI images
      const filename = `generated-image-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.png`;
      if (!window.AOSGenerationStorage) return;
      const savedFile = await window.AOSGenerationStorage.saveBlob({
        blob: imageBlob,
        filename,
        title: rawPrompt.slice(0, 90) || 'Generated image',
        type: 'Image',
        prompt: rawPrompt
      });
      if (savedFile && savedFile.id) {
        addDeleteButton(item, savedFile.id);
      }
    } catch (storageError) {
      console.error('Generation history storage failed:', storageError);
    }
  };

  /** Create gallery item from image URL — returns a Promise that resolves when image loads */
  const createGalleryItem = (imageUrl, rawPrompt, loadingSkeleton, gallery) => {
    return new Promise((resolve, reject) => {
      const item = document.createElement('figure');
      item.className = 'gallery-img';
      const preview = document.createElement('img');
      preview.alt = rawPrompt;
      preview.loading = 'eager';

      preview.addEventListener('load', () => {
        const caption = document.createElement('figcaption');
        caption.textContent = 'AOS · Generated Image';
        item.append(preview, caption);
        item.addEventListener('click', () => openViewer(imageUrl, rawPrompt));
        item.setAttribute('title', 'Click to view full screen');

        if (loadingSkeleton && loadingSkeleton.parentNode) {
          loadingSkeleton.replaceWith(item);
        } else {
          gallery.prepend(item);
        }
        resolve(item);
      }, { once: true });

      preview.addEventListener('error', () => {
        console.error('[AOS] Image failed to load:', imageUrl?.substring(0, 100));
        reject(new Error('The generated image could not be displayed.'));
      }, { once: true });

      // Set src AFTER attaching listeners
      preview.src = imageUrl;
    });
  };

  /** Generate image via HuggingFace backend (existing flow) */
  const generateViaHuggingFace = async (prompt, model, rawPrompt, gallery, loadingSkeleton, layoutMode) => {
    const response = await fetch(imageEndpoint(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model, layout_mode: layoutMode })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.image_url) {
      throw new Error(result.error || result.detail || 'The image provider did not return an image.');
    }

    console.log('[AOS] HuggingFace image received, length:', result.image_url.length);
    const item = await createGalleryItem(result.image_url, rawPrompt, loadingSkeleton, gallery);
    await saveToHistory(item, result.image_url, rawPrompt);
    return true;
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
    button.textContent = `Creating image with AI...`;
    document.getElementById('img-gallery-empty')?.remove();

    // Create skeleton
    const loading = document.createElement('div');
    loading.className = 'skeleton skeleton-img';
    loading.setAttribute('aria-label', 'Generating image');
    gallery.prepend(loading);

    try {
      const success = await generateViaHuggingFace(prompt, model, rawPrompt, gallery, loading, true);
      if (success) {
        showToast('Image generated successfully.');
      }
    } catch (err) {
      console.error('[AOS] Image generation error:', err);
      showToast(err.message || 'Image generation failed.');
    } finally {
      if (loading && loading.parentNode) loading.remove();
      button.disabled = false;
      button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Generate Image';
      document.dispatchEvent(new CustomEvent('aos-generation-finished'));
    }
  };
})();
