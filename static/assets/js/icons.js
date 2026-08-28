/* Drawn icon set and body-type line drawings.
 *
 * The knowledge base is text — it carries no photography — so the page draws
 * what it needs. Two families:
 *
 *   icon(name)     24px grid, round caps and joins, no fills, stroke from
 *                  `currentColor`. Stroke weight steps up as the icon shrinks
 *                  so hairlines do not disappear.
 *
 *   bodyFigure()   A side elevation per body type, drawn to each model's real
 *                  proportions rather than a generic car outline: the sedan
 *                  from the Virtus's 4561/2651 mm length and wheelbase, the
 *                  SUV taller with shorter overhangs, the hatchback cut short
 *                  behind the rear axle. Line-work, not a rendering — nothing
 *                  here pretends to be a photograph of the car. */

const PATHS = {
  'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
  'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  'arrow-right': '<path d="M4.5 12h14m-6-6 6 6-6 6"/>',
  'arrow-out':
    '<path d="M14 5h5v5"/><path d="M19 5 10.5 13.5"/>' +
    '<path d="M18 14.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V7.5A1.5 1.5 0 0 1 6 6h3.5"/>',
  search: '<path d="M10.8 4.5a6.3 6.3 0 1 0 0 12.6 6.3 6.3 0 0 0 0-12.6"/><path d="m15.4 15.4 4.1 4.1"/>',
  calendar:
    '<path d="M4.5 6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6.5Z"/>' +
    '<path d="M4.5 9.5h15"/><path d="M8.5 3.5v3M15.5 3.5v3"/>',
  download: '<path d="M12 4v10"/><path d="m7.5 10 4.5 4 4.5-4"/><path d="M4.5 18.5h15"/>',
  phone:
    '<path d="M8.4 4.5H6a1.5 1.5 0 0 0-1.5 1.6c.4 6.6 5.8 12 12.4 12.4a1.5 1.5 0 0 0 1.6-1.5v-2.4l-3.6-1.2-1.6 1.6a11.4 11.4 0 0 1-4.7-4.7l1.6-1.6Z"/>',
  pin:
    '<path d="M12 20.5s6.5-5 6.5-9.6A6.5 6.5 0 0 0 5.5 10.9c0 4.6 6.5 9.6 6.5 9.6Z"/>' +
    '<path d="M9.7 10.8a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0"/>',

  /* Ownership services — one per entry in /api/services. */
  shield: '<path d="M12 3.8 5 6.4v5c0 4 2.9 7.6 7 8.8 4.1-1.2 7-4.8 7-8.8v-5l-7-2.6Z"/>',
  wrench:
    '<path d="M15.6 4.6a4.8 4.8 0 0 0-5.9 6.1L4.4 16a1.9 1.9 0 0 0 2.7 2.7l5.3-5.3a4.8 4.8 0 0 0 6.1-5.9l-2.8 2.8-2.5-.7-.7-2.5 2.8-2.8Z"/>',
  certificate:
    '<path d="M5.5 4.5h13A1.5 1.5 0 0 1 20 6v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 14V6a1.5 1.5 0 0 1 1.5-1.5Z"/>' +
    '<path d="M7.5 8.2h9M7.5 11.4h5"/>' +
    '<path d="M14.6 15.5v4.9l2.2-1.3 2.2 1.3v-4.9"/>',
  umbrella:
    '<path d="M3.8 12a8.2 8.2 0 0 1 16.4 0Z"/><path d="M12 12v6.2a2 2 0 1 1-4 0"/>',
  assistance:
    '<path d="M4.5 12a7.5 7.5 0 0 1 15 0"/><path d="M4.5 12v3.5A1.5 1.5 0 0 0 6 17h1V12H4.5Z"/>' +
    '<path d="M19.5 12v3.5A1.5 1.5 0 0 1 18 17h-1V12h2.5Z"/><path d="M17 17v.8a2.2 2.2 0 0 1-2.2 2.2H12"/>',
  /* A brake disc: rotor, hub and four vent slots. */
  parts:
    '<path d="M12 4.3a7.7 7.7 0 1 0 0 15.4 7.7 7.7 0 0 0 0-15.4"/>' +
    '<path d="M12 9.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4"/>' +
    '<path d="M12 6.4v1.4M12 16.2v1.4M17.6 12h-1.4M7.8 12H6.4"/>',
  door:
    '<path d="M6.5 4.5h9A1.5 1.5 0 0 1 17 6v13.5H6.5A1.5 1.5 0 0 1 5 18V6a1.5 1.5 0 0 1 1.5-1.5Z"/>' +
    '<path d="M8.5 8.5h6"/><path d="M13.5 12.5v2"/>',
  sparkle:
    '<path d="m12 3.6 2 5.9 5.9 2-5.9 2-2 5.9-2-5.9-5.9-2 5.9-2 2-5.9Z"/>',
  book:
    '<path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h5v15.5H6a1.5 1.5 0 0 1-1.5-1.5v-12.5Z"/>' +
    '<path d="M19.5 5.5A1.5 1.5 0 0 0 18 4h-5v15.5h5a1.5 1.5 0 0 0 1.5-1.5v-12.5Z"/>',
  gauge:
    '<path d="M4.6 17a8.6 8.6 0 1 1 14.8 0"/><path d="m12 13.5 3.6-3.9"/>' +
    '<path d="M11.4 13.5a.6.6 0 1 0 1.2 0 .6.6 0 1 0-1.2 0"/>',
};

/** Optical sizing: smaller icons need a heavier stroke to hold up. */
function weightFor(size) {
  if (size <= 14) return 1.9;
  if (size <= 18) return 1.7;
  if (size <= 26) return 1.55;
  return 1.4;
}

/**
 * Render an icon as an SVG string for template interpolation.
 * `title` gives it an accessible name; without one it is decorative.
 */
export function icon(name, { size = 16, stroke, title, style = '' } = {}) {
  const body = PATHS[name];
  if (!body) {
    console.warn(`icon: no such icon "${name}"`);
    return '';
  }
  const label = title
    ? ` role="img" aria-label="${title.replace(/"/g, '&quot;')}"`
    : ' aria-hidden="true"';
  return (
    `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="${stroke ?? weightFor(size)}" ` +
    `stroke-linecap="round" stroke-linejoin="round"${style ? ` style="${style}"` : ''}${label}>` +
    `${body}</svg>`
  );
}

/* ------------------------------------------------------- body elevations -- */

/* Shared drawing frame: 124 × 48, ground line at y = 44, one scale for all
 * three (0.024 units per mm) so the profiles are honestly comparable when they
 * sit in a column together.
 *
 * Lengths, heights and wheelbases are the real published figures — the Virtus
 * at 4561 × 1507 on a 2651 mm wheelbase, the Tiguan at 4539 × 1660, the Golf
 * at 4289 × 1465. Real cars differ far less in height than in silhouette, so
 * the body types are told apart by shape: the sedan by its boot deck, the SUV
 * by a long flat roof on rails and a near-vertical tailgate, the hatchback by
 * a tailgate that runs unbroken from roof to bumper.
 *
 * Each wheel arch is cut a little wider than its wheel and its ends land on
 * the sill line, so the arc runs past a half-circle — hence large-arc-flag 1. */

const FIGURES = {
  Sedan: {
    /* Three-box: a bonnet, a cabin and a boot deck long enough to read as one. */
    body:
      'M7 39.7V29.5c0-3.8 2-5.6 6-6.2L27 22 46 21.3 61 8.3 84 7.8 99 20.4 113 21' +
      'c2.4.4 3.5 1.7 3.5 3.9V39.7H99.93a9 9 0 1 0-16.65 0H36.33a9 9 0 1 0-16.65 0Z',
    glass: 'M62.8 10 82.5 9.6 96.5 19.4H49.8Z',
    pillar: 'M73 9.8v9.7',
    sill: 'M50 27.5h46',
    wheels: [[28, 36.3, 7.7], [91.6, 36.3, 7.7]],
  },
  SUV: {
    /* Long flat roof on rails, upright glass, a tailgate that falls almost
       straight, and the biggest wheels of the three. */
    body:
      'M7.5 39.2V29c0-3.8 1.9-5.6 5.9-6.3L28 21.2 40 20.2 52 4.6 92 4.2 109 20' +
      'c3.6.6 7.4 1.8 7.4 5.2V39.2H102.67a10.1 10.1 0 1 0-18.54 0H38.37a10.1 10.1 0 1 0-18.54 0Z',
    glass: 'M54.5 6.4 89.5 6 104 17.8H43.5Z',
    pillar: 'M66 6.2v11.6M84 6v11.8',
    sill: 'M46 27.5h48',
    roofRail: 'M56 2.9h32M57.4 2.9v1.4M86.6 2.9v1.4',
    wheels: [[29.1, 35.2, 8.8], [93.4, 35.2, 8.8]],
  },
  Hatchback: {
    /* Two-box: no boot at all — the tailgate runs unbroken from the roof to
       the rear bumper, over a short rear overhang. */
    body:
      'M10.5 40.6V30.5c0-3.8 2-5.6 6-6.2L30 23 48 22 64 9.5 92 8.8 108 22' +
      'c3.2.8 4.5 2.2 4.5 5V40.6H102.06a9.6 9.6 0 1 0-16.52 0H39.16a9.6 9.6 0 1 0-16.52 0Z',
    glass: 'M66 11.2 90 10.7 100 20.8H53.5Z',
    pillar: 'M78 11v9.9',
    sill: 'M54 29h42',
    wheels: [[30.9, 35.7, 8.3], [93.8, 35.7, 8.3]],
  },
};

/**
 * A side elevation for one body type, scaled to `width`.
 * Decorative by default — the card's heading already names the model.
 */
export function bodyFigure(bodyType, { width = 210, title } = {}) {
  const figure = FIGURES[bodyType] || FIGURES.Sedan;
  const height = Math.round((width * 48) / 124);
  const label = title
    ? ` role="img" aria-label="${title.replace(/"/g, '&quot;')}"`
    : ' aria-hidden="true"';

  /* Same optical rule as the icons: the smaller it is drawn, the heavier the
     line has to be to survive. */
  const weight = width >= 260 ? 1.4 : width >= 170 ? 1.55 : 1.9;

  const wheels = figure.wheels
    .map(
      ([cx, cy, r]) =>
        `<circle cx="${cx}" cy="${cy}" r="${r}"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${(r * 0.34).toFixed(1)}"/>`,
    )
    .join('');

  const details = [figure.glass, figure.pillar, figure.sill, figure.roofRail]
    .filter(Boolean)
    .map((d) => `<path d="${d}"/>`)
    .join('');

  return (
    `<svg class="fig" width="${width}" height="${height}" viewBox="0 0 124 48" fill="none" ` +
    `stroke="currentColor" stroke-width="${weight}" stroke-linecap="round" ` +
    `stroke-linejoin="round"${label}>` +
    `<path d="${figure.body}"/>` +
    `<g stroke-width="${(weight * 0.82).toFixed(2)}">${details}</g>` +
    `<g stroke-width="${(weight * 0.9).toFixed(2)}">${wheels}</g>` +
    `<path d="M2 45.4h120" stroke-width="${(weight * 0.62).toFixed(2)}" opacity=".3"/>` +
    `</svg>`
  );
}

export const iconNames = Object.keys(PATHS);
