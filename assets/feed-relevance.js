// BOHUN source-wire relevance filter (INPUT46 MVP). Runs after the original source-wire script, which stays
// byte-identical: it only marks rows in #wire-stories. A headline stays visible when its title has a
// defence / security / war term or it comes from a defence outlet. Others are hidden, never deleted, with a
// reason visible only to editors (?feed=all). Political and Ukraine-related news are kept by the term list,
// so one word never removes a defence-relevant story.
(function () {
  const TERMS = [
    'defen[cs]e', 'défense', 'verteidigung', 'obron', 'military', 'militär', 'militaire', 'wojsk', 'army', 'armée',
    'armi', 'heer', 'bundeswehr', 'navy', 'naval', 'marine', 'air ?force', '\\braf\\b', 'royal navy', 'missile', 'rocket',
    'drone', 'drohne', '\\buav', '\\buas\\b', 'uncrewed', 'unmanned', 'autonomous', 'munition', 'ammunition', 'weapon',
    'artiller', 'mortar', 'howitzer', '\\btanks?\\b', 'submarine', 'u-boot', 'frigate', 'warship', 'vessel', 'jammer',
    'radar', 'interceptor', 'hypersonic', 'strike', 'attack', 'shell', 'troops', 'soldier', 'forces', 'brigade',
    '\\bnato\\b', 'aukus', 'pentagon', '\\bmod\\b', 'ministry of defence', 'department of war', 'procurement', 'contract',
    'sanction', 'intelligence', '\\bwar\\b', 'ceasefire', 'truce', 'security', 'deterrence', 'russia', 'russian',
    'ukrain', 'kyiv', 'zelensk', 'iran', 'houthi', 'israel', 'taiwan', 'space', 'satellite', 'aerospace',
    'typhoon', 'eurofighter', 'patriot', 'apache', 'f-35', 'lockheed', 'raytheon', 'rtx', '\\bbae\\b', 'rheinmetall',
    'saab', 'elbit', 'thales', 'leonardo', 'northrop', 'boeing', 'general dynamics', 'kongsberg', 'service personnel',
    'service children', 'veteran', '\\bdefenders?\\b', 'captiv', 'occupied', 'prisoners? of war', 'rüstung', 'cyber', 'swarm'
  ];
  const TERM_RE = new RegExp('(' + TERMS.join('|') + ')', 'i');
  const DEFENCE_OUTLETS = [
    'twz.com', 'breakingdefense.com', 'defensenews.com', 'ukdefencejournal.org.uk', 'defence-industry.eu',
    'edrmagazine.eu', 'navalnews.com', 'army-technology.com', 'airforce-technology.com', 'hartpunkt.de',
    'militaeraktuell.at', 'opex360.com', 'defence24.com', 'defence24.pl', 'tectonicdefense.com', 'euro-sd.com',
    'drones-magazin.de', 'gov.uk'
  ];

  function reasonFor(row) {
    const a = row.querySelector('a');
    if (!a) return null;
    const title = a.textContent || '';
    let host = '';
    try { host = new URL(a.href).hostname.replace(/^www\./, ''); } catch { return null; }
    if (TERM_RE.test(title)) return null;
    if (DEFENCE_OUTLETS.some((d) => host === d || host.endsWith('.' + d))) return null;
    return 'no defence or security term in the headline; general outlet (' + host + ')';
  }

  const list = document.getElementById('wire-stories');
  if (!list) return;
  // Owner decision 21.10: off-topic headlines are not shown at all (no bar, no toggle).
  // ?feed=all keeps them visible with the reason, for editors only.
  const showAll = new URLSearchParams(location.search).get('feed') === 'all';

  function apply() {
    for (const row of list.querySelectorAll('.wire-story')) {
      const reason = reasonFor(row);
      row.classList.toggle('ux-offtopic', !!reason);
      let note = row.querySelector('.ux-offtopic-note');
      if (reason && showAll) {
        if (!note) {
          note = document.createElement('div');
          note.className = 'ux-offtopic-note';
          row.append(note);
        }
        note.textContent = 'Off-topic filter: ' + reason;
      } else if (note) {
        note.remove();
      }
      row.hidden = !!reason && !showAll;
    }
  }

  new MutationObserver(apply).observe(list, { childList: true });
  apply();
})();
