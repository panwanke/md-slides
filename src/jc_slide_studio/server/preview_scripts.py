"""Scripts injected into rendered presentations.

Shared by the local file preview (``/preview/*``) and the deck-store preview
(``/api/decks/{id}/preview``) so both keep identical navigation behaviour.
"""

WS_RELOAD_SCRIPT = r"""
<script data-jc-studio-live>
(() => {
  const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  const embedded = location.pathname === '/preview/workbench';
  let ws = null;
  function connect() {
    ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'RELOAD') {
          location.reload();
        } else if (msg.type === 'GOTO_PAGE' && window.JCDeck) {
          JCDeck.goTo(msg.page, msg.step || 1);
        }
      } catch (e) {}
    };
    ws.onclose = () => { setTimeout(connect, 1000); };
  }
  if (!embedded) connect();
})();
</script>
"""

CLICK_MAP_SCRIPT = r"""
<script data-jc-studio-click-map>
(() => {
  // Bidirectional element click -> notify parent workbench
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (window.parent === window || !(target instanceof Element)) return;
    const slide = target.closest('section.slide');
    if (!slide) return;
    const slideId = slide.getAttribute('data-slide-id');
    const slideNumberEl = slide.querySelector('.slide-number');
    const slideIndex = parseInt(slideNumberEl?.getAttribute('data-current') || '1', 10);

    let nodeType = 'unknown';
    let text = '';
    const heading = target.closest('h1, h2, h3, h4');
    const notes = target.closest('.notes');
    const fig = target.closest('.jc-figbox, figure');

    if (heading) {
      nodeType = 'heading';
      text = heading.innerText.trim();
    } else if (notes) {
      nodeType = 'notes';
      text = notes.innerText.trim();
    } else if (fig) {
      nodeType = 'image';
      const img = fig.querySelector('img');
      text = img ? (img.getAttribute('src') || '') : '';
    } else if (target.closest('p, li, blockquote')) {
      nodeType = 'text';
      text = target.innerText.trim();
    }

    try {
      window.parent.postMessage({
        type: 'ELEMENT_CLICKED',
        slideId: slideId,
        slideIndex: slideIndex,
        nodeType: nodeType,
        text: text
      }, location.origin);
    } catch(err) {}
  });
})();
</script>
"""

EMBEDDED_STYLE = "<style>.progress-bar{display:none}</style>"

HOT_RELOAD_SCRIPT = WS_RELOAD_SCRIPT + CLICK_MAP_SCRIPT
