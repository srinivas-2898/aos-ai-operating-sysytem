(() => {
  const SUPABASE_URL = 'https://gdqapoopqijohrtovjza.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI';

  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const client = () => window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_KEY);
  const validUrl = value => /^https?:\/\//i.test(String(value || '')) ? String(value) : '';

  let pendingAvatarDataUrl = null;

  const notify = (msg) => {
    if (typeof window.toast === 'function') window.toast(msg);
    else if (typeof toast === 'function') toast(msg);
    else alert(msg);
  };

  function provider(provider) {
    const name = String(provider || 'Deployment');
    const normalized = name.toLowerCase();
    const map = {
      netlify: ['N', 'linear-gradient(135deg,#14b8a6,#0e7490)'],
      vercel: ['▲', 'linear-gradient(135deg,#111827,#334155)'],
      firebase: ['◆', 'linear-gradient(135deg,#f59e0b,#ea580c)'],
      render: ['R', 'linear-gradient(135deg,#7c3aed,#a855f7)'],
      railway: ['R', 'linear-gradient(135deg,#111827,#4f46e5)'],
      cloudflare: ['CF', 'linear-gradient(135deg,#f97316,#f59e0b)']
    };
    return { name, mark: map[normalized]?.[0] || '↗', color: map[normalized]?.[1] || 'linear-gradient(135deg,#2563eb,#7c3aed)' };
  }

  function getProjectStyle(name) {
    const normalized = String(name || '').toLowerCase();
    if (normalized.includes('resume') || normalized.includes('builder')) {
      return {
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
        bg: '#ede9fe', color: '#7c3aed'
      };
    } else if (normalized.includes('assistant') || normalized.includes('research') || normalized.includes('ai')) {
      return {
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        bg: '#dcfce7', color: '#16a34a'
      };
    } else if (normalized.includes('pdf') || normalized.includes('tool') || normalized.includes('doc')) {
      return {
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
        bg: '#ffedd5', color: '#ea580c'
      };
    } else if (normalized.includes('image') || normalized.includes('gen') || normalized.includes('suite') || normalized.includes('design')) {
      return {
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
        bg: '#fee2e2', color: '#dc2626'
      };
    } else {
      return {
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
        bg: '#dbeafe', color: '#2563eb'
      };
    }
  }

  function renderProjects(container, projects, fileCounts) {
    if (!container) return;
    if (!projects?.length) {
      container.innerHTML = '<div class="settings-empty"><b>No projects yet</b>Create a project to start building in AOS.</div>';
      return;
    }
    
    container.innerHTML = projects.slice(0, 5).map(project => {
      const count = fileCounts[project.id] || 0;
      const fileText = count === 1 ? '1 File' : `${count} Files`;
      const createdDate = project.created_at ? new Date(project.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown date';
      const style = getProjectStyle(project.name);

      return `
        <div class="project-list-row" onclick="openProject('${project.id}')" style="cursor: pointer;">
          <div class="project-row-left">
            <span class="project-row-icon" style="background: ${style.bg}; color: ${style.color};">
              ${style.icon}
            </span>
            <div class="project-row-info">
              <h4>${escapeHtml(project.name || 'Untitled project')}</h4>
              <p>Created on ${createdDate} · ${fileText}</p>
            </div>
          </div>
          <div class="project-row-right">
            <span class="status-pill-active">Active</span>
            <span class="row-dots-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </span>
          </div>
        </div>`;
    }).join('');
  }

  function renderDeployments(container, deployments) {
    if (!container) return;
    const target = document.getElementById('settings-deployments-list');
    if (!target) return;

    if (!deployments?.length) {
      target.innerHTML = '';
      return;
    }

    target.innerHTML = deployments.slice(0, 5).map(item => {
      const service = provider(item.provider);
      const status = String(item.status || 'pending').toLowerCase();
      const project = item.projects?.name || 'AOS project';
      const url = validUrl(item.deployment_url);
      
      let urlHtml = '—';
      if (url) {
        try {
          const parsed = new URL(url);
          const domain = parsed.hostname;
          urlHtml = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(domain)} <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left: 2px; vertical-align: middle;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
        } catch (_) {
          urlHtml = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Live URL ↗</a>`;
        }
      }

      let dateHtml = 'Time unavailable';
      if (item.created_at) {
        const d = new Date(item.created_at);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const months = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']; // general month names map
          const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const month = mNames[d.getMonth()];
          const year = d.getFullYear();
          const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          dateHtml = `<div>${day} ${month} ${year}</div><div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${timePart}</div>`;
        }
      }

      const statusClass = `status-badge-${status}`;
      return `
        <tr>
          <td class="deploy-project-cell">${escapeHtml(project)}</td>
          <td>
            <div class="deploy-platform-cell">
              <span class="deploy-platform-logo" style="background:${service.color}">${escapeHtml(service.mark)}</span>
              <span>${escapeHtml(service.name)}</span>
            </div>
          </td>
          <td class="deploy-url-cell">${urlHtml}</td>
          <td><span class="status-badge ${statusClass}">${escapeHtml(status)}</span></td>
          <td class="deploy-time-cell">${dateHtml}</td>
          <td>
            <span class="row-dots-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </span>
          </td>
        </tr>`;
    }).join('');
  }

  async function showSettings() {
    const view = document.getElementById('view-settings');
    if (!view) return;
    document.querySelectorAll('.view').forEach(item => item.classList.remove('active'));
    view.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById('nav-settings')?.classList.add('active');

    const supabase = client();
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const user = session.user;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'AOS user';
    const email = user.email || '';
    const bio = user.user_metadata?.bio || '';
    const avatarUrl = localStorage.getItem('aos_avatar_' + user.id) || user.user_metadata?.avatar_url;

    pendingAvatarDataUrl = null;

    // Set fields
    const fullNameInput = document.getElementById('settings-fullname-input');
    const emailInput = document.getElementById('settings-email-input');
    const bioInput = document.getElementById('settings-bio-input');
    const bioCharCount = document.getElementById('settings-bio-char-count');

    if (fullNameInput) fullNameInput.value = name;
    if (emailInput) emailInput.value = email;
    if (bioInput) {
      bioInput.value = bio;
      if (bioCharCount) bioCharCount.textContent = `${bio.length}/120`;
    }

    // Set preview
    const previewName = document.getElementById('profile-preview-name');
    const previewEmail = document.getElementById('profile-preview-email');
    const previewAvatar = document.getElementById('profile-avatar-preview');

    if (previewName) previewName.textContent = name;
    if (previewEmail) previewEmail.textContent = email;
    
    const initial = name.trim().charAt(0).toUpperCase() || 'U';
    if (previewAvatar) {
      if (avatarUrl) {
        previewAvatar.textContent = '';
        previewAvatar.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
      } else {
        previewAvatar.textContent = '';
        previewAvatar.innerHTML = `
          <svg viewBox="0 0 32 32" fill="none" style="width:100%; height:100%; border-radius:50%; object-fit:cover; display:block;">
            <defs>
              <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#3b82f6" />
                <stop offset="50%" stop-color="#4f46e5" />
                <stop offset="100%" stop-color="#7c3aed" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="16" fill="url(#avatarGrad)" />
            <circle cx="16" cy="11.5" r="4.8" fill="#ffffff" />
            <path d="M6.5 25.5C6.5 19.8 10.7 17.5 16 17.5C21.3 17.5 25.5 19.8 25.5 25.5" fill="#ffffff" />
          </svg>
        `;
      }
    }

    // Query databases
    const [projectsResult, filesResult, deploymentsResult] = await Promise.all([
      supabase.from('projects').select('id,name,description,created_at').order('created_at', { ascending: false }),
      supabase.from('project_files').select('project_id'),
      supabase.from('deployments').select('project_id,provider,status,deployment_url,metadata,created_at,projects(name)').order('created_at', { ascending: false }).limit(50)
    ]);

    const projects = (projectsResult.data || []).filter(p => !p.description?.startsWith('[DELETED]'));
    const files = filesResult.data || [];
    const deployments = deploymentsResult.data || [];

    const fileCounts = {};
    files.forEach(f => {
      fileCounts[f.project_id] = (fileCounts[f.project_id] || 0) + 1;
    });

    const projectsTarget = document.getElementById('settings-projects-list');
    const deploymentsTarget = document.getElementById('settings-deployments-list');

    if (projectsResult.error && projectsTarget) {
      projectsTarget.innerHTML = '<div class="settings-empty"><b>Projects unavailable</b>Please reload this page.</div>';
    } else {
      renderProjects(projectsTarget, projects, fileCounts);
    }

    if (deploymentsResult.error && deploymentsTarget) {
      deploymentsTarget.innerHTML = '';
    } else {
      renderDeployments(deploymentsTarget, deployments);
    }

    // Bind event listeners if not already bound
    if (!window.settingsEventHandlersBound) {
      window.settingsEventHandlersBound = true;

      const dropzone = document.getElementById('profile-photo-dropzone');
      const fileInput = document.getElementById('profile-photo-file-input');
      const cameraBtn = document.getElementById('btn-upload-camera');

      const handleFile = (file) => {
        if (!file.type.startsWith('image/')) {
          notify('Please select an image file.');
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          notify('Image size must be less than 5MB.');
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target.result;
          pendingAvatarDataUrl = dataUrl;
          
          if (previewAvatar) {
            previewAvatar.textContent = '';
            previewAvatar.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
          }
        };
        reader.readAsDataURL(file);
      };

      if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.style.borderColor = '#2563eb';
          dropzone.style.background = '#eff6ff';
        });
        dropzone.addEventListener('dragleave', () => {
          dropzone.style.borderColor = '#cbd5e1';
          dropzone.style.background = '#f8fafc';
        });
        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.style.borderColor = '#cbd5e1';
          dropzone.style.background = '#f8fafc';
          const files = e.dataTransfer.files;
          if (files.length) handleFile(files[0]);
        });
      }

      if (cameraBtn && fileInput) {
        cameraBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          fileInput.click();
        });
      }

      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          const files = e.target.files;
          if (files.length) handleFile(files[0]);
        });
      }

      if (bioInput) {
        bioInput.addEventListener('input', () => {
          const length = bioInput.value.length;
          if (bioCharCount) bioCharCount.textContent = `${length}/120`;
        });
      }

      const btnKeepDefault = document.getElementById('btn-keep-default-avatar');
      if (btnKeepDefault) {
        btnKeepDefault.addEventListener('click', () => {
          pendingAvatarDataUrl = 'clear';
          if (previewAvatar) {
            previewAvatar.textContent = '';
            previewAvatar.innerHTML = `
              <svg viewBox="0 0 32 32" fill="none" style="width:100%; height:100%; border-radius:50%; object-fit:cover; display:block;">
                <defs>
                  <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#3b82f6" />
                    <stop offset="50%" stop-color="#4f46e5" />
                    <stop offset="100%" stop-color="#7c3aed" />
                  </linearGradient>
                </defs>
                <rect width="32" height="32" rx="16" fill="url(#avatarGrad)" />
                <circle cx="16" cy="11.5" r="4.8" fill="#ffffff" />
                <path d="M6.5 25.5C6.5 19.8 10.7 17.5 16 17.5C21.3 17.5 25.5 19.8 25.5 25.5" fill="#ffffff" />
              </svg>
            `;
          }
        });
      }

      const btnSaveProfile = document.getElementById('btn-save-profile-settings');
      if (btnSaveProfile) {
        btnSaveProfile.addEventListener('click', async () => {
          const nameVal = fullNameInput?.value.trim();
          const bioVal = bioInput?.value.trim();
          if (!nameVal) {
            notify('Name cannot be empty.');
            return;
          }

          btnSaveProfile.textContent = 'Saving...';
          btnSaveProfile.disabled = true;

          try {
            let updatedAvatarUrl = user.user_metadata?.avatar_url || '';
            if (pendingAvatarDataUrl === 'clear') {
              updatedAvatarUrl = '';
              localStorage.removeItem('aos_avatar_' + user.id);
            } else if (pendingAvatarDataUrl) {
              updatedAvatarUrl = pendingAvatarDataUrl;
              localStorage.setItem('aos_avatar_' + user.id, pendingAvatarDataUrl);
            }

            const { data: { user: updatedUser }, error: authErr } = await supabase.auth.updateUser({
              data: {
                full_name: nameVal,
                bio: bioVal,
                avatar_url: updatedAvatarUrl
              }
            });

            if (authErr) throw authErr;

            const { error: dbErr } = await supabase.from('profiles').upsert({
              id: user.id,
              full_name: nameVal
            });

            if (dbErr) console.warn('Profiles DB update warning:', dbErr.message);

            notify('Profile updated successfully!');
            
            if (typeof window.populateUserUI === 'function') {
              window.populateUserUI(updatedUser);
            } else if (typeof populateUserUI === 'function') {
              populateUserUI(updatedUser);
            }

            if (previewName) previewName.textContent = nameVal;
            pendingAvatarDataUrl = null;

          } catch (err) {
            console.error('Error saving profile settings:', err);
            notify('Failed to save changes: ' + err.message);
          } finally {
            btnSaveProfile.textContent = 'Save Changes';
            btnSaveProfile.disabled = false;
          }
        });
      }
    }
  }

  function bind() {
    const navigation = document.getElementById('nav-settings');
    if (!navigation) return;
    navigation.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); showSettings(); }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  window.showAosSettings = showSettings;
  if (new URLSearchParams(window.location.search).get('view') === 'settings') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showSettings); else showSettings();
  }
})();
