/* Simple national flags for countries present in the public index (drawn, not downloaded).
 * Unknown codes fall back to a neutral ISO badge rather than a guessed flag.
 */
const H = (...c) => c.map((col, i) => `<rect y="${(i * 18) / c.length}" width="24" height="${18 / c.length}" fill="${col}"/>`).join('');
const V = (...c) => c.map((col, i) => `<rect x="${(i * 24) / c.length}" width="${24 / c.length}" height="18" fill="${col}"/>`).join('');
const FLAGS = {
  DE: H('#000', '#dd0000', '#ffce00'), AT: H('#ed2939', '#fff', '#ed2939'), NL: H('#ae1c28', '#fff', '#21468b'),
  PL: H('#fff', '#dc143c'), UA: H('#0057b7', '#ffd700'), FR: V('#0055a4', '#fff', '#ef4135'), IT: V('#009246', '#fff', '#ce2b37'),
  BE: V('#000', '#fdda24', '#ef3340'), RO: V('#002b7f', '#fcd116', '#ce1126'),
  ES: '<rect width="24" height="18" fill="#aa151b"/><rect y="4.5" width="24" height="9" fill="#f1bf00"/>',
  FI: '<rect width="24" height="18" fill="#fff"/><rect x="6.5" width="4" height="18" fill="#002f6c"/><rect y="7" width="24" height="4" fill="#002f6c"/>',
  CZ: '<rect width="24" height="9" fill="#fff"/><rect y="9" width="24" height="9" fill="#d7141a"/><path d="M0 0 12 9 0 18Z" fill="#11457e"/>',
  GB: '<rect width="24" height="18" fill="#012169"/><path d="M0 0 24 18M24 0 0 18" stroke="#fff" stroke-width="3.6"/><path d="M0 0 24 18M24 0 0 18" stroke="#c8102e" stroke-width="1.4"/><path d="M12 0v18M0 9h24" stroke="#fff" stroke-width="5"/><path d="M12 0v18M0 9h24" stroke="#c8102e" stroke-width="3"/>',
};
export function flag(iso) {
  const k = String(iso || '').toUpperCase();
  if (!FLAGS[k]) return `<span class="flag flag-iso" aria-hidden="true">${k}</span>`;
  return `<svg class="flag" viewBox="3 0 18 18" aria-hidden="true"><clipPath id="fc-${k}"><circle cx="12" cy="9" r="9"/></clipPath><g clip-path="url(#fc-${k})">${FLAGS[k]}</g></svg>`;
}
