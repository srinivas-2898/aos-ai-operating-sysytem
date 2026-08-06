/* Real document and presentation downloads served by the Python backend. */
(() => {
  const showToast = window.showToast || ((msg) => console.log('Toast:', msg));

  // Inject slide preview styles dynamically
  (() => {
    const style = document.createElement('style');
    style.textContent = `
      .presentation-preview-container {
        grid-column: 1 / -1;
        border: 1px solid #dce6f2;
        border-radius: 12px;
        background: #fff;
        padding: 20px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.055);
        margin-bottom: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .pres-preview-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        color: #64748b;
        font-weight: 600;
        border-bottom: 1px solid #f1f5f9;
        padding-bottom: 8px;
      }
      .pres-preview-nav {
        display: flex;
        gap: 6px;
      }
      .pres-preview-nav button {
        padding: 6px 12px;
        border: 1px solid #cbd5e1;
        background: #f8fafc;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        color: #334155;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .pres-preview-nav button:hover:not(:disabled) {
        background: #eff6ff;
        color: #2563eb;
        border-color: #bfdbfe;
      }
      .pres-preview-nav button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .pres-preview-slide {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 24px;
        padding: 28px;
        border-radius: 10px;
        min-height: 280px;
        background: #0f172a;
        color: #fff;
        box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);
        align-items: center;
      }
      .pres-slide-left {
        display: flex;
        flex-direction: column;
        gap: 10px;
        text-align: left;
      }
      .pres-slide-left h3 {
        font-family: 'Plus Jakarta Sans', Inter, sans-serif;
        font-size: 24px;
        font-weight: 700;
        color: #fff;
        letter-spacing: -0.5px;
        margin-bottom: 2px;
      }
      .pres-slide-left p {
        color: #94a3b8;
        font-size: 14px;
        margin-bottom: 12px;
      }
      .pres-slide-left ul {
        list-style-type: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .pres-slide-left li {
        font-size: 14px;
        line-height: 1.5;
        color: #cbd5e1;
        position: relative;
        padding-left: 14px;
      }
      .pres-slide-left li::before {
        content: '•';
        color: #3b82f6;
        position: absolute;
        left: 0;
        font-weight: bold;
      }
      .pres-slide-right {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
      }
      .pres-slide-right img {
        width: 100%;
        max-height: 220px;
        border-radius: 8px;
        object-fit: cover;
        border: 1px solid #334155;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      }
      @media (max-width: 620px) {
        .pres-preview-slide {
          grid-template-columns: 1fr;
          gap: 16px;
          padding: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  })();

  const apiEndpoint = (path) => {
    const chatUrl = window.AOS_AI_API_URL || '/api/chat';
    const base = chatUrl.replace(/\/api\/chat(?:\?.*)?$/, '');
    return `${base}${path}`;
  };

  const fileNameFrom = (response, fallback) => {
    const match = response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i);
    return match?.[1] || fallback;
  };

  const createFileCard = (gallery, blob, filename, label, icon, slidesData = null) => {
    const url = URL.createObjectURL(blob);
    let preview = null;
    if (blob.type === 'application/pdf') {
      preview = document.createElement('iframe');
      preview.className = 'document-pdf-preview';
      preview.src = url;
      preview.title = `${label} preview`;
      gallery.prepend(preview);
    } else if (label === 'Presentation' && slidesData && slidesData.length > 0) {
      preview = document.createElement('div');
      preview.className = 'presentation-preview-container';
      
      let currentSlide = 0;
      const renderSlide = () => {
        const slide = slidesData[currentSlide];
        preview.innerHTML = '';
        
        const header = document.createElement('div');
        header.className = 'pres-preview-header';
        header.innerHTML = `<span>Slide ${currentSlide + 1} of ${slidesData.length}</span>`;
        
        const nav = document.createElement('div');
        nav.className = 'pres-preview-nav';
        
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '◀ Prev';
        prevBtn.disabled = currentSlide === 0;
        prevBtn.onclick = (e) => { e.preventDefault(); if (currentSlide > 0) { currentSlide--; renderSlide(); } };
        
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next ▶';
        nextBtn.disabled = currentSlide === slidesData.length - 1;
        nextBtn.onclick = (e) => { e.preventDefault(); if (currentSlide < slidesData.length - 1) { currentSlide++; renderSlide(); } };
        
        nav.append(prevBtn, nextBtn);
        header.appendChild(nav);
        
        const slideEl = document.createElement('div');
        slideEl.className = 'pres-preview-slide';
        
        const leftCol = document.createElement('div');
        leftCol.className = 'pres-slide-left';
        
        const title = document.createElement('h3');
        title.textContent = slide.title;
        
        leftCol.appendChild(title);
        
        if (slide.subtitle) {
          const sub = document.createElement('p');
          sub.textContent = slide.subtitle;
          leftCol.appendChild(sub);
        }
        
        if (slide.bullet_points && slide.bullet_points.length > 0) {
          const ul = document.createElement('ul');
          slide.bullet_points.forEach(bp => {
            const li = document.createElement('li');
            li.textContent = bp;
            ul.appendChild(li);
          });
          leftCol.appendChild(ul);
        }
        
        const rightCol = document.createElement('div');
        rightCol.className = 'pres-slide-right';
        
        if (slide.image_b64) {
          const img = document.createElement('img');
          img.src = `data:image/png;base64,${slide.image_b64}`;
          img.alt = slide.title || 'Slide illustration';
          rightCol.appendChild(img);
        } else {
          const placeholder = document.createElement('div');
          placeholder.style.cssText = 'width:100%;height:180px;background:linear-gradient(135deg,#3b82f6,#1e3a8a);border-radius:8px';
          rightCol.appendChild(placeholder);
        }
        
        slideEl.append(leftCol, rightCol);
        preview.append(header, slideEl);
      };
      
      renderSlide();
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
      
      let blob;
      let filename = fallbackName;
      let slidesData = null;
      
      if (path === '/api/generate-ppt') {
        const json = await response.json();
        filename = json.filename || fallbackName;
        slidesData = json.slides || null;
        
        // Decode base64 to binary
        const byteCharacters = atob(json.pptx);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      } else {
        blob = await response.blob();
        filename = fileNameFrom(response, fallbackName);
      }
      
      const { card, download, preview } = createFileCard(gallery, blob, filename, label, icon, slidesData);
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
    event.detail.filter((file) => file.generation_type !== 'image' && file.generation_type !== 'html' && file.resolved_url).forEach((file) => {
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
