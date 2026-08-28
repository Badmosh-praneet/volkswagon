/* Thin client for the Volkswagen India API.
 *
 * The site is served by the same FastAPI process as the API, so requests are
 * same-origin and no base URL or CORS handshake is needed. Set window.VW_API
 * before this script if the two are ever hosted apart. */

const BASE = window.VW_API || '/api';

/** GET a path, returning parsed JSON. Throws an Error carrying the API's
 *  `detail` message so callers can surface something meaningful. */
export async function get(path, params) {
  const url = new URL(BASE + path, window.location.origin);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(await detailOf(response));
  return response.json();
}

/** POST JSON. Same error contract as get(). */
export async function send(path, body, method = 'POST') {
  const response = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await detailOf(response));
  return response.json();
}

async function detailOf(response) {
  try {
    const data = await response.json();
    // FastAPI validation errors arrive as a list of {loc, msg}.
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((e) => `${(e.loc || []).slice(1).join('.')}: ${e.msg}`)
        .join('; ');
    }
    return data.detail || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

/* ------------------------------------------------------------ formatting -- */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
});

export const money = (n) => (n == null ? '—' : inr.format(Math.round(n)));

/** Indian-market shorthand: 47,11,013 reads better as "₹47.11 L". */
export function lakhs(n) {
  if (n == null) return '—';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  return `₹${(n / 100000).toFixed(2)} L`;
}

export const num = (n) => (n == null ? '—' : new Intl.NumberFormat('en-IN').format(n));

/* ----------------------------------------------------------------- utils -- */

/** Escape text bound into innerHTML. Everything here comes from the scraped
 *  knowledge base rather than a user, but templating without escaping is a
 *  habit worth not forming. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export const el = (id) => document.getElementById(id);

/** Render a failure into a container instead of leaving a dead skeleton. */
export function fail(node, error) {
  if (!node) return;
  node.innerHTML = `<div class="notice notice-err">Could not load: ${esc(error.message)}</div>`;
}

/** Wrap a section loader so one broken endpoint cannot blank the whole page. */
export async function section(node, loader) {
  try {
    await loader();
  } catch (error) {
    fail(node, error);
    console.error(error);
  }
}

/** Trailing-edge debounce, for the knowledge-base search box. */
export function debounce(fn, ms = 260) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
