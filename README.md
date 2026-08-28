# Volkswagen India — knowledge-base API and site

A read API over a scraped knowledge base of volkswagen.co.in, and a front end
built entirely on it. Every price, figure and paragraph on the site comes back
from an endpoint; none of it is hard-coded in the page.

```bash
python api_server.py
```

Then <http://localhost:8000> for the site, `/dashboard.html` for the API
explorer, `/docs` for Swagger. Set `PORT` to run somewhere else.

Requires `fastapi`, `uvicorn` and `pydantic` — the same three the original
server used.

## Layout

```
kb/                  48 markdown pages scraped from volkswagen.co.in
kb_index.py          structured read layer over kb/ — parsing, search, money maths
api_server.py        FastAPI routing, validation and response shaping
static/
  index.html         the site
  dashboard.html     API explorer
  assets/css/        one stylesheet, token-driven
  assets/js/
    api.js           fetch wrapper + INR formatting
    icons.js         drawn icon set and body-type side elevations
    site.js          one loader per section
    dashboard.js     explorer, driven off /api/meta
```

## Endpoints

The four the site was first built on keep their original shape, so anything
already calling them still works.

### Catalogue

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/cars` | Models — id, name, detail URL *(original shape)* |
| GET | `/api/cars/{model_id}` | Full markdown for one model *(original shape)* |
| GET | `/api/lineup` | Line-up with price, powertrain, highlights, facets. `?body=SUV&max_price=&sort=price_asc\|price_desc\|name` |
| GET | `/api/models/{model_id}` | One model, structured — specs, variants, highlights, FAQs |
| GET | `/api/models/{model_id}/faqs` | FAQ pairs parsed from the model page's accordion |
| GET | `/api/variants` | Every variant across every model, flattened |
| GET | `/api/compare?a=&b=` | Two models on the fields the KB states for both |

### Ownership

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/services` | The eight owner services |
| GET | `/api/services/4ever-care` | 4EVER Care — pillars and the first-year schedule |
| GET | `/api/used-cars` | Certified Pre-Owned *(original shape, plus structure)* |
| GET | `/api/brand` | Volkswagen Group in India — facts and timeline |

### Finance

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/finance` | Leasing, insurance, warranty, and the priced states |
| GET | `/api/finance/emi?principal=&rate=&years=` | Reducing-balance EMI |
| GET | `/api/finance/on-road?model=&state=&variant=` | Indicative on-road build-up |

### Leads

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/api/appointments` | Test-drive booking *(original shape)* |
| POST | `/api/leads` | Callback request |

Both are demo endpoints. They validate the payload and return a reference;
nothing is persisted.

### Knowledge base

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/kb` | Every page, header-parsed |
| GET | `/api/kb/search?q=&limit=` | Full-text search across `kb/` (API only — no longer surfaced on the site) |
| GET | `/api/kb/page/{page_id}` | One page, header and body |
| GET | `/api/meta` | Counts and the endpoint index the explorer renders |
| GET | `/api/health` | Liveness |

## Where the data comes from

`kb/` is prose, not rows, so `kb_index.py` does the work of turning it into
something an API can serve:

- **Prices** are read live — the `From ₹10,99,900.00` cards on
  `kb/models/index.md`, and the `Ex-showroom Price: ₹ 47 11 013*` /
  `Price starting ₹ 10.99 Lakh*` lines on each model page.
- **Powertrain, body and equipment** are stated in running prose
  ("It produces an impressive 204 PS (150 kW) of power"), so they are
  transcribed into `MODEL_FACTS` with the source file named on every entry.
  Each model's API response carries `source` and `sourceUrl`.
- **FAQs** are parsed below each page's *Frequently asked questions* heading,
  with the scrape's zero-width joiners and dead "Click here" anchors stripped.
- **Search** collapses byte-identical pages: the scrape saved several under two
  or three paths (`kb/models/tiguan.md` and `kb/en/models/tiguan-r-line.md` are
  one page), so duplicates come back under `alsoAt` rather than as extra hits.

`/api/lineup` returns five models because `kb/models/` holds five pages. The
facet counts on it say six, because the source line-up page counts Virtus Sport
and Virtus Chrome as separate cards — both numbers are reported as the KB has
them rather than reconciled.

Two numbers on `/api/finance/on-road` are **not** from the knowledge base and
are labelled as estimates in the response and on the page: the state road-tax
bands and the first-year insurance rate. The KB does not publish either.

## Design

Cinematic dark showroom. A near-black ground (`#0a0b0f`) with one key light
falling from the top right; surfaces are separated by light — a raised fill, an
inner top highlight and a deep shadow — rather than by drawn borders. Tokens
live at the top of `styles.css`.

Three rules keep it reading premium rather than neon:

- **The light is cool white, not cyan.** Real showroom lighting is white;
  `--keylight` carries the pools and `--filllight` (the accent at 9%) only
  tints the edge of the falloff.
- **Nothing glows.** No text-shadow on headings or figures, no glow on the
  primary button, sliders, chips or the floor line. Dynamic blue (`#00b0f0`)
  is a mark and a state — an eyebrow rule, a link, a selected item — never a
  wash. The primary CTA is near-white and flat.
- **Monospace means code.** Endpoint paths, file paths and the API explorer
  only. Everything else that was mono — labels, table heads, field labels,
  figures — is now tracked caps in the sans with tabular numerals, so the page
  stops reading as a developer tool.

The signature move is the cars: each stands in its own pool of light, its
silhouette shadow falling into the falloff, over a hairline floor that fades
out at both ends.

The mark is the Volkswagen roundel, supplied and requested by the project
owner. It lives in the markup rather than being injected by JS, so it paints
with the page: `static/assets/img/vw-logo.png` (192px, also the
apple-touch-icon) and `favicon.png` (64px), both downscaled from a 2400px
alpha-cutout source, 42 KB and 9 KB.

Note the trade this makes. Everything else here is deliberately the site's own
— which is why earlier marks avoided the roundel — and the footer disclaimer is
what separates this demo from an official Volkswagen page. Using the real
trademark works against that disclaimer. Fine for an internal demo; worth
reconsidering before anything public.

The hero is a **showcase slider** — one car large under a key light, the rest
of the line-up as a strip beneath it. Four ways to drive it: the arrows (which
appear on hover), a touch swipe, the arrow keys when focus is inside, or a
direct pick from the strip. It advances on its own every 6.5s, holds while
hovered or focused, and stops for good the moment the reader takes over.

Swipe is detected on `pointermove`, not `pointerup`: once a touch starts to
look like a scroll the browser claims the gesture and fires `pointercancel`, so
a handler waiting for `pointerup` never runs. It is scoped to touch and pen —
a mouse drag over a photograph starts the browser's own image drag.

Blocks lift into place as they scroll in (`[data-reveal]` /
`[data-reveal-children]`, staggered by `--i`); one orchestrated entrance rather
than scattered motion, fired once per element. Both the reveals and the
autoplay are off under `prefers-reduced-motion`.

### Layout

Three devices stop the page reading as ten identical stacks:

- **`.grid-cards`** sizes cards as a share of a six-track grid rather than a
  fixed column, with rules for what is left over — five models used to strand
  an empty cell in the second row, and the body-type filters change the count
  on every click. Verified full at 390/800/1000/1200/1440 for every filter.
- **`.section-head-split`** puts the intro beside the heading on its baseline
  instead of under it. Used on Compare and Finance only; more than that and it
  becomes the new monotony.
- **`.heritage`** runs the standfirst and facts in one column and the
  chronology in its own narrow measure beside them. A one-line timeline entry
  stretched across 1200px reads as a spreadsheet, not a history.
- **`.cpo`** makes the copy column a flex stack so its call to action sinks to
  the foot of the list beside it. The copy is about half the list's height, and
  as a plain block it left the lower-left corner empty.
- **`.hero-stats`** is a strip sized to its content with hairline separators,
  not three stretched thirds — measured, the old equal-thirds grid left 77% of
  the row as internal air. It also shows the ex-showroom **range** rather than
  just the floor: `stats.priceTo` is the top variant, so the two ends match the
  first and last prices in the selector strip above it.
- **`.book-stage`** puts the car being booked at the top of the test-drive
  form, following the model select. It squares the two forms — the callback
  card carries an extra field, so the test-drive card used to end ~150px short
  of it — and a car-booking form on this site ought to show a car.

The site no longer surfaces knowledge-base search — the endpoints behind it are
still live and still exercised from the API explorer.

**One rule is deliberately suspended.** Dense data — the compare table and the
on-road build-up — keeps explicit rules, a lifted head and body-weight ink,
because scanning columns in the dark needs edges that a light falloff cannot
give. Those blocks look different from the rest on purpose.

### Model renders

The markdown carries no images, but the source site publishes one studio render
per line-up card through Adobe Dynamic Media. Those six are saved under
`static/assets/img/` as **alpha cutouts** (`webp-alpha`, 1280w, 287 KB total),
so each car sits on the page background with no white slab behind it — which is
what makes the light-pool treatment work.

The CDN **signs its query strings**, so the URLs cannot be re-derived at another
size: these are the exact renditions the source line-up page requests, saved
once rather than hot-linked (it also refuses requests that do not come from a
browser). To refresh them, re-run the download against
<https://www.volkswagen.co.in/en/models.html> and match on each card's `alt`
text. `kb_index.IMAGE_CREDIT` carries the attribution the footer prints.

`icons.js` still draws the fallback: one icon family on a 24px grid, and a side
elevation per body type built to the real published dimensions (the Virtus at
4561 × 1507 on a 2651 mm wheelbase, the Tiguan at 4539 × 1660, the Golf at
4289 × 1465) at one shared scale. Those elevations are no longer the subject —
they hold the frame while a render decodes and stand in for any model without
one. They are body types, not portraits, which is why they never show alone
next to a car that has a photograph.

This is a demonstration front end. It is not the official Volkswagen India
website and is not affiliated with Volkswagen AG.
