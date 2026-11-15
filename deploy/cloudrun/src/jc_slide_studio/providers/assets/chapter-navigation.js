/* Keep native in-deck links keyboard accessible without advancing a slide. */
(() => {
  'use strict';
  if (new URLSearchParams(location.search).has('preview')) {
    document.documentElement.dataset.jcPreview = 'true';
  }
  document.addEventListener('keydown', event => {
    const link = event.target.closest?.('a[href^="#/"]');
    if (!link || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter') event.stopPropagation();
    if (event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      link.click();
    }
  }, true);
  const start = () => {
    const refresh = () => {
      document.querySelectorAll('section.slide a[href^="#/"]').forEach(link => {
        link.tabIndex = link.closest('section.slide').classList.contains('is-active') ? 0 : -1;
      });
    };
    const observer = new MutationObserver(refresh);
    document.querySelectorAll('section.slide').forEach(slide => {
      observer.observe(slide, { attributes: true, attributeFilter: ['class'] });
    });
    refresh();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
