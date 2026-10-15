/* Open a Notion research record in the site's own Atlas dossier panel. */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const requested = params.get('company');
  if (!requested) return;
  const country = (params.get('country') || '').trim().toUpperCase();
  const panel = document.getElementById('p0-dossier');
  const body = document.getElementById('p0-dossier-body');
  const normalized = s => String(s || '').normalize('NFKC').trim().toLocaleLowerCase();

  function showError(message) {
    if (!panel || !body) return;
    const note = document.createElement('p');
    note.textContent = message;
    body.replaceChildren(note);
    panel.classList.remove('atlas-no-selection', 'atlas-minimized');
    if (window.innerWidth <= 900) document.body.classList.add('p0-panels-open');
    document.querySelectorAll('#atlas-window-restore button')[1]?.setAttribute('hidden', '');
  }

  async function openDossier() {
    if (!window.AtlasContext?.showCompany) {
      showError('Atlas dossier panel is unavailable.');
      return;
    }
    try {
      const response = await fetch('/atlas/notion-companies-index.json', {cache:'no-store'});
      if (!response.ok) throw Error('Directory unavailable');
      const data = await response.json();
      if (!Array.isArray(data.companies)) throw Error('Malformed directory');
      const matches = data.companies.filter(c =>
        normalized(c.name) === normalized(requested) &&
        (!country || String(c.country || '').toUpperCase() === country)
      );
      if (matches.length === 0) {
        showError('Company record not found in the research directory.');
      } else if (matches.length > 1) {
        showError('Multiple matching research records. Refine the selection in Directory.');
      } else {
        window.AtlasContext.showCompany(matches[0]);
      }
    } catch (error) {
      showError('Research company dossier is temporarily unavailable.');
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openDossier, {once:true});
  } else {
    openDossier();
  }
})();
