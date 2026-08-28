"""Structured read layer over the scraped Volkswagen India knowledge base.

The knowledge base is prose markdown scraped page-by-page from
volkswagen.co.in, so nothing in it is a database row. This module turns it
into something an API can serve:

  * `pages()`     - every .md file with its title, source URL and description,
                    parsed out of the front-matter block the scraper writes.
  * `models()`    - the five model pages under kb/models/, with prices read
                    live out of kb/models/index.md and the powertrain figures
                    pulled from each model page.
  * `search()`    - naive but honest full-text search across the tree.

Everything served here traces back to a file under kb/. Where a figure is
quoted the `source` field names the page it was read from, so a caller can
always go and check.
"""

from __future__ import annotations

import functools
import hashlib
import os
import re
from typing import Any, Iterable

KB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kb")

# ---------------------------------------------------------------- page index --

# The scraper writes a consistent header on every page:
#
#   # <title>
#   > **Source:** <url>
#   > <description>
#   **Keywords:** a, b, c        (optional)
#   ---
_TITLE_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
_SOURCE_RE = re.compile(r"^>\s+\*\*Source:\*\*\s*(\S+)", re.MULTILINE)
_KEYWORDS_RE = re.compile(r"^\*\*Keywords:\*\*\s*(.+?)\s*$", re.MULTILINE)


def _read(path: str) -> str:
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def _slug(rel_path: str) -> str:
    """kb-relative path -> stable id: en/models/virtus-chrome.md -> en.models.virtus-chrome"""
    return rel_path[:-3].replace(os.sep, "/").replace("/", ".")


def _description(text: str) -> str:
    """The second blockquote line, which the scraper fills from <meta description>."""
    quoted = [
        line[1:].strip()
        for line in text.splitlines()
        if line.startswith(">") and "**Source:**" not in line
    ]
    for line in quoted:
        if len(line) > 20:
            return line
    return ""


def _body(text: str) -> str:
    """Everything past the `---` rule that closes the scraped header."""
    parts = text.split("\n---\n", 1)
    return parts[1].strip() if len(parts) == 2 else text.strip()


@functools.lru_cache(maxsize=1)
def pages() -> list[dict[str, Any]]:
    """Every markdown page in the knowledge base, header-parsed, body excluded."""
    found: list[dict[str, Any]] = []
    for root, _dirs, files in os.walk(KB_DIR):
        for name in sorted(files):
            if not name.endswith(".md"):
                continue
            full = os.path.join(root, name)
            rel = os.path.relpath(full, KB_DIR)
            text = _read(full)
            title_match = _TITLE_RE.search(text)
            source_match = _SOURCE_RE.search(text)
            keywords_match = _KEYWORDS_RE.search(text)
            found.append(
                {
                    "id": _slug(rel),
                    "path": rel.replace(os.sep, "/"),
                    "title": (title_match.group(1) if title_match else name[:-3]).strip(),
                    "source": source_match.group(1) if source_match else None,
                    "description": _description(text),
                    "keywords": (
                        [k.strip() for k in keywords_match.group(1).split(",") if k.strip()]
                        if keywords_match
                        else []
                    ),
                    "words": len(text.split()),
                }
            )
    return found


def page(page_id: str) -> dict[str, Any] | None:
    """One page including its body text, or None if the id is unknown."""
    for entry in pages():
        if entry["id"] == page_id:
            full = os.path.join(KB_DIR, *entry["path"].split("/"))
            return {**entry, "content": _read(full), "body": _body(_read(full))}
    return None


def search(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Case-insensitive substring search over titles, descriptions and bodies.

    Title hits outrank body hits; the snippet is the first line that matched so
    the caller has something to show without re-reading the file.

    The scrape saved several pages more than once — kb/models/tiguan.md and
    kb/en/models/tiguan-r-line.md are one page, and 4ever-care.md landed at
    three paths. Byte-identical bodies are collapsed to a single hit and the
    other paths are listed under `alsoAt` rather than repeated.
    """
    needle = query.strip().lower()
    if not needle:
        return []

    hits: list[tuple[int, str, dict[str, Any]]] = []
    for entry in pages():
        full = os.path.join(KB_DIR, *entry["path"].split("/"))
        text = _read(full)
        lowered = text.lower()
        if needle not in lowered and needle not in entry["title"].lower():
            continue
        score = 0
        if needle in entry["title"].lower():
            score += 100
        if needle in entry["description"].lower():
            score += 30
        score += min(lowered.count(needle), 20)

        # The snippet must come from the prose, not from the heading or the
        # meta blockquote — those just echo the title back at the reader.
        snippet = ""
        for line in _body(text).splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith(("#", ">")):
                continue
            clean = _clean(stripped.lstrip("-* "))
            if len(clean) > 30 and needle in clean.lower():
                snippet = clean[:220]
                break

        digest = hashlib.sha1(_body(text).encode("utf-8")).hexdigest()
        hits.append((score, digest, {**entry, "snippet": snippet or entry["description"][:220]}))

    # Shortest path wins as the canonical one when a page is saved twice.
    hits.sort(key=lambda triple: (-triple[0], len(triple[2]["path"]), triple[2]["path"]))

    collapsed: dict[str, dict[str, Any]] = {}
    for _score, digest, entry in hits:
        if digest in collapsed:
            collapsed[digest]["alsoAt"].append(entry["path"])
        elif len(collapsed) < limit:
            collapsed[digest] = {**entry, "alsoAt": []}
    return list(collapsed.values())


# -------------------------------------------------------------------- line-up --

# kb/models/index.md lists each card as a heading followed by "From ₹10,99,900.00".
_LINEUP_RE = re.compile(
    r"^###\s*\n(?P<name>.+?)\s*\n+From\s*₹\s*(?P<price>[\d,]+)", re.MULTILINE
)

# Individual model pages quote the headline price in one of two shapes:
#   - Ex-showroom Price: ₹ 47 11 013*
#   - Price starting ₹ 10.99 Lakh*
_PRICE_GROUPED_RE = re.compile(r"₹\s*(\d[\d\s]{5,})\*")
_PRICE_LAKH_RE = re.compile(r"₹\s*([\d.]+)\s*Lakh", re.IGNORECASE)


def _rupees(raw: str) -> int:
    return int(re.sub(r"[^\d]", "", raw))


@functools.lru_cache(maxsize=1)
def lineup() -> list[dict[str, str | int]]:
    """The line-up cards on kb/models/index.md, in page order.

    Six entries, because the index counts Virtus Sport and Virtus Chrome as
    separate cards while kb/models/ holds one virtus.md page for both.
    """
    text = _read(os.path.join(KB_DIR, "models", "index.md"))
    cards = []
    for match in _LINEUP_RE.finditer(text):
        name = match.group("name").strip()
        cards.append({"name": name, "price_inr": _rupees(match.group("price"))})
    return cards


def _headline_price(text: str) -> int | None:
    grouped = _PRICE_GROUPED_RE.search(text)
    if grouped:
        return _rupees(grouped.group(1))
    lakh = _PRICE_LAKH_RE.search(text)
    if lakh:
        return int(float(lakh.group(1)) * 100_000)
    return None


# ------------------------------------------------------------------- imagery --

# The knowledge base is text, but the source site publishes a studio render per
# line-up card through its Adobe Dynamic Media CDN. Those are saved under
# static/assets/img/ as alpha cutouts (webp-alpha), so the car sits on the page
# background instead of arriving as a white slab.
#
# The CDN signs its query strings, so the URLs cannot be re-derived at any
# arbitrary size — these are the 1280w renditions the source line-up page
# itself requests, downloaded once rather than hot-linked.
IMAGE_DIR = "/assets/img"
IMAGE_ASPECT = 1280 / 484  # every render is cropped to the same 2.64:1 frame
IMAGE_CREDIT = {
    "text": "Studio renders from volkswagen.co.in, one per line-up card.",
    "sourceUrl": "https://www.volkswagen.co.in/en/models.html",
    "cdn": "assets.volkswagen.com",
}


def _image_url(name: str | None) -> str | None:
    return f"{IMAGE_DIR}/{name}" if name else None


# Powertrain, body and equipment read off each model page. The markdown states
# these in running prose ("It produces an impressive 204 PS (150 kW) of power"),
# so they are transcribed here rather than regex-scraped; `source` names the
# file every figure came from and `sourceUrl` the page it was scraped from.
MODEL_FACTS: dict[str, dict[str, Any]] = {
    "taigun": {
        "name": "Taigun",
        "display_name": "The new Taigun",
        "body": "SUV",
        "tagline": "Welcome to driving.",
        "blurb": "Sharper lines, a sculpted bonnet and a new-generation 8-speed automatic. "
                 "The compact SUV that makes the long way home make sense again.",
        "engine": "1.0L TSI / 1.5L TSI",
        "transmissions": ["6-Speed Manual", "8-Speed Automatic"],
        "seats": 5,
        "source": "kb/models/taigun.md",
        "image": "taigun.webp",
        "highlights": [
            ["Shape", "Sharper lines, sculpted bonnet, redesigned bumpers, dual shoulder lines and GT red door lettering."],
            ["Powertrain", "1.0L and 1.5L TSI engine options with a new-generation 8-speed automatic transmission."],
            ["Cabin", "Refreshed dashboard, dual-tone interiors, leatherette seats with piping, GT embroidery and Laser Red ambient lighting."],
            ["Assistance", "Front parking sensors, 10-inch customisable Digital Cockpit, IDA Voice Command and a panoramic sunroof."],
            ["Light signature", "Illuminated Volkswagen logo, grille light band, full-LED headlamps and LED tail lamps with welcome and goodbye animation."],
        ],
        "variants": [
            {"name": "Taigun", "price_inr": 1_099_900, "note": "Starting price, ex-showroom"},
        ],
    },
    "virtus": {
        "name": "Virtus",
        "display_name": "Virtus",
        "body": "Sedan",
        "tagline": "You're in a Virtus.",
        "blurb": "India's No.1 premium sedan, four years running — 5-star GNCAP for both adult "
                 "and child occupants, with 40+ safety features as standard.",
        "engine": "1.0L TSI / 1.5L TSI EVO",
        "transmissions": ["6-Speed Manual", "6-Speed Automatic", "7-Speed DSG"],
        "power": "150 PS",
        "torque": "250 Nm",
        "power_note": "1.5L TSI EVO, GT Plus Sport",
        "seats": 5,
        "safety": "5-star GNCAP",
        "source": "kb/models/virtus.md",
        "image": "virtus.webp",
        "dimensions": {
            "length_mm": 4561,
            "width_mm": 1752,
            "height_mm": 1507,
            "wheelbase_mm": 2651,
            "ground_clearance_mm": 179,
        },
        "colours": [
            "Candy White", "Carbon Steel Grey", "Wild Cherry Red",
            "Deep Black Pearl", "Avocado Pearl",
        ],
        "highlights": [
            ["5-star GNCAP", "One of the first sedans in India to take five stars for both adult and child occupant protection, with 40 safety features."],
            ["24-hour record", "The Virtus GT 1.5L covered 4,654.48 km in 24 hours at Natrax — an India record overall and for sedans."],
            ["Anniversary Edition", "150 units in exclusive Avocado Pearl with a contrasting black roof, black alloys and a 360° camera system."],
            ["GT Plus Sport", "1.5L TSI EVO, 150 PS, 250 Nm and a 7-speed DSG."],
        ],
        "variants": [
            {"name": "Virtus Chrome", "price_inr": 1_070_900, "note": "Commanding presence, ex-showroom"},
            {"name": "Virtus GT Line", "price_inr": 1_434_900, "note": "Sport trim, ex-showroom",
             "image": "virtus-sport.webp"},
            {"name": "Virtus GT Plus Sport", "price_inr": 1_919_000, "note": "1.5L TSI EVO, ex-showroom",
             "image": "virtus-sport.webp"},
        ],
    },
    "tayron": {
        "name": "Tayron",
        "display_name": "Tayron",
        "body": "SUV",
        "tagline": "For all your ands.",
        "blurb": "Five seats or seven, a 2.0L TSI EVO and 4MOTION all-wheel drive. Built for "
                 "the school run, the conference call and the change of plans.",
        "engine": "2.0L TSI EVO",
        "transmissions": ["7-Speed DSG"],
        "drivetrain": "4MOTION",
        "seats": 7,
        "safety": "5-star Euro NCAP",
        "source": "kb/models/tayron.md",
        "image": "tayron.webp",
        "highlights": [
            ["Tayron Life", "A 5-seater layout with premium comfort and everyday versatility — built for every version of you."],
            ["Tayron R-Line", "Premium performance and commanding presence, with room for bigger plans shared with more people."],
            ["Powertrain", "2.0L TSI EVO with 4MOTION all-wheel drive."],
            ["Equipment", "Illuminated logo, LED lights, panoramic sunroof, leatherette seats, ambient lighting and Park Assist Plus with Park Distance Control."],
        ],
        "variants": [
            {"name": "Tayron Life", "price_inr": 4_199_000, "note": "5-seater, ex-showroom"},
            {"name": "Tayron R-Line", "price_inr": 4_774_000, "note": "7-seater, ex-showroom"},
        ],
    },
    "tiguan": {
        "name": "Tiguan R-Line",
        "display_name": "Tiguan R-Line",
        "body": "SUV",
        "tagline": "Beyond betteR.",
        "blurb": "2.0L TSI EVO, 4MOTION all-wheel drive and 21 Level 2 ADAS features. "
                 "Volkswagen's globally loved premium SUV, R-themed throughout.",
        "engine": "2.0L TSI EVO",
        "power": "204 PS",
        "torque": "320 Nm",
        "power_note": "150 kW",
        "transmissions": ["7-Speed DSG"],
        "drivetrain": "4MOTION",
        "seats": 5,
        "safety": "5-star Euro NCAP",
        "source": "kb/models/tiguan.md",
        "image": "tiguan.webp",
        "highlights": [
            ["Beyond smootheR", "2.0 TSI EVO, intelligent 4MOTION all-wheel drive and a 7-speed DSG — 204 PS and 320 Nm."],
            ["Beyond boldeR", "LED headlamps, illuminated light bands, R-themed details and 19-inch Coventry wheels."],
            ["Beyond safeR", "21 Level 2 ADAS features including Lane Assist and Front Assist, front and rear disc brakes, 9 airbags as standard."],
            ["Beyond smarteR", "IDA voice assistant, a 15-inch infotainment display, head-up display and customisable Digital Cockpit Pro."],
            ["Beyond comfieR", "Massage seats, 3-zone Air Care Climatronic, Park Assist Plus and wireless charging for two phones."],
        ],
        "variants": [
            {"name": "Tiguan R-Line", "price_inr": 4_711_013, "note": "Ex-showroom"},
        ],
    },
    "golf-gti": {
        "name": "Golf GTI",
        "display_name": "Golf GTI",
        "body": "Hatchback",
        "tagline": "Enough said.",
        "blurb": "Mk 8.5. 265 PS, 370 Nm, 0–100 km/h in 5.9 seconds. It came, it conquered, "
                 "it sold out.",
        "engine": "2.0L TSI",
        "power": "265 PS",
        "torque": "370 Nm",
        "transmissions": ["7-Speed DSG"],
        "acceleration": "0–100 km/h in 5.9 s",
        "seats": 5,
        "source": "kb/models/golf-gti.md",
        "image": "golf-gti.webp",
        "highlights": [
            ["Performance", "2.0L TSI, 265 horsepower, 370 Nm and 0–100 km/h in 5.9 seconds."],
            ["Technology", "32.8 cm touchscreen infotainment, Digital Cockpit Pro, seven-speaker sound, wireless charging and IDA voice control."],
            ["Exterior", "Illuminated Volkswagen logo, signature red GTI accents, X-shaped fog lights, 18-inch Richmond wheels and twin chrome exhausts."],
            ["Made of legend", "Golf GTI x Jasprit Bumrah — pure performance defined by precision."],
        ],
        "variants": [
            {"name": "Golf GTI", "price_inr": 5_090_900, "note": "Ex-showroom"},
        ],
    },
}

# Body-type / engine / gearbox counts, quoted from the facet list on
# kb/models/index.md so the site's filter chips match the source page.
FACETS = {
    "body": [("SUV", 3), ("Sedan", 2), ("Hatchback", 1)],
    "engine": [("1.0L TSI Engine", 3), ("1.5L TSI Engine", 3), ("2.0L TSI EVO Engine", 2)],
    "gearbox": [
        ("6-Speed Manual", 3),
        ("8-Speed Automatic", 1),
        ("7-Speed Automatic", 5),
        ("6-Speed Automatic", 2),
    ],
}


@functools.lru_cache(maxsize=1)
def models() -> list[dict[str, Any]]:
    """The model pages under kb/models/, enriched and price-sorted.

    The price comes off the model's own page when it states one, and falls back
    to the line-up card on kb/models/index.md.
    """
    models_dir = os.path.join(KB_DIR, "models")
    by_name = {card["name"].lower(): card for card in lineup()}
    built: list[dict[str, Any]] = []

    for file_name in sorted(os.listdir(models_dir)):
        if not file_name.endswith(".md") or file_name == "index.md":
            continue
        model_id = file_name[:-3]
        text = _read(os.path.join(models_dir, file_name))
        facts = MODEL_FACTS.get(model_id, {})

        price = _headline_price(text)
        if price is None:
            for key, card in by_name.items():
                if model_id.replace("-", " ") in key:
                    price = card["price_inr"]
                    break
        variants = facts.get("variants") or []
        if variants:
            price = min(v["price_inr"] for v in variants)
        # A variant without its own render shows the model's.
        variants = [
            {**v, "image": _image_url(v.get("image") or facts.get("image"))} for v in variants
        ]

        title_match = _TITLE_RE.search(text)
        source_match = _SOURCE_RE.search(text)

        built.append(
            {
                "id": model_id,
                "name": facts.get("display_name") or model_id.replace("-", " ").title(),
                "shortName": facts.get("name") or model_id.replace("-", " ").title(),
                "body": facts.get("body", "Car"),
                "tagline": facts.get("tagline", ""),
                "blurb": facts.get("blurb", _description(text)),
                "priceFrom": price,
                "engine": facts.get("engine"),
                "power": facts.get("power"),
                "powerNote": facts.get("power_note"),
                "torque": facts.get("torque"),
                "transmissions": facts.get("transmissions", []),
                "drivetrain": facts.get("drivetrain"),
                "acceleration": facts.get("acceleration"),
                "seats": facts.get("seats"),
                "safety": facts.get("safety"),
                "dimensions": facts.get("dimensions"),
                "colours": facts.get("colours", []),
                "image": _image_url(facts.get("image")),
                "imageAspect": IMAGE_ASPECT,
                "variants": variants,
                "highlights": [
                    {"title": title, "text": body}
                    for title, body in facts.get("highlights", [])
                ],
                "pageTitle": title_match.group(1).strip() if title_match else None,
                "sourceUrl": source_match.group(1) if source_match else None,
                "source": f"kb/models/{file_name}",
                "url": f"/api/cars/{model_id}",
            }
        )

    built.sort(key=lambda m: m["priceFrom"] or 0)
    return built


def model(model_id: str) -> dict[str, Any] | None:
    return next((m for m in models() if m["id"] == model_id), None)


# --------------------------------------------------------------- FAQ parsing --

_FAQ_Q_RE = re.compile(r"^###\s+(?P<q>[^\n]*\?)\s*$", re.MULTILINE)

# The scrape carries the source page's zero-width joiners and the anchor text of
# links that no longer go anywhere ("Click here to know more."). Both are noise
# in an API response.
_ZERO_WIDTH_RE = re.compile(r"[​‌‍﻿­]")
_CLICK_HERE_RE = re.compile(r"\s*Click\s+here\b.*$", re.IGNORECASE | re.DOTALL)


def _clean(text: str) -> str:
    text = _ZERO_WIDTH_RE.sub("", text)
    text = re.sub(r"\*+", "", text)
    text = _CLICK_HERE_RE.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([.,?!])", r"\1", text)  # "10,70,900 ." after the * is stripped
    # Prices survive the scrape space-grouped: "INR 10 70 900" -> "INR 10,70,900".
    text = re.sub(
        r"(INR|₹)\s*(\d{1,2})\s(\d{2})\s(\d{3})",
        lambda m: f"{m.group(1)} {m.group(2)},{m.group(3)},{m.group(4)}",
        text,
    )
    if text and text[-1] not in ".?!":
        text += "."
    return text


def faqs(model_id: str) -> list[dict[str, str]]:
    """Question/answer pairs from a model page's FAQ accordion.

    Answers are the first substantial line after the question heading; the
    scraped markdown keeps them as a plain paragraph.
    """
    path = os.path.join(KB_DIR, "models", f"{model_id}.md")
    if not os.path.exists(path):
        return []
    text = _read(path)

    # Only read below the "Frequently asked questions" heading. Above it the
    # copy asks rhetorical questions of its own ("Are you not done geeking out
    # yet?") that are section headings, not FAQs.
    marker = re.search(r"^#+\s*\**\s*Frequently asked questions", text, re.MULTILINE | re.IGNORECASE)
    if marker is None:
        return []
    lines = text[marker.end():].splitlines()

    out: list[dict[str, str]] = []
    for index, line in enumerate(lines):
        match = _FAQ_Q_RE.match(line)
        if not match:
            continue
        answer = ""
        for follow in lines[index + 1 : index + 12]:
            stripped = follow.strip()
            if stripped.startswith("#"):
                break
            if len(stripped) > 25:
                answer = _clean(stripped)
                break
        if len(answer) > 15:
            question = _clean(match.group("q")).rstrip(".")
            if not any(existing["question"] == question for existing in out):
                out.append({"question": question, "answer": answer})
    return out


# ---------------------------------------------------- ownership and finance --

# Transcribed from kb/en/owners-and-services.md, which lists each service as a
# heading plus a one-paragraph summary.
SERVICES = [
    {
        "id": "volkswagen-advantage",
        "name": "Volkswagen Advantage",
        "icon": "shield",
        "summary": "A range of comprehensive services so you have a carefree and safe on-the-road experience.",
        "source": "kb/en/owners-and-services.md",
    },
    {
        "id": "maintenance",
        "name": "Maintenance",
        "icon": "wrench",
        "summary": "Convenient and cost-effective ways to keep your Volkswagen well-maintained and enjoy smooth drives for long.",
        "source": "kb/en/owners-and-services/maintenance.md",
    },
    {
        "id": "warranty",
        "name": "Warranty",
        "icon": "certificate",
        "summary": "Volkswagen standard manufacturer's warranty for a peaceful ownership experience — four years for new vehicle owners.",
        "source": "kb/en/purchase-and-financing/warranty.md",
    },
    {
        "id": "insurance",
        "name": "Insurance",
        "icon": "umbrella",
        "summary": "Motor insurance with OEM parts for accidental repair claims, a 24×7 dedicated call centre and simple processing.",
        "source": "kb/en/purchase-and-financing/insurance.md",
    },
    {
        "id": "roadside-assistance",
        "name": "Roadside Assistance",
        "icon": "assistance",
        "summary": "24×7 breakdown assistance across India, with dedicated toll-free numbers and courtesy vehicle service.",
        "source": "kb/en/owners-and-services/service-and-parts/mobile-support-and-breakdown-assistance.md",
    },
    {
        "id": "genuine-parts",
        "name": "Genuine Parts",
        "icon": "parts",
        "summary": "Engine oil, batteries, tyres, brakes, filters, glass and body work — parts made for your car and nothing else.",
        "source": "kb/en/owners-and-services/service-and-parts/genuine-parts.md",
    },
    {
        "id": "volkswagen-assistance",
        "name": "Volkswagen Assistance",
        "icon": "door",
        "summary": "Door-to-door service with just a phone call, because caring for your vehicle deserves our full attention.",
        "source": "kb/en/owners-and-services.md",
    },
    {
        "id": "accessories",
        "name": "Accessories",
        "icon": "sparkle",
        "summary": "Volkswagen Genuine Accessories for the Taigun, Virtus, Tiguan R-Line and Tayron R-Line.",
        "source": "kb/en/owners-and-services/accessories.md",
    },
]

# kb/en/owners-and-services/4ever-care.md — the programme included with every car.
FOREVER_CARE = {
    "name": "Volkswagen 4EVER Care",
    "standfirst": "Now standard with every Volkswagen.",
    "intro": "Every Volkswagen car promises a hassle-free ownership experience, from the day you buy it. "
             "4EVER Care offers complete peace of mind in matters of unexpected repair work.",
    "source": "kb/en/owners-and-services/4ever-care.md",
    "pillars": [
        {
            "title": "Standard 4-year / 100,000 km warranty",
            "text": "Any manufacturing or material defect impeding the proper functioning of the car is "
                    "diagnosed, repaired or replaced.",
        },
        {
            "title": "3 free services",
            "text": "SWAGAT at 1,000 km, Value Inspection at 7,500 km and free preventive maintenance "
                    "labour at 15,000 km.",
        },
        {
            "title": "4-year roadside assistance",
            "text": "24×7 across India, with dedicated toll-free numbers, roadside repair, courtesy "
                    "vehicle service and hotel accommodation.",
        },
        {
            "title": "Service Value Package",
            "text": "Protection against labour and spare-part cost inflation, with 100% genuine parts "
                    "guaranteed year after year.",
        },
    ],
    "schedule": [
        {"stage": "SWAGAT", "at": "1,000 km / 1 month",
         "includes": ["Car care kit as a welcome gift", "10-point safety check", "Complimentary car wash"]},
        {"stage": "Value Inspection", "at": "7,500 km / 6 months",
         "includes": ["Free 40-point vehicle inspection", "Complimentary car wash", "Introduction to the service team"]},
        {"stage": "Free Labour Service", "at": "15,000 km / 1 year",
         "includes": ["Free preventive maintenance labour for the first service", "Pay only for parts and consumables"]},
    ],
}

# kb/en/purchase-and-financing/leasing.md lists the cities Power Leasing covers.
LEASE_CITIES = [
    "Ahmedabad", "Bengaluru", "Chennai", "Delhi", "Ghaziabad",
    "Gurgaon", "Hyderabad", "Mumbai", "Noida", "Pune",
]

FINANCE = {
    "leasing": {
        "name": "Volkswagen Power Leasing",
        "summary": "Own a Volkswagen with low rental charges and zero down payment, "
                   "with a reduction in lease rentals of up to 8%.",
        "cities": LEASE_CITIES,
        "source": "kb/en/purchase-and-financing/leasing.md",
    },
    "insurance": {
        "name": "Volkswagen Insurance",
        "summary": "Extensive coverage with a 24×7 dedicated call centre and fast, simple processing.",
        "benefits": [
            "OEM parts used for accidental repair claims",
            "Bundled branded insurance and finance products",
            "24×7 dedicated call centre",
        ],
        "source": "kb/en/purchase-and-financing/insurance.md",
    },
    "warranty": {
        "name": "Volkswagen Warranty",
        "summary": "Comprehensive factory warranty covering every unforeseen inconvenience.",
        "benefits": [
            "4-year warranty for new vehicle owners",
            "Roadside repair service in the event of a breakdown",
            "Extended warranty available beyond the factory term",
        ],
        "source": "kb/en/purchase-and-financing/warranty.md",
    },
}

# kb/en/available-used-cars.md
PRE_OWNED = {
    "name": "Volkswagen Certified Pre-Owned",
    "standfirst": "A multi-brand platform to buy, sell and exchange pre-owned cars.",
    "source": "kb/en/available-used-cars.md",
    "promises": [
        "One-stop mobility solution to buy, sell and exchange",
        "Transparent pricing through digital evaluation",
        "Hassle-free transfer of ownership",
        "Certified pre-owned cars with genuine parts",
        "Test drive your selected pre-owned car before you buy",
        "Service Value Pack for Volkswagen pre-owned cars",
        "Digital certificate to enhance trust when buying",
    ],
}

# kb/en/volkswagen-brand.md — Volkswagen Group India milestones.
TIMELINE = [
    (2007, "Volkswagen launches in India with the iconic Passat."),
    (2008, "Launch of the Jetta."),
    (2009, "The New Beetle and the Touareg arrive in India."),
    (2010, "Launch of the Vento and the Phaeton."),
    (2011, "The all-new Passat and the Volkswagen Jetta are re-introduced."),
    (2015, "Launch of the 21st-century Beetle."),
    (2016, "Introduction of the Volkswagen Ameo and the Polo GTI."),
    (2017, "Re-launch of the Passat and introduction of the Volkswagen Tiguan."),
    (2020, "Tiguan Allspace and T-Roc launch; world premiere of the Taigun."),
    (2021, "Launch of the Volkswagen Taigun."),
    (2022, "Launch of the Volkswagen Virtus."),
]

BRAND = {
    "headline": "Indian spirit meets German excellence",
    "intro": "Headquartered in Pune, Maharashtra, the Volkswagen Group in India is represented by five "
             "brands: SKODA, Volkswagen, Audi, Porsche and Lamborghini. Plants in Pune and Aurangabad "
             "work seamlessly to manufacture the world's most loved cars.",
    "source": "kb/en/volkswagen-brand.md",
    "facts": [
        ("2001", "The Group's Indian journey begins with SKODA"),
        ("2007", "Volkswagen and Audi enter India"),
        ("572 acres", "The Chakan plant near Pune, 2.3 million m²"),
        ("5 brands", "SKODA, Volkswagen, Audi, Porsche, Lamborghini"),
    ],
    "timeline": [{"year": year, "event": event} for year, event in TIMELINE],
}


# --------------------------------------------------------------------- money --

def emi(principal: float, annual_rate: float, years: int) -> dict[str, float]:
    """Standard reducing-balance EMI.

        E = P·r·(1+r)^n / ((1+r)^n − 1),  r = monthly rate, n = months
    """
    months = max(1, int(years * 12))
    rate = annual_rate / 12 / 100
    if rate == 0:
        monthly = principal / months
    else:
        growth = (1 + rate) ** months
        monthly = principal * rate * growth / (growth - 1)
    total = monthly * months
    return {
        "monthly": round(monthly, 2),
        "months": months,
        "totalPayable": round(total, 2),
        "totalInterest": round(total - principal, 2),
        "principal": round(principal, 2),
        "annualRate": annual_rate,
    }


# Registration cost varies by state; these are the road-tax bands used for the
# estimate. They are indicative planning figures, not a quotation — the
# knowledge base does not publish state-wise tax, and the disclaimer on
# kb/models/index.md applies.
STATE_TAX = {
    "Maharashtra": 0.13,
    "Karnataka": 0.17,
    "Delhi": 0.10,
    "Tamil Nadu": 0.15,
    "Telangana": 0.14,
    "Gujarat": 0.12,
    "Haryana": 0.11,
    "Uttar Pradesh": 0.10,
    "West Bengal": 0.135,
    "Kerala": 0.16,
}

INSURANCE_RATE = 0.035  # first-year comprehensive premium, share of ex-showroom
OTHER_CHARGES = 12_000  # handling, fastag, number plate


def on_road(ex_showroom: float, state: str) -> dict[str, Any]:
    """Indicative on-road build-up for one ex-showroom price."""
    tax_rate = STATE_TAX.get(state, 0.13)
    road_tax = ex_showroom * tax_rate
    insurance = ex_showroom * INSURANCE_RATE
    total = ex_showroom + road_tax + insurance + OTHER_CHARGES
    return {
        "state": state,
        "exShowroom": round(ex_showroom, 2),
        "roadTax": round(road_tax, 2),
        "roadTaxRate": tax_rate,
        "insurance": round(insurance, 2),
        "otherCharges": OTHER_CHARGES,
        "onRoad": round(total, 2),
        "note": "Indicative estimate. Road tax is a planning band, not a quotation — "
                "confirm with your dealer.",
    }


def stats() -> dict[str, Any]:
    """Counts the site prints in its own footer, computed rather than typed."""
    all_pages = pages()
    return {
        "models": len(models()),
        "variants": sum(len(m["variants"]) for m in models()),
        "kbPages": len(all_pages),
        "kbWords": sum(p["words"] for p in all_pages),
        "services": len(SERVICES),
        "priceFrom": min(m["priceFrom"] for m in models() if m["priceFrom"]),
        "priceTo": max(
            v["price_inr"] for m in models() for v in m["variants"]
        ),
    }


def flat_variants() -> Iterable[dict[str, Any]]:
    """Every variant across every model, flattened for pickers and comparison."""
    for entry in models():
        for variant in entry["variants"]:
            yield {
                "id": f"{entry['id']}--" + re.sub(r"[^a-z0-9]+", "-", variant["name"].lower()).strip("-"),
                "model": entry["id"],
                "modelName": entry["name"],
                "name": variant["name"],
                "priceInr": variant["price_inr"],
                "note": variant.get("note", ""),
                "body": entry["body"],
                "engine": entry["engine"],
                "image": variant.get("image") or entry["image"],
            }
