/* Research-only dossier deep link. Does not add map markers or geocode locations. */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const requested = params.get('company');
  if (!requested || !window.AtlasContext?.showCompany) return;
  const country = (params.get('country') || '').trim().toUpperCase();
  const panel = document.getElementById('p0-dossier-body');
  if (!panel) return;
  const normalized = s => String(s || '').normalize('NFKC').trim().toLocaleLowerCase();
  fetch('/atlas/notion-companies-index.json', {cache:'no-store'})
    .then(r => { if(!r.ok) throw new Error('Directory unavailable'); return r.json(); })
    .then(data => {
      if(!Array.isArray(data.companies)) throw new Error('Malformed directory');
      const matches = data.companies.filter(c =>
        normalized(c.name) === normalized(requested) &&
        (!country || String(c.country || '').toUpperCase() === country)
      );
      if(matches.length !== 1) {
        const message=document.createElement('p');
        message.textContent=matches.length ? 'Multiple matching research records. Select a company from Directory.' : 'Company record not found in the research directory.';
        panel.replaceChildren(message);
        return;
      }
      window.AtlasContext.showCompany(matches[0]);
    })
    .catch(() => {
      const message=document.createElement('p');
      message.textContent='Research company dossier is temporarily unavailable.';
      panel.replaceChildren(message);
    });
})();