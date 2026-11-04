/* Shell for the info pages, live counts, and the enquiry form. The form composes an email: nothing is stored on the site. */
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
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const f = form.elements;
    const body = `${f.message.value}\n\nName: ${f.name.value}\nOrganisation: ${f.organisation.value}\nEmail: ${f.email.value}`;
    location.href = `mailto:nabok@bohundefence.com?subject=${encodeURIComponent('BOHUN enquiry: ' + topic.value)}&body=${encodeURIComponent(body)}`;
    document.getElementById('enquiry-status').textContent = 'Your email app should open with this message. If it does not, write to nabok@bohundefence.com.';
  });
}
