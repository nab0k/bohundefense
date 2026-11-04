/* Shell for the info pages, live counts, and the enquiry form (sent through the existing Formspree form). */
import { mountShell } from './shell.js';

const active = document.body.dataset.active || '';
mountShell({ variant: 'directory', active }).catch(() => {});

const count = (url, read) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then(read);
const put = (key, value) => {
  const node = document.querySelector(`[data-count="${key}"]`);
  if (node && Number.isFinite(value)) node.textContent = value.toLocaleString('en-US');
};
count('/feed/synthesis-feed.json', (d) => d.items.length).then((n) => put('syntheses', n)).catch(() => {});
count('/atlas/companies-directory-v1.json', (d) => d.total).then((n) => put('companies', n)).catch(() => {});
count('/atlas/company-country-groups.geojson', (d) => new Set(d.features.map((f) => f.properties.country)).size).then((n) => put('countries', n)).catch(() => {});

const form = document.getElementById('enquiry');
if (form) {
  const topic = form.elements.topic;
  const wanted = new URLSearchParams(location.search).get('topic');
  if (wanted && [...topic.options].some((o) => o.value === wanted)) topic.value = wanted;
  const status = document.getElementById('enquiry-status');
  const send = form.querySelector('button[type=submit]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    send.disabled = true;
    status.textContent = 'Sending…';
    const data = new FormData(form);
    data.set('_subject', 'BOHUN enquiry: ' + topic.value);
    try {
      const reply = await fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      if (!reply.ok) throw new Error('HTTP ' + reply.status);
      form.reset();
      status.textContent = 'Thank you. Your enquiry has been sent, and we will reply by email.';
    } catch {
      status.innerHTML = 'Your enquiry could not be sent. Please write to <a href="mailto:nabok@bohundefence.com">nabok@bohundefence.com</a>.';
    } finally {
      send.disabled = false;
    }
  });
}
