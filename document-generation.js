/* Real document and presentation downloads served by the Python backend. */
(() => {
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
    if (blob.type === 'application/pdf') {
      const preview = document.createElement('iframe');
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
    return download;
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
      const fileCard = createFileCard(gallery, blob, filename, label, icon);
      try {
        await window.AOSGenerationStorage?.saveBlob({ blob, filename, title: filename, type: label, prompt: payload.prompt || '' });
      } catch (storageError) {
        console.error('Generation storage failed:', storageError);
        showToast(`File created, but could not save its history: ${storageError.message}`);
      }
      if (blob.type === 'application/pdf') fileCard.click();
      showToast(`${label} is ready. Click the card to download it.`);
    } catch (error) {
      showToast(error.message || 'File generation failed.');
    } finally {
      loading.remove();
      setBusy(button, false, button.dataset.idleLabel);
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
      const presentation = file.generation_type === 'powerpoint';
      const gallery = document.getElementById(presentation ? 'pres-gallery' : 'doc-gallery');
      document.getElementById(presentation ? 'pres-gallery-empty' : 'doc-gallery-empty')?.remove();
      const card = document.createElement('a');
      card.className = 'file-output-card';
      card.href = file.resolved_url;
      card.target = '_blank';
      card.rel = 'noopener';
      card.innerHTML = `<span class="file-output-icon">${presentation ? 'PPT' : 'PDF'}</span><span class="file-output-text"><strong></strong><small></small></span><span class="file-download-button">Open file</span>`;
      card.querySelector('strong').textContent = file.title;
      card.querySelector('small').textContent = `${file.generation_type.toUpperCase()} · ${new Date(file.created_at).toLocaleString()}`;
      gallery.appendChild(card);
    });
  });
})();
