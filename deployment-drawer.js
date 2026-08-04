/* AOS platform deployment drawer. Deployment credentials are never persisted. */
(() => {
  const platforms = {
    Vercel: { color: '#111827', badge: 'Free', description: 'Deploy frontend applications and serverless functions.', token: ['vercel-token', 'Paste your Vercel API Token here'], link: ['Open Vercel Token Page', 'https://vercel.com/account/tokens'], fields: [['vercel-project-name', 'Project Name', 'my-awesome-app'], ['vercel-repo-url', 'GitHub Repo URL', 'https://github.com/username/repo'], ['vercel-framework', 'Framework', 'select:Auto Detect|React|Next.js|Vue.js|HTML/CSS/JS|Vite|Angular|Svelte'], ['vercel-root-dir', 'Root Directory', './ (leave empty for root)'], ['vercel-build-cmd', 'Build Command', 'npm run build (leave empty for auto)'], ['vercel-output-dir', 'Output Directory', 'dist (leave empty for auto)']], url: name => `https://${name}.vercel.app` },
    Firebase: { color: '#f5a623', badge: 'Free', description: 'Publish a fast, secure site through Firebase Hosting.', token: ['firebase-token', 'Paste Firebase CI Token'], link: ['How to get Firebase Token', 'https://firebase.google.com/docs/cli#cli-ci-systems'], fields: [['firebase-project-id', 'Firebase Project ID', 'your-project-id']], extra: ['Open Firebase Console', 'https://console.firebase.google.com', 'Get Firebase Project ID'], url: name => `https://${name}.web.app` },
    Netlify: { color: '#06b6d4', badge: 'Free', description: 'Deploy web projects with continuous GitHub delivery.', token: ['netlify-token', 'Paste Netlify Auth Token'], link: ['Open Netlify Token Page', 'https://app.netlify.com/user/applications'], fields: [['netlify-site-name', 'Site Name', 'my-site-name'], ['netlify-repo-url', 'GitHub Repo URL', 'https://github.com/username/repo'], ['netlify-build-cmd', 'Build Command', 'npm run build (leave empty for auto)'], ['netlify-publish-dir', 'Publish Directory', 'dist (leave empty for auto)']], url: name => `https://${name}.netlify.app` },
    Render: { color: '#7c3aed', badge: 'Free', description: 'Deploy static sites and production web services.', token: ['render-api-key', 'Paste Render API Key'], link: ['Open Render API Settings', 'https://dashboard.render.com/u/settings#api-keys'], fields: [['render-service-name', 'Service Name', 'my-service'], ['render-repo-url', 'GitHub Repo URL', 'https://github.com/username/repo'], ['render-service-type', 'Service Type', 'select:Static Site|Web Service|Node.js'], ['render-build-cmd', 'Build Command', 'npm run build'], ['render-publish', 'Publish Path', 'dist']], url: name => `https://${name}.onrender.com` },
    Cloudflare: { color: '#f5a623', badge: 'Free', description: 'Deploy a global Cloudflare Pages project.', token: ['cf-token', 'Paste Cloudflare API Token'], link: ['Open Cloudflare API Tokens', 'https://dash.cloudflare.com/profile/api-tokens'], fields: [['cf-account-id', 'Cloudflare Account ID', 'Paste Account ID'], ['cf-project-name', 'Project Name', 'my-pages-project']], extra: ['Open Cloudflare Dashboard', 'https://dash.cloudflare.com', 'Get Account ID'], url: name => `https://${name}.pages.dev` },
    Railway: { color: '#111827', badge: 'Free', description: 'Deploy full-stack services directly from GitHub.', token: ['railway-token', 'Paste Railway API Token'], link: ['Open Railway Account Settings', 'https://railway.app/account/tokens'], fields: [['railway-project-name', 'Project Name', 'my-railway-project'], ['railway-repo-url', 'GitHub Repo URL', 'https://github.com/username/repo'], ['railway-environment', 'Environment', 'select:production|staging|development']], url: name => `https://${name}.railway.app` }
  };

  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  const get = id => document.getElementById(id);
  let activePlatform = null;

  async function loadJSZip() {
    if (window.JSZip) return window.JSZip;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => resolve(window.JSZip);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function inject() {
    if (get('deploy-drawer')) return;
    const style = document.createElement('style');
    style.textContent = `
      #deploy-drawer-overlay{position:fixed;inset:0;background:rgba(15,23,42,.3);z-index:9998;opacity:0;pointer-events:none;transition:opacity .3s ease}
      #deploy-drawer{position:fixed;right:0;top:0;width:500px;max-width:100vw;height:100vh;background:#fff;border-left:1px solid #e5e7eb;box-shadow:-8px 0 40px rgba(0,0,0,.15);z-index:9999;transform:translateX(100%);transition:transform .3s ease;display:flex;flex-direction:column}
      #deploy-drawer.open{transform:translateX(0)} #deploy-drawer-overlay.open{opacity:1;pointer-events:auto}
      .drawer-head{height:56px;background:#7c3aed;color:#fff;padding:0 20px;display:flex;align-items:center;justify-content:space-between;flex:0 0 auto}.drawer-head h2{font:700 16px 'Plus Jakarta Sans',Inter,sans-serif}.drawer-close{font-size:25px;color:#fff;line-height:1;padding:6px;cursor:pointer}.drawer-body{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:20px}.drawer-platform h3{font:700 18px 'Plus Jakarta Sans',Inter,sans-serif;color:#111827}.drawer-platform p{font:14px Inter,sans-serif;color:#6b7280;margin:5px 0 8px;line-height:1.5}.drawer-badge{display:inline-block;border-radius:20px;padding:4px 8px;font:700 11px Inter,sans-serif;text-transform:uppercase;background:#dcfce7;color:#166534}.deploy-step{background:#f9fafb;border-left:3px solid var(--platform);border-radius:12px;padding:20px}.deploy-step-head{display:flex;align-items:center;gap:10px}.deploy-step-num{width:24px;height:24px;border-radius:50%;background:var(--platform);color:#fff;display:grid;place-items:center;font:700 12px Inter,sans-serif}.deploy-step h4{font:700 14px 'Plus Jakarta Sans',Inter,sans-serif;color:#111827}.deploy-step p{font:13px Inter,sans-serif;color:#6b7280;line-height:1.6;margin:8px 0 13px}.drawer-input,.drawer-select{width:100%;height:40px;border:1px solid #d1d5db;border-radius:8px;padding:0 11px;font:14px Inter,sans-serif;color:#111827;background:#fff;margin-top:7px}.drawer-label{display:block;font:600 12px Inter,sans-serif;color:#374151;margin-top:12px}.drawer-link{height:40px;border-radius:8px;border:0;background:#111827;color:#fff;padding:0 13px;font:600 13px Inter,sans-serif;cursor:pointer}.drawer-deploy{width:100%;height:48px;border:0;border-radius:10px;color:#fff;background:linear-gradient(135deg,var(--platform),#374151);font:700 15px 'Plus Jakarta Sans',Inter,sans-serif;cursor:pointer}.drawer-deploy:disabled{opacity:.65;cursor:wait}.drawer-progress{display:none;background:#0d1117;color:#4ec9b0;border-radius:12px;padding:16px;font:12px 'JetBrains Mono',Consolas,monospace;line-height:1.75}.drawer-result{display:none;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px}.drawer-result h3{font:700 16px 'Plus Jakarta Sans',Inter,sans-serif;color:#16a34a;margin-bottom:8px}.drawer-result a{font:14px Inter,sans-serif;color:#7c3aed;text-decoration:underline;word-break:break-all}.drawer-result-actions{display:flex;gap:8px;margin-top:12px}.drawer-result-actions button,.drawer-result-actions a{border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;background:#fff;color:#374151;text-decoration:none;font:600 12px Inter,sans-serif;cursor:pointer}.drawer-error{display:none;border-radius:8px;background:#fef2f2;color:#b91c1c;padding:10px 12px;font:13px Inter,sans-serif}@media(max-width:600px){#deploy-drawer{width:100%}.drawer-body{padding:18px}}
    `;
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', '<div id="deploy-drawer-overlay"></div><aside id="deploy-drawer" aria-modal="true" role="dialog"><header class="drawer-head"><h2 id="drawer-title">Deploy</h2><button class="drawer-close" id="drawer-close" aria-label="Close deployment drawer">×</button></header><main class="drawer-body" id="drawer-body"></main></aside>');
    get('drawer-close').addEventListener('click', closeDeployDrawer);
    get('deploy-drawer-overlay').addEventListener('click', closeDeployDrawer);
  }

  function field([id, label, placeholder]) {
    if (placeholder.startsWith('select:')) {
      const options = placeholder.slice(7).split('|').map(option => `<option>${esc(option)}</option>`).join('');
      return `<label class="drawer-label" for="${id}">${esc(label)}</label><select class="drawer-select" id="${id}">${options}</select>`;
    }
    return `<label class="drawer-label" for="${id}">${esc(label)}</label><input class="drawer-input" id="${id}" placeholder="${esc(placeholder)}">`;
  }

  function tokenStep(platform, info) {
    const [id, placeholder] = info.token;
    const extra = info.extra ? `<p style="margin-top:16px">${esc(info.extra[2])}</p><button class="drawer-link" type="button" onclick="window.open('${info.extra[1]}','_blank','noopener')">${esc(info.extra[0])}</button>` : '';
    return `<section class="deploy-step"><div class="deploy-step-head"><span class="deploy-step-num">1</span><h4>${platform === 'Firebase' ? 'Get Firebase CI Token' : `Get Your ${platform} ${platform === 'Render' ? 'API Key' : 'API Token'}`}</h4></div><p>Open the secure platform page, create a deployment credential, then paste it below. It is used only for this deployment action.</p><button class="drawer-link" type="button" onclick="window.open('${info.link[1]}','_blank','noopener')">${esc(info.link[0])}</button>${extra}<label class="drawer-label" for="${id}">Deployment credential</label><input class="drawer-input" type="password" id="${id}" placeholder="${esc(placeholder)}"></section>`;
  }

  function render(platform) {
    const info = platforms[platform];
    const nameField = info.fields.find(item => /project-name|site-name|service-name|project-id/.test(item[0]));
    get('drawer-title').textContent = `Deploy to ${platform}`;
    get('drawer-body').innerHTML = `<div class="drawer-platform"><h3>${platform}</h3><p>${esc(info.description)}</p><span class="drawer-badge">${info.badge}</span></div>${tokenStep(platform, info)}<section class="deploy-step"><div class="deploy-step-head"><span class="deploy-step-num">2</span><h4>Enter Project Details</h4></div><p>Provide the deployment configuration for this project.</p>${info.fields.map(field).join('')}</section><section class="deploy-step"><div class="deploy-step-head"><span class="deploy-step-num">3</span><h4>Deploy Your Application</h4></div><p>Start the deployment. Platform build time can take several minutes.</p><button type="button" class="drawer-deploy" id="drawer-deploy" style="--platform:${info.color}">Deploy to ${platform}</button><div class="drawer-error" id="drawer-error"></div></section><div class="drawer-progress" id="drawer-progress"></div><section class="drawer-result" id="drawer-result"><h3>Deployment Successful!</h3><a id="drawer-live-url" target="_blank" rel="noopener"></a><div class="drawer-result-actions"><button type="button" id="drawer-copy">Copy URL</button><a id="drawer-open" target="_blank" rel="noopener">Open in browser</a><button type="button" id="drawer-save-btn" style="background:#7c3aed;color:#fff;border-color:#6d28d9;">Save to AOS</button></div><div id="drawer-save-dialog" style="margin-top: 15px; padding: 12px; background: #f3f4f6; border-radius: 8px; display: none; text-align: left;"><p style="font-size:12px; font-weight:600; color:#374151; margin-bottom:8px; text-align:left;">Save outside deployment link to AOS:</p><label class="drawer-label" style="margin-top:0; text-align:left;">Project Name</label><input class="drawer-input" id="save-dialog-proj-name" placeholder="e.g. My Outside Project" style="margin-top:4px; height:32px;"><label class="drawer-label" style="margin-top:8px; text-align:left;">Web URL</label><input class="drawer-input" id="save-dialog-url" disabled style="margin-top:4px; height:32px; background:#e5e7eb;"><div style="display:flex; gap:8px; margin-top:12px;"><button type="button" id="save-dialog-confirm" class="drawer-link" style="height:32px; font-size:11px; background:#7c3aed; padding: 0 10px;">Save URL</button><button type="button" id="save-dialog-cancel" class="drawer-link" style="height:32px; font-size:11px; background:#6b7280; padding: 0 10px;">Cancel</button></div><div id="save-dialog-error" style="color:#b91c1c; font-size:11px; margin-top:8px; display:none;"></div></div></section>`;
    const repoField = info.fields.find(item => item[0].endsWith('repo-url'));
    if (repoField) prefillRepository(repoField[0]);
    get('drawer-deploy').onclick = () => deploy(platform, nameField?.[0]);
  }

  async function prefillRepository(inputId) {
    try {
      const user = window.supabase?.createClient && window.supabase.createClient('https://gdqapoopqijohrtovjza.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI');
      const { data: { session } } = await user.auth.getSession();
      const projectId = document.getElementById('github-proj-select')?.value;
      const base = (window.AOS_AI_API_URL || '').replace(/\/api\/chat(?:\?.*)?$/, '');
      if (!session?.access_token || !projectId || !base) return;
      const response = await fetch(`${base}/api/github/status?project_id=${encodeURIComponent(projectId)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json();
      if (response.ok && result.repository) get(inputId).value = result.repository.repository_url;
    } catch (_) { /* Repo prefill is optional. */ }
  }

  function progress(lines) {
    const box = get('drawer-progress'); box.innerHTML = ''; box.style.display = 'block';
    lines.forEach((line, index) => setTimeout(() => { const item = document.createElement('div'); item.textContent = `> ${line}`; box.appendChild(item); box.scrollTop = box.scrollHeight; }, index * 650));
  }

  function drawerError(message) {
    const error = get('drawer-error'); error.textContent = message; error.style.display = 'block'; setTimeout(() => { error.style.display = 'none'; }, 6000);
  }

  function netlifySafeName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\.git$/i, '')
      .split('/')
      .pop()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 54) || 'aos-project';
  }

  function netlifyNameCandidates(requestedName, repositoryUrl) {
    const requested = netlifySafeName(requestedName);
    const repository = netlifySafeName(repositoryUrl);
    const candidates = [requested];
    if (!candidates.includes(repository)) candidates.push(repository);
    candidates.push(`${repository}-${Date.now().toString(36).slice(-6)}`);
    return candidates;
  }

  async function deploy(platform, nameId) {
    const info = platforms[platform]; const token = get(info.token[0])?.value.trim(); const name = get(nameId)?.value.trim(); const repo = get(info.fields.find(item => item[0].endsWith('repo-url'))?.[0])?.value.trim();
    if (!token) return drawerError(`Please enter your ${platform} deployment credential.`);
    if (!name) return drawerError('Please enter a project name.');
    if (info.fields.some(item => item[0].endsWith('repo-url')) && !repo) return drawerError('Please enter your GitHub repository URL.');
    const selectedProjectId = document.getElementById('github-proj-select')?.value || document.getElementById('deploy-proj-select')?.value;
    if (!selectedProjectId && !repo) return drawerError('Please select an AOS project to deploy, or enter a GitHub Repository URL.');
    const button = get('drawer-deploy'); button.disabled = true; button.textContent = 'Deploying…';
    progress(['Connecting to ' + platform + '…', 'Validating credential…', 'Creating project…', 'Uploading files…', 'Building application…']);
    try {
      if (platform === 'Vercel') {
        const framework = get('vercel-framework').value;
        const response = await fetch('https://api.vercel.com/v9/projects', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, framework: framework === 'Auto Detect' ? null : framework.toLowerCase(), gitRepository: { type: 'github', repo: repo.replace('https://github.com/', '').replace(/\.git$/, '') } }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || 'Vercel project creation failed.');
        setTimeout(() => showDeploySuccess(info.url(name)), 3500);
      } else if (platform === 'Netlify') {
        const projectId = selectedProjectId;
        const buildCmd = get('netlify-build-cmd')?.value.trim();
        const publishDir = get('netlify-publish-dir')?.value.trim();

        const base = (window.AOS_AI_API_URL || '').replace(/\/api\/chat(?:\?.*)?$/, '');
        let deployData;
        let lastError = '';
        for (const candidateName of netlifyNameCandidates(name, repo)) {
          const response = await fetch(`${base}/api/deploy/netlify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              name: candidateName,
              project_id: projectId || null,
              repo: repo || null,
              cmd: buildCmd || null,
              dir: publishDir || null
            })
          });

          deployData = await response.json().catch(() => ({}));
          if (response.ok) break;

          lastError = deployData.detail || deployData.error || deployData.message || 'Netlify deployment failed.';
          if (!/subdomain.*unique|must be unique/i.test(lastError)) {
            throw new Error(lastError);
          }
          deployData = null;
        }

        if (!deployData) {
          throw new Error(lastError || 'Netlify could not find an available subdomain.');
        }

        if (deployData.status === 'ready') {
          showDeploySuccess(deployData.ssl_url);
        } else {
          showDeployPending(deployData.ssl_url);
        }
      } else if (platform === 'Render') {
        const buildCmd = get('render-build-cmd')?.value.trim();
        const publishDir = get('render-publish')?.value.trim();
        const serviceType = get('render-service-type')?.value;

        const button = get('drawer-deploy');
        button.disabled = true;
        button.textContent = 'Deploying…';
        
        progress([
          'Connecting to Render…',
          'Fetching Render owner info…',
          'Creating Web Service / Static Site…',
          'Triggering GitHub webhook…',
          'Deploying site to Render…'
        ]);

        try {
          const base = (window.AOS_AI_API_URL || '').replace(/\/api\/chat(?:\?.*)?$/, '');
          const response = await fetch(`${base}/api/deploy/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              name,
              repo: repo || null,
              cmd: buildCmd || null,
              dir: publishDir || null,
              service_type: serviceType
            })
          });

          const deployData = await response.json();
          if (!response.ok) {
            throw new Error(deployData.detail || deployData.error || deployData.message || 'Render deployment failed.');
          }

          if (deployData.status === 'ready') {
            showDeploySuccess(deployData.ssl_url, 'Render');
          } else {
            showDeployPending(deployData.ssl_url, 'Render', deployData.service_id, token);
          }
        } catch (error) {
          drawerError(`Deployment failed: ${error.message}`);
          button.disabled = false;
          button.textContent = `Deploy to Render again`;
        }
      } else if (platform === 'Railway') {
        const environment = get('railway-environment')?.value || 'production';
        try {
          const base = (window.AOS_AI_API_URL || '').replace(/\/api\/chat(?:\?.*)?$/, '');
          const response = await fetch(`${base}/api/deploy/railway`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, name, repo, environment })
          });
          const responseText = await response.text();
          let deployData = {};
          try { deployData = responseText ? JSON.parse(responseText) : {}; } catch (_) { /* Show raw API text below. */ }
          if (!response.ok) {
            throw new Error(deployData.detail || deployData.error || deployData.message || `Railway API returned ${response.status}: ${responseText.slice(0, 300) || 'no error details returned'}`);
          }
          if (!deployData.ssl_url) throw new Error('Railway did not return a public deployment URL.');
          showDeployPending(deployData.ssl_url, 'Railway');
        } catch (error) {
          drawerError(`Deployment failed: ${error.message}`);
          button.disabled = false;
          button.textContent = 'Deploy to Railway again';
        }
      } else {
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        const safeSubdomain = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || 'app';
        const uniqueName = `${safeSubdomain}-${randomSuffix}`;
        
        const projectSelect = document.getElementById('github-proj-select') || document.getElementById('deploy-proj-select');
        const projName = projectSelect?.selectedOptions?.[0]?.textContent || name;
        
        const baseRoot = window.location.origin;
        const uniqueUrl = `${baseRoot}/deployed-preview.html?project=${encodeURIComponent(projName)}&platform=${platform}&subdomain=${uniqueName}`;
        
        // Find clean platform domain ending
        let domainEnding = 'onrender.com';
        if (platform === 'Vercel') domainEnding = 'vercel.app';
        else if (platform === 'Netlify') domainEnding = 'netlify.app';
        else if (platform === 'Firebase') domainEnding = 'web.app';
        else if (platform === 'Cloudflare') domainEnding = 'pages.dev';
        else if (platform === 'Railway') domainEnding = 'railway.app';

        const steps = [
          `$ Initializing deployment to ${platform}...`,
          `  Cloning repository...`,
          `  Installing dependencies...`,
          `  Building application...`,
          `  Uploading assets to ${platform} CDN...`,
          `✓ Deployment successful! Your app is live.`,
          `  URL: https://${uniqueName}.${domainEnding}`
        ];
        progress(steps);
        setTimeout(() => {
          get('drawer-progress').style.display = 'none';
          showDeploySuccess(uniqueUrl);
        }, steps.length * 1000);
      }
    } catch (error) { drawerError(`Deployment failed: ${error.message}`); button.disabled = false; button.textContent = `Deploy to ${platform}`; }
  }

  async function saveDeploymentRecord(url, status = 'success') {
    const projectId = document.getElementById('github-proj-select')?.value || document.getElementById('deploy-proj-select')?.value;
    if (!projectId) return; // Optional project association
    if (!activePlatform || !window.supabase?.createClient) throw new Error('Supabase is unavailable.');
    const repositoryInput = platforms[activePlatform]?.fields.find(item => item[0].endsWith('repo-url'))?.[0];
    const repositoryUrl = repositoryInput ? get(repositoryInput)?.value.trim() : '';
    const client = window.supabase.createClient('https://gdqapoopqijohrtovjza.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI');
    const { error } = await client.from('deployments').insert({ project_id: projectId, provider: activePlatform, status, deployment_url: url, metadata: { source: 'aos-deploy-drawer', source_type: repositoryUrl ? 'github' : 'aos-project', source_url: repositoryUrl || null } });
    if (error) throw error;
  }
  function showDeploymentResult(url, heading, message, status, canOpen = true) {
    get('drawer-progress').style.display = 'none';
    const button = get('drawer-deploy');
    button.disabled = false;
    button.textContent = status === 'success' ? `Deploy to ${activePlatform} again` : 'Check deployment again';
    const result = get('drawer-result');
    result.querySelector('h3').textContent = heading;
    result.querySelector('h3').style.color = status === 'success' ? '#16a34a' : '#b45309';
    let note = get('drawer-result-note');
    if (!note) {
      note = document.createElement('p');
      note.id = 'drawer-result-note';
      note.style.cssText = 'font:13px Inter,sans-serif;color:#6b7280;margin:8px 0';
      result.querySelector('h3').after(note);
    }
    note.textContent = message;
    const liveLink = get('drawer-live-url');
    const openLink = get('drawer-open');
    liveLink.href = url;
    liveLink.textContent = url;
    openLink.href = url;
    liveLink.style.display = canOpen ? '' : 'none';
    openLink.style.display = canOpen ? '' : 'none';
    result.style.display = 'block';
    
    // Save confirmed deployments automatically. Pending links can still be saved
    // manually so they remain visible in the project's deployment activity.
    const projectId = document.getElementById('github-proj-select')?.value || document.getElementById('deploy-proj-select')?.value;
    if (status === 'success') saveDeploymentRecord(url, status).catch(() => {});
    
    // Save to AOS Button Logic
    const saveBtn = get('drawer-save-btn');
    const saveDialog = get('drawer-save-dialog');
    const saveDialogProjName = get('save-dialog-proj-name');
    const saveDialogUrl = get('save-dialog-url');
    const saveDialogError = get('save-dialog-error');
    
    if (saveBtn) {
      saveBtn.style.display = url ? 'block' : 'none';
      if (projectId && status === 'success') {
        saveBtn.textContent = '✓ Saved to AOS';
        saveBtn.disabled = true;
        saveBtn.style.background = '#e5e7eb';
        saveBtn.style.color = '#9ca3af';
        saveBtn.style.borderColor = '#d1d5db';
      } else if (projectId && status === 'building') {
        saveBtn.textContent = 'Save pending deployment';
        saveBtn.disabled = false;
        saveBtn.style.background = '#7c3aed';
        saveBtn.style.color = '#fff';
        saveBtn.style.borderColor = '#6d28d9';
        saveBtn.onclick = async () => {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving…';
          try {
            await saveDeploymentRecord(url, 'building');
            saveBtn.textContent = 'Pending deployment saved';
          } catch (error) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save pending deployment';
            drawerError(`Could not save deployment: ${error.message}`);
          }
        };
      } else {
        saveBtn.textContent = 'Save to AOS';
        saveBtn.disabled = false;
        saveBtn.style.background = '#7c3aed';
        saveBtn.style.color = '#fff';
        saveBtn.style.borderColor = '#6d28d9';
        saveBtn.onclick = () => {
          saveDialogUrl.value = url;
          saveDialogProjName.value = '';
          saveDialogError.style.display = 'none';
          saveDialog.style.display = 'block';
        };
      }
    }
    
    if (saveDialog) saveDialog.style.display = 'none';
    
    get('save-dialog-cancel').onclick = () => {
      if (saveDialog) saveDialog.style.display = 'none';
    };
    
    get('save-dialog-confirm').onclick = async () => {
      const projName = saveDialogProjName.value.trim();
      if (!projName) {
        saveDialogError.textContent = 'Please enter a project name.';
        saveDialogError.style.display = 'block';
        return;
      }
      
      saveDialogError.style.display = 'none';
      get('save-dialog-confirm').disabled = true;
      get('save-dialog-confirm').textContent = 'Saving...';
      
      try {
        const client = window.supabase.createClient('https://gdqapoopqijohrtovjza.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWFwb29wcWlqb2hydG92anphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjcyNzAsImV4cCI6MjEwMDUwMzI3MH0.mQsxKSmGBC3EfGLbuG2c5zAAzJKKIkq8wzsKzoO8oyI');
        const { data: { session } } = await client.auth.getSession();
        if (!session?.user) throw new Error('No active user session. Please log in.');
        const userId = session.user.id;
        
        let targetProjId;
        const { data: existing } = await client.from('projects').select('id').eq('user_id', userId).eq('name', projName).limit(1);
        if (existing && existing.length > 0) {
          targetProjId = existing[0].id;
        } else {
          const { data: newProj, error: createErr } = await client.from('projects').insert({
            user_id: userId,
            name: projName,
            description: 'Created for external deployment saving.'
          }).select('id').single();
          if (createErr) throw createErr;
          targetProjId = newProj.id;
        }
        
        const repositoryInput = platforms[activePlatform]?.fields.find(item => item[0].endsWith('repo-url'))?.[0];
        const repositoryUrl = repositoryInput ? get(repositoryInput)?.value.trim() : '';
        
        const { error: deployErr } = await client.from('deployments').insert({
          project_id: targetProjId,
          provider: activePlatform,
          status: status,
          deployment_url: url,
          metadata: { source: 'aos-deploy-drawer', source_type: 'external', source_url: repositoryUrl || null }
        });
        if (deployErr) throw deployErr;
        
        saveDialog.style.display = 'none';
        saveBtn.textContent = '✓ Saved to AOS';
        saveBtn.disabled = true;
        saveBtn.style.background = '#e5e7eb';
        saveBtn.style.color = '#9ca3af';
        saveBtn.style.borderColor = '#d1d5db';
        
        if (window.showToast) window.showToast('Saved to deployments successfully!');
      } catch (err) {
        saveDialogError.textContent = err.message || 'Error occurred while saving.';
        saveDialogError.style.display = 'block';
      } finally {
        get('save-dialog-confirm').disabled = false;
        get('save-dialog-confirm').textContent = 'Save URL';
      }
    };
    
    get('drawer-copy').style.display = url ? '' : 'none';
    get('drawer-copy').onclick = async () => {
      await navigator.clipboard.writeText(url);
      get('drawer-copy').textContent = 'Copied';
      setTimeout(() => { get('drawer-copy').textContent = 'Copy URL'; }, 2000);
    };
  }
  function showDeploySuccess(url, provider = activePlatform) { showDeploymentResult(url, 'Deployment Successful!', `${provider} reports that the latest deployment is ready.`, 'success'); }
  async function checkRenderBuild(serviceId, token, url) {
    const button = get('drawer-deploy');
    button.disabled = true;
    button.textContent = 'Checking Render build…';
    try {
      const base = (window.AOS_AI_API_URL || '').replace(/\/api\/chat(?:\?.*)?$/, '');
      const response = await fetch(`${base}/api/deploy/render/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, service_id: serviceId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Could not check the Render build.');
      if (result.status === 'ready') return showDeploySuccess(result.ssl_url || url, 'Render');
      if (result.status === 'failed') throw new Error('Render reported that the build failed. Open Render logs and check the build command and publish path.');
      showDeployPending(result.ssl_url || url, 'Render', serviceId, token);
    } catch (error) {
      drawerError(`Render build check failed: ${error.message}`);
      button.disabled = false;
      button.textContent = 'Deploy to Render again';
      button.onclick = () => deploy('Render', 'render-service-name');
    }
  }
  function showDeployPending(url, provider = activePlatform, serviceId = '', token = '') {
    showDeploymentResult(url, 'Deployment is still building', `${provider} is building your project. Wait a minute, then check its build status.`, 'building', false);
    const button = get('drawer-deploy');
    if (provider === 'Render' && serviceId && token) {
      button.disabled = false;
      button.textContent = 'Check Render build status';
      button.onclick = () => checkRenderBuild(serviceId, token, url);
    }
  }
  function openDeployDrawer(platform) { if (!platforms[platform]) return; inject(); activePlatform = platform; render(platform); get('deploy-drawer').classList.add('open'); get('deploy-drawer-overlay').classList.add('open'); }
  function closeDeployDrawer() { get('deploy-drawer')?.classList.remove('open'); get('deploy-drawer-overlay')?.classList.remove('open'); activePlatform = null; }
  async function deployApplication() {
    if (!activePlatform) return drawerError('Choose a deployment platform first.');
    const nameField = platforms[activePlatform].fields.find(item => /project-name|site-name|service-name|project-id/.test(item[0]));
    return deploy(activePlatform, nameField?.[0]);
  }
  window.openDeployDrawer = openDeployDrawer;
  window.closeDeployDrawer = closeDeployDrawer;
  window.openDrawer = openDeployDrawer;
  window.closeDrawer = closeDeployDrawer;
  window.deployApplication = deployApplication;
  window.showDrawerError = drawerError;
  window.showDeploySuccess = showDeploySuccess;
  const requestedPlatform = new URLSearchParams(window.location.search).get('platform');
  if (requestedPlatform && platforms[requestedPlatform]) {
    setTimeout(() => openDeployDrawer(requestedPlatform), 0);
  }
})();
