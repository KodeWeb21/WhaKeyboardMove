(function () {
  'use strict';

  if (!window.WKM_NAV) {
    console.error('[WKM] navigation layer missing');
    return;
  }

  window.WKM_NAV.init();
  window.__WKM_INSPECT = function () {
    return window.WKM_NAV.inspect();
  };

  console.log('[WKM] WhatsApp Keyboard Navigator loaded');
})();
