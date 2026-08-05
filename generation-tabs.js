/* Reliable, accessible navigation for Generation Studio. */
(() => {
  const tabNames = ['images', 'ui-screens', 'videos', 'documents', 'presentations'];

  function activateGenerationTab(name) {
    if (!tabNames.includes(name)) return;
    tabNames.forEach((tab) => {
      const button = document.getElementById(`tab-btn-${tab}`);
      const panel = document.getElementById(`tab-${tab}`);
      const active = tab === name;
      if (button) {
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
      }
      if (panel) {
        panel.classList.toggle('active', active);
        panel.setAttribute('aria-hidden', String(!active));
      }
    });
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${name}`);
  }

  window.switchTab = activateGenerationTab;

  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `#tabs-bar{gap:4px;padding-left:20px}.tab-btn{border-radius:10px 10px 0 0;transition:background .2s,color .2s,border-color .2s,transform .2s}.tab-btn:hover{background:#eff6ff;color:#2563eb}.tab-btn.active{background:#f8fbff}.tab-content.active{animation:generationPanelIn .24s ease both}@keyframes generationPanelIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`;
    document.head.appendChild(style);
    tabNames.forEach((name) => {
      const button = document.getElementById(`tab-btn-${name}`);
      if (!button) return;
      button.addEventListener('click', (event) => { event.preventDefault(); activateGenerationTab(name); });
      button.setAttribute('role', 'tab');
    });
    const initial = window.location.hash.slice(1);
    activateGenerationTab(tabNames.includes(initial) ? initial : 'images');
  });
})();
