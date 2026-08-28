/* Volkswagen India — page controller.
 *
 * One loader per section, each wrapped in section() so a single failing
 * endpoint degrades to a notice in its own block rather than blanking the
 * page. Nothing is hard-coded: every price, figure and body of copy below
 * arrives from /api. */

import { get, send, money, lakhs, num, esc, el, section, debounce } from './api.js';
import { icon, bodyFigure } from './icons.js';

/* Shared across sections once loaded, so the compare picker, the on-road
   estimator and the booking form all speak about the same cars. */
let MODELS = [];
let VARIANTS = [];

const CITIES = [
  'Ahmedabad', 'Bengaluru', 'Chennai', 'Delhi', 'Ghaziabad',
  'Gurgaon', 'Hyderabad', 'Mumbai', 'Noida', 'Pune',
];

/* ------------------------------------------------------------------ chrome -- */

el('panel-close').innerHTML = icon('close', { size: 18 });

/* Lift blocks into place as they scroll in. Fires once per element; anything
   the observer never reaches (or that arrives after it ran) is revealed on the
   spot, so content can never be stranded invisible. */
const revealer = new IntersectionObserver(
  (entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      obs.unobserve(entry.target);
    });
  },
  { rootMargin: '0px 0px -12% 0px', threshold: 0.06 },
);

function reveal(root = document) {
  root.querySelectorAll('[data-reveal], [data-reveal-children]').forEach((node) => {
    if (node.dataset.revealBound) return;
    node.dataset.revealBound = '1';
    if (node.hasAttribute('data-reveal-children')) {
      [...node.children].forEach((child, i) => child.style.setProperty('--i', i));
    }
    /* Already on screen when we get here — show it without waiting. */
    const box = node.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) node.classList.add('in');
    else revealer.observe(node);
  });
}

/* Highlight the section currently in view in the nav. */
function trackSections() {
  const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const targets = links
    .map((link) => ({ link, node: document.querySelector(link.getAttribute('href')) }))
    .filter((entry) => entry.node);

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const match = targets.find((t) => t.node === entry.target);
        links.forEach((link) => link.classList.remove('active'));
        if (match) match.link.classList.add('active');
      });
    },
    { rootMargin: '-70px 0px -65% 0px' },
  );
  targets.forEach((entry) => observer.observe(entry.node));
}

/* ----------------------------------------------------------------- line-up -- */

/* A model's studio render, with the body-type elevation drawn underneath.
 *
 * The drawing is no longer the subject — it is the placeholder. It holds the
 * frame at the right aspect while the photo decodes, so nothing jumps, and it
 * stays put as the fallback for any model the source page has no render for.
 * The drawing is a body type, not a portrait (both SUVs share one), which is
 * why it only ever appears under a photo or in place of a missing one. */
function carShot(model, width, { eager = false } = {}) {
  const drawing = bodyFigure(model.body, {
    width,
    title: model.image ? undefined : `${model.body} side elevation`,
  });
  if (!model.image) {
    return `<span class="shot" style="--shot-w:${width}px">${drawing}</span>`;
  }
  return `<span class="shot" style="--shot-w:${width}px">
      <span class="shot-ph" aria-hidden="true">${drawing}</span>
      <img class="shot-img" src="${esc(model.image)}" alt="${esc(model.name)}"
           width="1280" height="484" decoding="async" draggable="false"
           loading="${eager ? 'eager' : 'lazy'}">
    </span>`;
}

/** Fade a render in once it decodes; drop it and keep the drawing if it 404s. */
function hydrateShots(root = document) {
  root.querySelectorAll('.shot-img:not([data-hydrated])').forEach((img) => {
    img.dataset.hydrated = '1';
    const show = () => {
      img.classList.add('loaded');
      const shot = img.closest('.shot');
      if (!shot) return;
      shot.classList.add('ready');
      /* Fading the drawing out is not enough on its own — a stale stylesheet
         would leave its line-work ghosting through the render. Once the fade
         has run, take the node out entirely. */
      const ph = shot.querySelector('.shot-ph');
      if (ph) setTimeout(() => ph.remove(), 400);
    };
    if (img.complete && img.naturalWidth) show();
    else {
      img.addEventListener('load', show, { once: true });
      img.addEventListener('error', () => img.remove(), { once: true });
    }
  });
}

/* ------------------------------------------------------------------- hero -- */

/* A stage and a strip: one car large under a key light, the rest of the
   line-up beneath it. The renders are the best thing on the page, so one of
   them gets to be the size of an actual car rather than a thumbnail in a list.
   It is a slider — arrows, swipe, arrow keys, or a direct pick from the strip
   — and it advances on its own until the reader takes over, then stops. An
   autoplay that keeps fighting you is worse than none. */

const AUTOPLAY_MS = 6500;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let slides = [];
let current = -1;
let autoplay = null;
let userDrove = false;

function stopAutoplay() {
  clearInterval(autoplay);
  autoplay = null;
}

function startAutoplay() {
  if (autoplay || userDrove || reducedMotion.matches || slides.length < 2) return;
  autoplay = setInterval(() => go(1, { auto: true }), AUTOPLAY_MS);
}

/** Move by `delta`, wrapping at both ends. */
function go(delta, opts = {}) {
  if (!slides.length) return;
  goTo((current + delta + slides.length) % slides.length, {
    ...opts,
    direction: delta > 0 ? 'next' : 'prev',
  });
}

function goTo(index, { direction, auto = false } = {}) {
  if (index === current || !slides[index]) return;
  /* Any deliberate move ends the autoplay for good. */
  if (!auto) {
    userDrove = true;
    stopAutoplay();
  }
  const dir = direction || (index > current ? 'next' : 'prev');
  current = index;
  renderStage(slides[index], dir);
}

function renderStage(model, direction = 'next') {
  const spec = [model.engine, model.power, model.transmissions?.[0]]
    .filter(Boolean)
    .join('  ·  ');

  el('hero-stage').innerHTML = `
    <div class="stage-car">${carShot(model, 620, { eager: true })}</div>
    <div class="stage-caption">
      <div>
        <span class="label">${esc(model.body)}${model.safety ? ` · ${esc(model.safety)}` : ''}</span>
        <h2>${esc(model.name)}</h2>
        ${model.tagline ? `<p class="stage-tagline">${esc(model.tagline)}</p>` : ''}
      </div>
      <div class="stage-price">
        <span class="amount">${lakhs(model.priceFrom)}</span>
        <span class="label">Ex-showroom, from</span>
      </div>
    </div>
    <div class="stage-foot">
      ${spec ? `<p class="stage-spec label">${esc(spec)}</p>` : '<span></span>'}
      <span class="stage-count label">
        ${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}
      </span>
    </div>
    <button class="btn btn-ghost btn-sm stage-more" type="button"
            data-model="${esc(model.id)}">
      ${esc(model.shortName)} details ${icon('chevron-right', { size: 15 })}
    </button>`;

  hydrateShots(el('hero-stage'));

  /* Re-trigger the entry animation, from the side the reader came from. */
  const car = el('hero-stage').querySelector('.stage-car');
  car.classList.remove('slide-next', 'slide-prev');
  void car.offsetWidth;
  car.classList.add(direction === 'prev' ? 'slide-prev' : 'slide-next');

  el('hero-strip')
    .querySelectorAll('.strip-item')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.feature === model.id)));
}

function heroStrip(models) {
  slides = models;

  el('hero-strip').innerHTML = models
    .map(
      (model) => `
      <button class="strip-item" type="button" aria-pressed="false"
              data-feature="${esc(model.id)}">
        <span class="strip-fig">${carShot(model, 120, { eager: true })}</span>
        <span class="strip-nm">${esc(model.name)}</span>
        <span class="strip-pr">${lakhs(model.priceFrom)}</span>
      </button>`,
    )
    .join('');
  hydrateShots(el('hero-strip'));

  el('hero-strip').addEventListener('click', (event) => {
    const item = event.target.closest('.strip-item');
    if (item) goTo(models.findIndex((m) => m.id === item.dataset.feature));
  });

  el('stage-prev').innerHTML = icon('chevron-right', { size: 20 });
  el('stage-next').innerHTML = icon('chevron-right', { size: 20 });
  el('stage-prev').addEventListener('click', () => go(-1));
  el('stage-next').addEventListener('click', () => go(1));

  const wrap = el('hero-stage-wrap');

  /* Arrow keys work whenever focus is inside the showcase. */
  wrap.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
  });

  /* Horizontal drag / swipe.
     The threshold is tested on pointermove, not pointerup: once a touch starts
     to look like a scroll the browser claims the gesture and sends
     pointercancel, so a handler that waits for pointerup never runs. Vertical
     intent bails out early, leaving the page free to scroll under a finger. */
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let swiped = false;

  wrap.addEventListener('pointerdown', (event) => {
    /* Touch and pen only. A mouse drag over a photograph starts the browser's
       own image drag, which kills the pointer stream — and dragging a car
       sideways is not something anyone expects to do with a mouse. Pointer
       devices get the arrows, the strip and the arrow keys. */
    if (event.pointerType === 'mouse') return;
    startX = event.clientX;
    startY = event.clientY;
    tracking = true;
    swiped = false;
  });

  wrap.addEventListener('pointermove', (event) => {
    if (!tracking) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
    if (Math.abs(dx) > 40) {
      tracking = false;
      swiped = true;
      go(dx < 0 ? 1 : -1);
    }
  });

  const endDrag = () => { tracking = false; };
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);

  /* A drag that ends over the details button must not also open the sheet. */
  wrap.addEventListener('click', (event) => {
    if (!swiped) return;
    swiped = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  /* Hovering or tabbing in holds it still without cancelling autoplay. */
  wrap.addEventListener('pointerenter', stopAutoplay);
  wrap.addEventListener('focusin', stopAutoplay);
  wrap.addEventListener('pointerleave', startAutoplay);
  wrap.addEventListener('focusout', startAutoplay);
  document.addEventListener('visibilitychange', () =>
    document.hidden ? stopAutoplay() : startAutoplay(),
  );

  /* Open on the Tiguan R-Line — the halo model on the source line-up page —
     falling back to the first entry if it is ever dropped from the KB. */
  const start = models.findIndex((m) => m.id === 'tiguan');
  goTo(start >= 0 ? start : 0, { direction: 'next', auto: true });
  startAutoplay();
}

function modelCard(model) {
  const specs = [
    ['Engine', model.engine],
    ['Max. power', model.power],
    ['Transmission', model.transmissions?.[0]],
    ['Body', `${model.body}${model.seats ? ` · ${model.seats} seats` : ''}`],
  ].filter(([, value]) => value);

  const flag = model.safety
    ? `<span class="badge badge-accent">${esc(model.safety)}</span>`
    : `<span class="badge">${esc(model.body)}</span>`;

  return `
    <article class="model-card">
      <div class="model-fig">
        <span class="badge-slot">${flag}</span>
        ${carShot(model, 250)}
      </div>
      <div class="model-body">
        <h3>${esc(model.name)}</h3>
        ${model.tagline ? `<p class="tagline">${esc(model.tagline)}</p>` : ''}
        <p class="blurb">${esc(model.blurb)}</p>

        <div class="model-spec">
          ${specs
            .map(
              ([key, value]) =>
                `<div><span class="v">${esc(value)}</span><span class="k label">${esc(key)}</span></div>`,
            )
            .join('')}
        </div>

        <div class="model-foot">
          <div class="price-from">
            <span class="amount">${lakhs(model.priceFrom)}</span>
            <span class="label" style="display:block">Ex-showroom, from</span>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-model="${esc(model.id)}">
            Details ${icon('chevron-right', { size: 15 })}
          </button>
        </div>
      </div>
    </article>`;
}

function renderLineup(models) {
  const grid = el('lineup-grid');
  if (!models.length) {
    grid.innerHTML = '<div class="notice">No models match that filter.</div>';
    return;
  }
  grid.innerHTML = models.map(modelCard).join('');
  grid.setAttribute('data-reveal-children', '');
  delete grid.dataset.revealBound;
  grid.classList.remove('in');
  hydrateShots(grid);
  reveal(grid.parentElement);
}

async function loadLineup() {
  const data = await get('/lineup');
  MODELS = data.models;

  heroStrip(MODELS);
  renderLineup(MODELS);
  el('lineup-disclaimer').textContent = data.disclaimer;


  /* Body-type chips, counted from the model set rather than the facet list, so
     a chip's number always matches what clicking it shows. The facet counts on
     the source page count Virtus Sport and Virtus Chrome as separate cards. */
  const counts = MODELS.reduce((acc, model) => {
    acc[model.body] = (acc[model.body] || 0) + 1;
    return acc;
  }, {});

  const chips = [['All', MODELS.length], ...Object.entries(counts)];
  el('lineup-filters').innerHTML =
    chips
      .map(
        ([label, count], index) =>
          `<button class="chip" type="button" role="button" aria-pressed="${index === 0}"
                   data-body="${label === 'All' ? '' : esc(label)}">
             ${esc(label)}<span class="n">${count}</span>
           </button>`,
      )
      .join('') + '<span class="filter-count" id="lineup-count"></span>';

  const setCount = (n) => {
    el('lineup-count').textContent = `${n} of ${MODELS.length} shown`;
  };
  setCount(MODELS.length);

  el('lineup-filters').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    el('lineup-filters')
      .querySelectorAll('.chip')
      .forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
    const wanted = chip.dataset.body;
    const shown = wanted ? MODELS.filter((m) => m.body === wanted) : MODELS;
    renderLineup(shown);
    setCount(shown.length);
  });
}

/* ------------------------------------------------------------- model panel -- */

const panel = el('panel');
const scrim = el('panel-scrim');
let lastFocused = null;

function closePanel() {
  panel.classList.remove('open');
  scrim.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (lastFocused) lastFocused.focus();
}

async function openPanel(modelId) {
  lastFocused = document.activeElement;
  panel.classList.add('open');
  scrim.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  el('panel-close').focus();

  const content = el('panel-content');
  content.innerHTML = '<div class="skeleton"></div>';

  try {
    const model = await get(`/models/${modelId}`);
    el('panel-title').textContent = model.name;
    el('panel-body-type').textContent =
      [model.body, model.tagline].filter(Boolean).join(' — ');

    const specRows = [
      ['From, ex-showroom', money(model.priceFrom)],
      ['Engine', model.engine],
      ['Max. power', model.power ? `${model.power}${model.powerNote ? ` (${model.powerNote})` : ''}` : null],
      ['Max. torque', model.torque],
      ['Transmission', model.transmissions?.join(', ')],
      ['Drivetrain', model.drivetrain],
      ['Acceleration', model.acceleration],
      ['Seats', model.seats],
      ['Safety', model.safety],
    ].filter(([, value]) => value);

    const dims = model.dimensions
      ? [
          ['Length', `${num(model.dimensions.length_mm)} mm`],
          ['Width', `${num(model.dimensions.width_mm)} mm`],
          ['Height', `${num(model.dimensions.height_mm)} mm`],
          ['Wheelbase', `${num(model.dimensions.wheelbase_mm)} mm`],
          ['Ground clearance', `${num(model.dimensions.ground_clearance_mm)} mm, unladen`],
        ]
      : [];

    content.innerHTML = `
      <div class="panel-stage">${carShot(model, 340, { eager: true })}</div>

      <p style="color:var(--ink-soft)">${esc(model.blurb)}</p>

      <h3>Specification</h3>
      <div class="spec-list">
        ${specRows
          .map(([key, value]) => `<div><span class="k2">${esc(key)}</span><span class="v2">${esc(value)}</span></div>`)
          .join('')}
      </div>

      ${
        model.variants.length
          ? `<h3>Variants</h3>${model.variants
              .map(
                (variant) => `
              <div class="variant-row">
                <div>
                  <div class="vn">${esc(variant.name)}</div>
                  <div class="vnote">${esc(variant.note || '')}</div>
                </div>
                <div class="vp">${money(variant.price_inr)}</div>
              </div>`,
              )
              .join('')}`
          : ''
      }

      ${
        model.highlights.length
          ? `<h3>Highlights</h3>${model.highlights
              .map(
                (item) =>
                  `<div class="hl"><strong>${esc(item.title)}</strong><p>${esc(item.text)}</p></div>`,
              )
              .join('')}`
          : ''
      }

      ${
        dims.length
          ? `<h3>Dimensions</h3><div class="spec-list">${dims
              .map(([key, value]) => `<div><span class="k2">${esc(key)}</span><span class="v2">${esc(value)}</span></div>`)
              .join('')}</div>`
          : ''
      }

      ${
        model.colours?.length
          ? `<h3>Colours</h3><div style="display:flex;flex-wrap:wrap;gap:8px">${model.colours
              .map((colour) => `<span class="badge">${esc(colour)}</span>`)
              .join('')}</div>`
          : ''
      }

      ${
        model.faqs?.length
          ? `<h3>Frequently asked</h3><div class="acc">${model.faqs
              .map(
                (faq) => `
              <details>
                <summary>${esc(faq.question)} ${icon('chevron-down', { size: 16 })}</summary>
                <div class="acc-body">${esc(faq.answer)}</div>
              </details>`,
              )
              .join('')}</div>`
          : ''
      }

      <h3>Source</h3>
      <p style="font-size:13.5px;color:var(--ink-faint)">
        Read from <code>${esc(model.source)}</code>${
          model.sourceUrl
            ? `, scraped from <a href="${esc(model.sourceUrl)}" target="_blank" rel="noopener">${esc(
                model.sourceUrl.replace('https://www.', ''),
              )}</a> ${icon('arrow-out', { size: 13 })}`
            : ''
        }.
      </p>
      <a class="btn btn-primary" href="#book" data-close-panel style="margin-top:20px;width:100%">
        Book a ${esc(model.shortName)} test drive
      </a>`;
    hydrateShots(content);
  } catch (error) {
    content.innerHTML = `<div class="notice notice-err">Could not load: ${esc(error.message)}</div>`;
  }
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-model]');
  if (trigger) {
    openPanel(trigger.dataset.model);
    return;
  }
  if (event.target.closest('[data-close-panel]')) closePanel();
});
el('panel-close').addEventListener('click', closePanel);
scrim.addEventListener('click', closePanel);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && panel.classList.contains('open')) closePanel();
});

/* ----------------------------------------------------------------- compare -- */

async function runCompare() {
  const a = el('cmp-a').value;
  const b = el('cmp-b').value;
  const out = el('compare-out');
  if (!a || !b) return;
  if (a === b) {
    out.innerHTML = '<div class="notice">Pick two different models.</div>';
    return;
  }

  try {
    const data = await get('/compare', { a, b });
    const cell = (value) =>
      typeof value === 'number' && value > 100000 ? money(value) : esc(value ?? '—');

    const shotFor = (id) => {
      const m = MODELS.find((x) => x.id === id);
      return m ? carShot(m, 240) : '';
    };

    out.innerHTML = `
      <div class="table-wrap">
        <div class="compare-shots">
          <div></div>
          <div>${shotFor(data.a.id)}</div>
          <div>${shotFor(data.b.id)}</div>
        </div>
        <table style="table-layout:fixed;min-width:640px">
          <thead>
            <tr>
              <th style="width:26%">Field</th>
              <th style="width:37%">${esc(data.a.name)}</th>
              <th style="width:37%">${esc(data.b.name)}</th>
            </tr>
          </thead>
          <tbody>
            ${data.rows
              .map(
                (row) => `
              <tr>
                <td class="rowlabel">${esc(row.label)}</td>
                <td class="num"><strong>${cell(row.a)}</strong></td>
                <td class="num"><strong>${cell(row.b)}</strong></td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
    hydrateShots(out);
  } catch (error) {
    out.innerHTML = `<div class="notice notice-err">${esc(error.message)}</div>`;
  }
}

function initCompare() {
  const options = MODELS.map(
    (model) => `<option value="${esc(model.id)}">${esc(model.name)}</option>`,
  ).join('');
  el('cmp-a').innerHTML = options;
  el('cmp-b').innerHTML = options;
  el('cmp-a').value = MODELS[0]?.id ?? '';
  el('cmp-b').value = MODELS[MODELS.length - 1]?.id ?? '';
  el('cmp-a').addEventListener('change', runCompare);
  el('cmp-b').addEventListener('change', runCompare);
  return runCompare();
}

/* --------------------------------------------------------------- ownership -- */

async function loadOwnership() {
  const [care, services] = await Promise.all([get('/services/4ever-care'), get('/services')]);

  el('care-name').textContent = care.name;
  el('care-intro').textContent = care.intro;
  el('care-pillars').innerHTML = care.pillars
    .map(
      (pillar) =>
        `<div class="pillar"><strong>${esc(pillar.title)}</strong><p>${esc(pillar.text)}</p></div>`,
    )
    .join('');

  el('care-schedule').innerHTML = care.schedule
    .map(
      (stage) => `
      <div class="care-stage">
        <h3>${esc(stage.stage)}</h3>
        <div class="at">${esc(stage.at)}</div>
        <ul>
          ${stage.includes
            .map((item) => `<li>${icon('check', { size: 14 })}<span>${esc(item)}</span></li>`)
            .join('')}
        </ul>
      </div>`,
    )
    .join('');

  el('services-grid').innerHTML = services.services
    .map(
      (service) => `
      <article class="card">
        <span style="color:var(--accent-ink);display:block;margin-bottom:14px">
          ${icon(service.icon, { size: 26 })}
        </span>
        <h3 style="font-size:17px">${esc(service.name)}</h3>
        <p style="margin-top:10px;font-size:14px;color:var(--ink-soft)">${esc(service.summary)}</p>
      </article>`,
    )
    .join('');
}

/* ----------------------------------------------------------------- finance -- */

function initEmi() {
  const amount = el('emi-amount');
  const rate = el('emi-rate');
  const tenure = el('emi-tenure');
  const out = el('emi-out');

  const recalc = debounce(async () => {
    try {
      const data = await get('/finance/emi', {
        principal: amount.value,
        rate: rate.value,
        years: tenure.value,
      });
      out.innerHTML = `
        <span class="label">Monthly instalment</span>
        <div class="result-big">${money(data.monthly)}</div>
        <div class="result-rows">
          <div><span class="k2">Principal</span><span class="v2">${money(data.principal)}</span></div>
          <div><span class="k2">Total interest</span><span class="v2">${money(data.totalInterest)}</span></div>
          <div><span class="k2">Total payable</span><span class="v2">${money(data.totalPayable)}</span></div>
          <div><span class="k2">Instalments</span><span class="v2">${data.months}</span></div>
        </div>`;
    } catch (error) {
      out.innerHTML = `<div class="notice notice-err">${esc(error.message)}</div>`;
    }
  }, 140);

  const sync = () => {
    el('emi-amount-out').textContent = lakhs(Number(amount.value));
    el('emi-rate-out').textContent = `${Number(rate.value).toFixed(1)}%`;
    el('emi-tenure-out').textContent = `${tenure.value} year${tenure.value === '1' ? '' : 's'}`;
    recalc();
  };

  [amount, rate, tenure].forEach((input) => input.addEventListener('input', sync));
  sync();
}

async function initOnRoad(states) {
  const variantSelect = el('orp-variant');
  const stateSelect = el('orp-state');
  const out = el('orp-out');

  /* Most variant names already carry the model ("Virtus Chrome"), so only
     prefix the ones that do not ("Taigun" under "The new Taigun"). */
  variantSelect.innerHTML = VARIANTS.map((variant) => {
    const label = variant.name.includes(variant.modelName.replace(/^The new /, ''))
      ? variant.name
      : `${variant.modelName} — ${variant.name}`;
    return `<option value="${esc(variant.model)}|${esc(variant.name)}">${esc(label)}</option>`;
  }).join('');
  stateSelect.innerHTML = states
    .map((state) => `<option${state === 'Maharashtra' ? ' selected' : ''}>${esc(state)}</option>`)
    .join('');

  const recalc = async () => {
    const [modelId, variantName] = variantSelect.value.split('|');
    try {
      const data = await get('/finance/on-road', {
        model: modelId,
        variant: variantName,
        state: stateSelect.value,
      });
      out.innerHTML = `
        <span class="label">On-road, ${esc(data.state)}</span>
        <div class="result-big">${money(data.onRoad)}</div>
        <div class="result-rows">
          <div><span class="k2">Ex-showroom</span><span class="v2">${money(data.exShowroom)}</span></div>
          <div><span class="k2">Road tax (${(data.roadTaxRate * 100).toFixed(1)}%)</span><span class="v2">${money(data.roadTax)}</span></div>
          <div><span class="k2">Insurance, first year</span><span class="v2">${money(data.insurance)}</span></div>
          <div><span class="k2">Other charges</span><span class="v2">${money(data.otherCharges)}</span></div>
        </div>
        <p class="result-note">${esc(data.note)}</p>`;
    } catch (error) {
      out.innerHTML = `<div class="notice notice-err">${esc(error.message)}</div>`;
    }
  };

  variantSelect.addEventListener('change', recalc);
  stateSelect.addEventListener('change', recalc);
  return recalc();
}

async function loadFinance() {
  const data = await get('/finance');
  initEmi();
  await initOnRoad(data.states);

  const products = [
    ['leasing', 'gauge', data.leasing.cities.length ? `${data.leasing.cities.length} cities` : ''],
    ['insurance', 'umbrella', ''],
    ['warranty', 'certificate', ''],
  ];

  el('finance-products').innerHTML = products
    .map(([key, iconName, note]) => {
      const product = data[key];
      const bullets = product.benefits || product.cities;
      return `
        <article class="card">
          <span style="color:var(--accent-ink);display:block;margin-bottom:14px">
            ${icon(iconName, { size: 26 })}
          </span>
          <h3 style="font-size:17px">${esc(product.name)}</h3>
          ${note ? `<span class="badge" style="margin-top:10px">${esc(note)}</span>` : ''}
          <p style="margin-top:12px;font-size:14px;color:var(--ink-soft)">${esc(product.summary)}</p>
          ${
            product.benefits
              ? `<ul style="margin:16px 0 0;padding:0;list-style:none">${bullets
                  .map(
                    (item) =>
                      `<li style="display:flex;gap:9px;align-items:flex-start;padding:5px 0;font-size:13.5px;color:var(--ink-soft)">
                         <span style="color:var(--accent-ink)">${icon('check', { size: 14 })}</span>
                         <span>${esc(item)}</span>
                       </li>`,
                  )
                  .join('')}</ul>`
              : `<p style="margin-top:14px;font-size:13px;color:var(--ink-faint)">${esc(
                  product.cities.join(' · '),
                )}</p>`
          }
        </article>`;
    })
    .join('');
}

/* --------------------------------------------------------------- pre-owned -- */

async function loadPreOwned() {
  const data = await get('/used-cars');
  el('cpo-name').textContent = data.name;
  el('cpo-standfirst').textContent = data.standfirst;
  el('cpo-list').innerHTML = data.promises
    .map(
      (promise) => `
      <li>
        <span class="tick">${icon('check', { size: 17 })}</span>
        <span>${esc(promise)}</span>
      </li>`,
    )
    .join('');
}

/* ---------------------------------------------------------------- heritage -- */

async function loadBrand() {
  const data = await get('/brand');
  el('brand-headline').textContent = data.headline;
  el('brand-intro').textContent = data.intro;

  el('brand-facts').innerHTML = data.facts
    .map(
      ([value, caption]) => `
      <div class="card">
        <div style="font-size:29px;font-weight:700;color:var(--ink);letter-spacing:-0.035em">${esc(value)}</div>
        <p style="margin-top:8px;font-size:13.5px;color:var(--ink-soft)">${esc(caption)}</p>
      </div>`,
    )
    .join('');

  el('brand-timeline').innerHTML = data.timeline
    .map(
      (entry) =>
        `<div><span class="yr">${entry.year}</span><span>${esc(entry.event)}</span></div>`,
    )
    .join('');
}

/* ------------------------------------------------------------------- forms -- */

function fillCities(...selects) {
  const options = CITIES.map(
    (city) => `<option${city === 'Pune' ? ' selected' : ''}>${esc(city)}</option>`,
  ).join('');
  selects.forEach((id) => {
    el(id).innerHTML = options;
  });
}

function initForms() {
  fillCities('b-city', 'l-city');

  const modelOptions = MODELS.map(
    (model) => `<option value="${esc(model.name)}">${esc(model.name)}</option>`,
  ).join('');
  el('b-model').innerHTML = modelOptions;

  /* Show the car being booked, and follow the select. The form is about a
     specific car, so it should say which one in the page's own language. */
  const showBooked = () => {
    const model = MODELS.find((m) => m.name === el('b-model').value) || MODELS[0];
    if (!model) return;
    el('book-stage').innerHTML = carShot(model, 260);
    hydrateShots(el('book-stage'));
  };
  el('b-model').addEventListener('change', showBooked);
  /* A successful submit resets the form, which silently returns the select to
     its first option without firing `change` — the stage would be left showing
     the previous car. The reset event fires before values revert, so re-read
     on the next tick. */
  el('booking-form').addEventListener('reset', () =>
    setTimeout(() => {
      showBooked();
      defaultDate();
    }, 0),
  );
  showBooked();
  el('l-interest').innerHTML =
    '<option value="">No particular model</option>' +
    MODELS.map((model) => `<option value="${esc(model.id)}">${esc(model.name)}</option>`).join('');

  /* Default the test-drive date to a week out — far enough to be plausible. */
  const dateInput = el('b-date');
  const defaultDate = () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    dateInput.value = nextWeek.toISOString().slice(0, 10);
  };
  dateInput.min = new Date().toISOString().slice(0, 10);
  defaultDate();

  async function submit(form, button, target, request) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const data = await request();
      target.innerHTML = `<div class="notice notice-ok">${esc(data.message)} <br>
        <span class="label" style="color:inherit;opacity:.75">Reference ${esc(data.reference)}</span></div>`;
      form.reset();
    } catch (error) {
      target.innerHTML = `<div class="notice notice-err">${esc(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  const bookingForm = el('booking-form');
  bookingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!bookingForm.reportValidity()) return;
    submit(bookingForm, bookingForm.querySelector('button'), el('booking-msg'), () =>
      send('/appointments', {
        name: el('b-name').value,
        phone: el('b-phone').value,
        model: el('b-model').value,
        preferred_date: el('b-date').value,
        dealer_city: el('b-city').value,
      }),
    );
  });

  const leadForm = el('lead-form');
  leadForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!leadForm.reportValidity()) return;
    submit(leadForm, leadForm.querySelector('button'), el('lead-msg'), () =>
      send('/leads', {
        name: el('l-name').value,
        phone: el('l-phone').value,
        city: el('l-city').value,
        interest: el('l-interest').value || null,
        message: el('l-message').value || null,
      }),
    );
  });
}

/* ------------------------------------------------------------------ footer -- */

async function loadMeta() {
  const data = await get('/meta');
  const { stats } = data;

  /* A range says more than a floor: "from ₹10.71 L" only raises the question
     of what the top is, and both numbers are already in the data. */
  const heroStats = [
    [stats.models, 'Models'],
    [stats.variants, 'Variants'],
    [`${lakhs(stats.priceFrom)} – ${lakhs(stats.priceTo)}`, 'Ex-showroom range'],
  ];
  el('hero-stats').innerHTML = heroStats
    .map(([value, key]) => `<div><span class="v">${esc(value)}</span><span class="k label">${esc(key)}</span></div>`)
    .join('');

  el('footer-stats').innerHTML = [
    [num(stats.kbPages), 'KB pages'],
    [num(stats.kbWords), 'Words indexed'],
    [data.endpoints.length, 'Endpoints'],
  ]
    .map(([value, key]) => `<div><span class="v">${esc(value)}</span><span class="k label">${esc(key)}</span></div>`)
    .join('');
}

/* -------------------------------------------------------------------- boot -- */

(async function boot() {
  trackSections();

  /* The line-up has to land first — the compare picker, the on-road estimator
     and both forms are built from it. */
  await section(el('lineup-grid'), loadLineup);

  if (MODELS.length) {
    VARIANTS = (await get('/variants')).variants;
    initForms();
    await Promise.all([
      section(el('compare-out'), initCompare),
      section(el('orp-out'), loadFinance),
    ]);
  }

  el('footer-models').innerHTML = MODELS.map(
    (model) =>
      `<li><a href="#lineup" data-model="${esc(model.id)}">${esc(model.name)}</a></li>`,
  ).join('');

  await Promise.all([
    section(el('services-grid'), loadOwnership),
    section(el('cpo-list'), loadPreOwned),
    section(el('brand-timeline'), loadBrand),
    section(el('hero-stats'), loadMeta),
  ]);

  reveal();

  el('footer-disclaimer').textContent =
    'International car or model shown for representation purposes only. Features, ' +
    'accessories, colour and equipment may vary depending on variant. Prices are ' +
    'ex-showroom as published on the source pages.';
})();
