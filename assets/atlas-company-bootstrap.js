/* Attach approved Notion companies to the existing Atlas map. */
(() => {
  'use strict';

  let attempts = 0;
  const maxAttempts = 120;

  async function connect() {
    const map = window.__map;
    const layer = window.AtlasCompanyLayer;

    if (!map || !layer) {
      if (++attempts < maxAttempts) {
        setTimeout(connect, 500);
      } else {
        console.warn('Atlas company layer: map unavailable');
      }
      return;
    }

    try {
      const data = await layer.load();
      const result = layer.attach(map);
      console.info(
        'Atlas company layer:',
        data.features.length,
        'approved companies',
        result
      );
    } catch (error) {
      console.warn('Atlas company layer unavailable:', error);
    }
  }

  connect();
})();
