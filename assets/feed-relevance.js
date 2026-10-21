// BOHUN source-wire relevance filter (INPUT46 MVP). Runs after the original source-wire script, which stays
// byte-identical: it only marks rows in #wire-stories. A headline stays visible when its title has a
// defence / security / war term or it comes from a defence outlet. Others are hidden, never deleted, with a
// visible reason and a "Show all" switch. Political and Ukraine-related news are kept by the term list,
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
  const bar = document.createElement('div');
  bar.className = 'ux-relevance';
  const label = document.createElement('span');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ux-relevance-toggle';
  bar.append(label, btn);
  list.before(bar);
  let showAll = new URLSearchParams(location.search).get('feed') === 'all';

  function apply() {
    // SITE UX v1 moves #wire-stories into its source panel after load: keep the bar right above the list.
    if (bar.nextElementSibling !== list) list.before(bar);
    let hidden = 0;
    for (const row of list.querySelectorAll('.wire-story')) {
      const reason = reasonFor(row);
      row.classList.toggle('ux-offtopic', !!reason);
      let note = row.querySelector('.ux-offtopic-note');
      if (reason) {
        hidden += 1;
        if (!note) {
          note = document.createElement('div');
          note.className = 'ux-offtopic-note';
          row.append(note);
        }
        note.textContent = 'Off-topic filter: ' + reason;
        row.hidden = !showAll;
      } else {
        if (note) note.remove();
        row.hidden = false;
      }
    }
    bar.hidden = hidden === 0;
    label.textContent = showAll
      ? 'Showing all headlines (' + hidden + ' marked off-topic).'
      : hidden + ' off-topic headlines hidden.';
    btn.textContent = showAll ? 'Hide off-topic' : 'Show all';
    btn.setAttribute('aria-pressed', String(showAll));
  }

  btn.addEventListener('click', () => { showAll = !showAll; apply(); });
  new MutationObserver(apply).observe(list, { childList: true });
  window.addEventListener('load', apply);
  apply();
})();
