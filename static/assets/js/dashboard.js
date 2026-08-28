/* API explorer.
 *
 * The endpoint list is read from /api/meta rather than typed here, so adding a
 * route to api_server.py makes it appear on this page without an edit. Path
 * parameters and query parameters get real inputs, seeded with values that
 * exist in the knowledge base so the first Send always returns something. */

import { get, num, esc, el } from './api.js';
import { icon } from './icons.js';


/* Sensible starting values per parameter name. Nothing here changes what the
   API accepts — it only saves the reader from typing an id to see a response. */
const SEEDS = {
  model_id: 'virtus',
  page_id: 'models.taigun',
  model: 'virtus',
  a: 'virtus',
  b: 'tiguan',
  q: '4MOTION',
  state: 'Karnataka',
  principal: '1200000',
  rate: '9.5',
  years: '5',
  limit: '8',
  body: 'SUV',
  sort: 'price_asc',
  variant: '',
  max_price: '',
};

/* Query parameters worth exposing per path — the explorer cannot read them off
   /api/meta, which lists routes rather than their signatures. */
const QUERY_PARAMS = {
  '/api/lineup': ['body', 'max_price', 'sort'],
  '/api/compare': ['a', 'b'],
  '/api/finance/emi': ['principal', 'rate', 'years'],
  '/api/finance/on-road': ['model', 'state', 'variant'],
  '/api/kb/search': ['q', 'limit'],
};

/* POST bodies, so the two write endpoints are explorable too. */
const BODIES = {
  '/api/appointments': {
    name: 'Asha Nair', phone: '9876543210', model: 'Taigun',
    preferred_date: '2026-09-15', dealer_city: 'Pune',
  },
  '/api/leads': {
    name: 'Rohit Verma', phone: '9876543210', city: 'Bengaluru', interest: 'virtus',
  },
};

const GROUPS = [
  ['Catalogue', (p) => /^\/api\/(cars|lineup|models|variants|compare)/.test(p)],
  ['Ownership', (p) => /^\/api\/(services|used-cars|brand)/.test(p)],
  ['Finance', (p) => p.startsWith('/api/finance')],
  ['Leads', (p) => /^\/api\/(appointments|leads)/.test(p)],
  ['Knowledge base', () => true],
];

let current = null;

/* --------------------------------------------------------------- rendering -- */

/** Colour a JSON string without a dependency: tokenise, then wrap each token. */
function highlight(json) {
  return esc(json).replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'j-num';
      if (match.startsWith('"')) cls = match.trim().endsWith(':') ? 'j-key' : 'j-str';
      else if (/true|false/.test(match)) cls = 'j-bool';
      else if (/null/.test(match)) cls = 'j-null';
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

function pathParams(path) {
  return [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
}

function renderParams(endpoint) {
  const fields = [
    ...pathParams(endpoint.path).map((name) => ({ name, kind: 'path' })),
    ...(QUERY_PARAMS[endpoint.path] || []).map((name) => ({ name, kind: 'query' })),
  ];

  el('run-params').innerHTML = fields
    .map(
      (field) => `
      <div class="field">
        <label for="p-${esc(field.name)}">${esc(field.name)}
          <span style="opacity:.6;letter-spacing:0;text-transform:none">${field.kind}</span>
        </label>
        <input type="text" id="p-${esc(field.name)}" data-kind="${field.kind}"
               data-name="${esc(field.name)}" value="${esc(SEEDS[field.name] ?? '')}">
      </div>`,
    )
    .join('');

  if (BODIES[endpoint.path]) {
    el('run-params').innerHTML += `
      <div class="field" style="flex:1 1 100%;min-width:0">
        <label for="p-body">request body — JSON</label>
        <textarea id="p-body" rows="6" style="width:100%;font-family:var(--mono);font-size:12.5px;
          padding:12px 13px;border:1px solid var(--line);border-radius:var(--radius);
          resize:vertical">${esc(JSON.stringify(BODIES[endpoint.path], null, 2))}</textarea>
      </div>`;
  }

  syncUrl();
  el('run-params').addEventListener('input', syncUrl);
}

function buildUrl() {
  if (!current) return '/api/meta';
  let path = current.path;
  const query = new URLSearchParams();

  el('run-params')
    .querySelectorAll('input[data-name]')
    .forEach((input) => {
      const value = input.value.trim();
      if (input.dataset.kind === 'path') {
        path = path.replace(`{${input.dataset.name}}`, encodeURIComponent(value || '…'));
      } else if (value) {
        query.set(input.dataset.name, value);
      }
    });

  const qs = query.toString();
  return path + (qs ? `?${qs}` : '');
}

function syncUrl() {
  el('run-url').textContent = buildUrl();
}

/* ------------------------------------------------------------------ sending -- */

async function run() {
  if (!current) return;
  const url = buildUrl();
  const button = el('run-btn');
  button.disabled = true;
  button.textContent = 'Sending…';

  const started = performance.now();
  try {
    const options =
      current.method === 'POST'
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: el('p-body')?.value ?? '{}',
          }
        : {};
    const response = await fetch(url, options);
    const text = await response.text();
    const elapsed = Math.round(performance.now() - started);

    let pretty = text;
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2);
    } catch { /* not JSON — show it raw */ }

    const status = el('run-status');
    status.textContent = `${response.status} ${response.statusText}`.trim().toUpperCase();
    status.className = `status-pill status-${response.ok ? '2xx' : '4xx'}`;
    el('run-time').textContent = `${elapsed} ms`;
    el('run-size').textContent = `${num(new Blob([text]).size)} bytes`;
    el('run-body').innerHTML = highlight(pretty);
  } catch (error) {
    el('run-status').textContent = 'NETWORK';
    el('run-status').className = 'status-pill status-4xx';
    el('run-body').textContent = String(error);
  } finally {
    button.disabled = false;
    button.textContent = 'Send';
  }
}

function select(endpoint, node) {
  current = endpoint;
  el('ep-list').querySelectorAll('.ep').forEach((other) =>
    other.setAttribute('aria-current', String(other === node)),
  );
  el('run-summary').textContent = endpoint.summary || '';
  renderParams(endpoint);
  return run();
}

/* --------------------------------------------------------------------- boot -- */

(async function boot() {
  let meta;
  try {
    meta = await get('/meta');
  } catch (error) {
    el('ep-list').innerHTML = `<div class="notice notice-err">${esc(error.message)}</div>`;
    return;
  }

  const { stats } = meta;
  el('meta-stats').innerHTML = [
    [meta.endpoints.length, 'Endpoints'],
    [num(stats.kbPages), 'KB pages'],
    [num(stats.kbWords), 'Words indexed'],
    [`${stats.models} · ${stats.variants}`, 'Models · variants'],
  ]
    .map(
      ([value, key]) => `
      <div class="card">
        <div style="font-size:29px;font-weight:700;color:var(--ink);letter-spacing:-0.035em;
                    font-variant-numeric:tabular-nums">${esc(value)}</div>
        <div class="label" style="margin-top:6px">${esc(key)}</div>
      </div>`,
    )
    .join('');

  /* Bucket the routes, first matching group wins. */
  const remaining = [...meta.endpoints];
  const buckets = GROUPS.map(([name, test]) => {
    const taken = remaining.filter((endpoint) => test(endpoint.path));
    taken.forEach((endpoint) => remaining.splice(remaining.indexOf(endpoint), 1));
    return [name, taken];
  }).filter(([, list]) => list.length);

  el('ep-list').innerHTML = buckets
    .map(
      ([name, list]) => `
      <div class="ep-group"><span class="label">${esc(name)}</span></div>
      ${list
        .map(
          (endpoint) => `
        <button class="ep" type="button" data-path="${esc(endpoint.path)}" data-method="${esc(endpoint.method)}">
          <span class="verb verb-${endpoint.method.toLowerCase()}">${esc(endpoint.method)}</span>
          <span class="path">${esc(endpoint.path)}</span>
          <span class="sum">${esc(endpoint.summary)}</span>
        </button>`,
        )
        .join('')}`,
    )
    .join('');

  el('ep-list').addEventListener('click', (event) => {
    const node = event.target.closest('.ep');
    if (!node) return;
    const endpoint = meta.endpoints.find(
      (candidate) => candidate.path === node.dataset.path && candidate.method === node.dataset.method,
    );
    if (endpoint) select(endpoint, node);
  });

  el('run-btn').addEventListener('click', run);
  el('run-btn').innerHTML = `Send ${icon('arrow-right', { size: 15 })}`;

  /* Open on the line-up, which is the endpoint the site leads with. */
  const first =
    el('ep-list').querySelector('[data-path="/api/lineup"]') || el('ep-list').querySelector('.ep');
  if (first) {
    const endpoint = meta.endpoints.find(
      (candidate) => candidate.path === first.dataset.path && candidate.method === first.dataset.method,
    );
    await select(endpoint, first);
  }
})();
