/* Real document and presentation downloads served by the Python backend. */
(() => {
  const showToast = window.showToast || ((msg) => console.log('Toast:', msg));
  const apiEndpoint = (path) => {
    const chatUrl = window.AOS_AI_API_URL || '/api/chat';
    const base = chatUrl.replace(/\/api\/chat(?:\?.*)?$/, '');
    return `${base}${path}`;
  };

  const fileNameFrom = (response, fallback) => {
    const match = response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i);
    return match?.[1] || fallback;
  };

  const createFileCard = (gallery, blob, filename, label, icon) => {
    const url = URL.createObjectURL(blob);
    let preview = null;
    if (blob.type === 'application/pdf') {
      preview = document.createElement('iframe');
      preview.className = 'document-pdf-preview';
      preview.src = url;
      preview.title = `${label} preview`;
      gallery.prepend(preview);
    }
    const card = document.createElement('section');
    card.className = 'file-output-card';
    const symbol = document.createElement('span');
    symbol.className = 'file-output-icon';
    symbol.textContent = icon;
    const text = document.createElement('span');
    text.className = 'file-output-text';
    const name = document.createElement('strong');
    name.textContent = label;
    const detail = document.createElement('small');
    const download = document.createElement('a');
    download.className = 'file-download-button';
    download.href = url;
    download.download = filename;
    download.textContent = 'Download file';
    download.title = `Download ${filename}`;
    detail.textContent = `${filename} · Click to download`;
    text.append(name, detail);
    card.append(symbol, text, download);
    gallery.prepend(card);
    return { card, download, preview };
  };

  const addDeleteButtonToCard = (card, fileId, galleryId, emptyId, previewEl) => {
    const btn = document.createElement('button');
    btn.className = 'delete-file-btn';
    btn.title = 'Delete file';
    btn.innerHTML = '×';
    btn.addEventListener('click', async (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (!confirm('Are you sure you want to delete this file from your account?')) return;
      try {
        await window.AOSGenerationStorage.deleteFile(fileId);
        card.remove();
        if (previewEl) previewEl.remove();
        showToast('File deleted.');
        
        const gallery = document.getElementById(galleryId);
        if (gallery && gallery.querySelectorAll('.file-output-card').length === 0) {
          const empty = document.createElement('div');
          empty.id = emptyId;
          empty.className = 'gallery-empty';
          empty.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;color:#9ca3af;text-align:center;flex:1';
          if (galleryId === 'doc-gallery') {
            empty.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;opacity:0.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><p>Your preview is available here.</p>`;
          } else {
            empty.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;opacity:0.4"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><p>Your preview is available here.</p>`;
          }
          gallery.appendChild(empty);
        }
      } catch (err) {
        showToast(`Could not delete file: ${err.message}`);
      }
    });
    card.appendChild(btn);
  };

  const setBusy = (button, busy, label) => {
    button.disabled = busy;
    button.textContent = busy ? 'Creating your file…' : label;
  };

  const downloadGeneratedFile = async (path, payload, galleryId, emptyId, button, label, fallbackName, icon) => {
    const gallery = document.getElementById(galleryId);
    document.getElementById(emptyId)?.remove();
    const loading = document.createElement('div');
    loading.className = 'skeleton skeleton-img';
    gallery.appendChild(loading);
    try {
      const response = await fetch(apiEndpoint(path), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || error.detail || 'File generation failed.');
      }
      const blob = await response.blob();
      const filename = fileNameFrom(response, fallbackName);
      const { card, download, preview } = createFileCard(gallery, blob, filename, label, icon);
      try {
        const savedFile = await window.AOSGenerationStorage?.saveBlob({ blob, filename, title: filename, type: label, prompt: payload.prompt || '' });
        if (savedFile && savedFile.id) {
          addDeleteButtonToCard(card, savedFile.id, galleryId, emptyId, preview);
        }
      } catch (storageError) {
        console.error('Generation storage failed:', storageError);
        showToast(`File created, but could not save its history: ${storageError.message}`);
      }
      download.click();
      showToast(`${label} is ready. Click the card to download it.`);
    } catch (error) {
      showToast(error.message || 'File generation failed.');
    } finally {
      loading.remove();
      setBusy(button, false, button.dataset.idleLabel);
      document.dispatchEvent(new CustomEvent('aos-generation-finished'));
    }
  };

  window.generateDocument = async () => {
    const prompt = document.getElementById('doc-prompt').value.trim();
    if (!prompt) { showToast('Describe the document you want to create.'); return; }
    const button = document.getElementById('doc-gen-btn');
    button.dataset.idleLabel ||= 'Generate Document';
    setBusy(button, true);
    const documentType = document.querySelector('.doc-type-btn.selected')?.dataset.type || 'PDF';
    const isPdf = ['PDF', 'Resume', 'Invoice', 'Business Plan', 'Research Paper'].includes(documentType);
    const isWord = documentType === 'Word';
    const isExcel = documentType === 'Excel';
    const isPpt = documentType === 'PowerPoint';
    const endpoint = isPdf ? '/api/generate-pdf' : isWord ? '/api/generate-word' : isExcel ? '/api/generate-excel' : isPpt ? '/api/generate-ppt' : '/api/generate-pdf';
    const body = isPdf ? { prompt, document_type: documentType } : isWord ? { prompt, document_type: 'general' } : isExcel ? { prompt, sheet_type: 'report' } : { prompt, num_slides: 8, theme: 'professional', template: 'business' };
    const filename = isPdf ? 'generated-document.pdf' : isWord ? 'generated-document.docx' : isExcel ? 'generated-spreadsheet.xlsx' : 'generated-presentation.pptx';
    await downloadGeneratedFile(
      endpoint, body, 'doc-gallery', 'doc-gallery-empty', button, documentType, filename, '📄'
    );
  };

  window.generatePresentation = async () => {
    const prompt = document.getElementById('pres-prompt').value.trim();
    if (!prompt) { showToast('Describe the presentation you want to create.'); return; }
    const button = document.getElementById('pres-gen-btn');
    button.dataset.idleLabel ||= 'Generate Presentation';
    setBusy(button, true);
    await downloadGeneratedFile('/api/generate-ppt', {
      prompt, num_slides: Number(document.getElementById('pres-slides').value), theme: document.getElementById('pres-theme').value,
      template: document.getElementById('pres-template').value
    }, 'pres-gallery', 'pres-gallery-empty', button, 'Presentation', 'generated-presentation.pptx', '📊');
  };

  document.addEventListener('aos-generation-history', (event) => {
    event.detail.filter((file) => file.generation_type !== 'image' && file.resolved_url).forEach((file) => {
      const type = file.generation_type;
      const isPdf = type === 'pdf';
      const isWord = type === 'word';
      const isExcel = type === 'excel';
      const isPpt = type === 'powerpoint';
      
      const presentation = isPpt;
      const gallery = document.getElementById(presentation ? 'pres-gallery' : 'doc-gallery');
      const galleryId = presentation ? 'pres-gallery' : 'doc-gallery';
      const emptyId = presentation ? 'pres-gallery-empty' : 'doc-gallery-empty';
      document.getElementById(emptyId)?.remove();
      
      const card = document.createElement('a');
      card.className = 'file-output-card';
      card.href = file.resolved_url;
      card.rel = 'noopener';
      
      if (isPdf) {
        card.target = '_blank';
      } else {
        card.setAttribute('download', file.title);
      }
      
      let icon = '📄';
      let label = 'PDF';
      if (isWord) { icon = '📝'; label = 'Word'; }
      else if (isExcel) { icon = '📊'; label = 'Excel'; }
      else if (isPpt) { icon = '📈'; label = 'PPT'; }
      
      const btnText = isPdf ? 'Open file' : 'Download file';
      
      card.innerHTML = `<span class="file-output-icon">${icon}</span><span class="file-output-text"><strong></strong><small></small></span><span class="file-download-button">${btnText}</span>`;
      card.querySelector('strong').textContent = file.title;
      card.querySelector('small').textContent = `${label.toUpperCase()} · ${new Date(file.created_at).toLocaleString()}`;
      
      addDeleteButtonToCard(card, file.id, galleryId, emptyId, null);
      gallery.appendChild(card);
    });
  });
})();
