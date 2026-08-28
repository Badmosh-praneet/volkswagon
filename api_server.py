"""Volkswagen India API — a read API over the scraped knowledge base in kb/.

Every response traces back to a markdown file under kb/. The structured layer
lives in kb_index.py; this module is routing, validation and shaping only.

The four endpoints the site was first built on — /api/cars, /api/cars/{id},
/api/used-cars and POST /api/appointments — keep their original shape so
anything already calling them continues to work. The rest of the surface was
added so the front end has structured data to render instead of raw markdown.

    python api_server.py        # http://localhost:8000, docs at /docs
"""

import os
from datetime import date
from typing import Any, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import kb_index as kb

app = FastAPI(
    title="Volkswagen India API",
    description=(
        "A read API over a scraped knowledge base of volkswagen.co.in. "
        "Five model pages, eight variants and their prices, ownership services, "
        "finance maths and full-text search across every page in kb/."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KB_DIR = kb.KB_DIR


# ------------------------------------------------------------------ schemas --

class AppointmentRequest(BaseModel):
    name: str = Field(min_length=2, examples=["Asha Nair"])
    phone: str = Field(min_length=6, examples=["9876543210"])
    model: str = Field(examples=["Taigun"])
    preferred_date: str = Field(examples=["2026-09-15"])
    dealer_city: Optional[str] = Field(default=None, examples=["Pune"])


class LeadRequest(BaseModel):
    name: str = Field(min_length=2, examples=["Rohit Verma"])
    phone: str = Field(min_length=6, examples=["9876543210"])
    city: str = Field(min_length=2, examples=["Bengaluru"])
    interest: Optional[str] = Field(default=None, examples=["virtus"])
    message: Optional[str] = None


class CarModelSummary(BaseModel):
    id: str
    name: str
    url: str


class CarDetails(BaseModel):
    id: str
    name: str
    description: str
    content: str


# ------------------------------------------------------- catalogue (v1 shape) --

@app.get("/api/cars", response_model=List[CarModelSummary], tags=["Catalogue"])
async def get_cars():
    """The models in the knowledge base — id, display name and detail URL.

    Original shape, kept for compatibility. `/api/lineup` returns the same
    models with prices and powertrain attached.
    """
    return [
        CarModelSummary(id=entry["id"], name=entry["name"], url=entry["url"])
        for entry in kb.models()
    ]


@app.get("/api/cars/{model_id}", response_model=CarDetails, tags=["Catalogue"])
async def get_car_details(model_id: str):
    """The full markdown for one model, straight off the knowledge base page."""
    file_path = os.path.join(KB_DIR, "models", f"{model_id}.md")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Car model not found in the knowledge base.")

    with open(file_path, "r", encoding="utf-8") as handle:
        content = handle.read()

    entry = kb.model(model_id)
    return CarDetails(
        id=model_id,
        name=entry["name"] if entry else model_id.replace("-", " ").title(),
        description=(entry["blurb"] if entry else "Volkswagen premium vehicle"),
        content=content,
    )


# --------------------------------------------------------------- line-up API --

@app.get("/api/lineup", tags=["Catalogue"])
async def get_lineup(
    body: Optional[str] = Query(None, description="SUV, Sedan or Hatchback"),
    max_price: Optional[int] = Query(None, ge=0, description="Ex-showroom ceiling, in rupees"),
    sort: str = Query("price_asc", pattern="^(price_asc|price_desc|name)$"),
):
    """The model line-up with price, powertrain and highlights.

    Prices are read out of kb/models/index.md and each model's own page; the
    facet counts mirror the filter list on the source page, which counts Virtus
    Sport and Virtus Chrome as separate cards where kb/models/ holds one page.
    """
    entries = kb.models()
    if body:
        entries = [m for m in entries if m["body"].lower() == body.lower()]
    if max_price is not None:
        entries = [m for m in entries if (m["priceFrom"] or 0) <= max_price]

    if sort == "price_desc":
        entries = sorted(entries, key=lambda m: m["priceFrom"] or 0, reverse=True)
    elif sort == "name":
        entries = sorted(entries, key=lambda m: m["name"])

    return {
        "count": len(entries),
        "facets": {
            key: [{"label": label, "count": count} for label, count in values]
            for key, values in kb.FACETS.items()
        },
        "models": entries,
        "imageCredit": kb.IMAGE_CREDIT,
        "disclaimer": (
            "International car or model shown for representation purposes only. Features, "
            "accessories, colour and equipment may vary depending on variant."
        ),
    }


@app.get("/api/models/{model_id}", tags=["Catalogue"])
async def get_model(model_id: str):
    """One model, structured — specs, variants, highlights and FAQs."""
    entry = kb.model(model_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"No model '{model_id}' in the knowledge base.")
    return {**entry, "faqs": kb.faqs(model_id)}


@app.get("/api/models/{model_id}/faqs", tags=["Catalogue"])
async def get_model_faqs(model_id: str):
    """Questions and answers parsed from the model page's FAQ accordion."""
    if kb.model(model_id) is None:
        raise HTTPException(status_code=404, detail=f"No model '{model_id}' in the knowledge base.")
    return {"model": model_id, "faqs": kb.faqs(model_id)}


@app.get("/api/variants", tags=["Catalogue"])
async def get_variants():
    """Every variant across every model, flattened — for pickers and comparison."""
    variants = list(kb.flat_variants())
    return {"count": len(variants), "variants": variants}


@app.get("/api/compare", tags=["Catalogue"])
async def compare(
    a: str = Query(..., description="Model id, e.g. virtus"),
    b: str = Query(..., description="Model id, e.g. taigun"),
):
    """Two models side by side on the fields the knowledge base states for both."""
    left, right = kb.model(a), kb.model(b)
    missing = [ident for ident, entry in ((a, left), (b, right)) if entry is None]
    if missing:
        raise HTTPException(status_code=404, detail=f"Unknown model(s): {', '.join(missing)}")

    fields = [
        ("Body", "body"), ("From (ex-showroom)", "priceFrom"), ("Engine", "engine"),
        ("Max. power", "power"), ("Max. torque", "torque"), ("Drivetrain", "drivetrain"),
        ("Acceleration", "acceleration"), ("Seats", "seats"), ("Safety", "safety"),
    ]
    rows = []
    for label, key in fields:
        left_value, right_value = left.get(key), right.get(key)
        if left_value is None and right_value is None:
            continue
        rows.append({"label": label, "a": left_value, "b": right_value})

    rows.append({
        "label": "Transmission",
        "a": ", ".join(left["transmissions"]) or None,
        "b": ", ".join(right["transmissions"]) or None,
    })
    return {"a": {"id": left["id"], "name": left["name"]},
            "b": {"id": right["id"], "name": right["name"]},
            "rows": rows}


# --------------------------------------------------------------- ownership --

@app.get("/api/services", tags=["Ownership"])
async def get_services():
    """The owner services listed on the Owners & Services page."""
    return {"count": len(kb.SERVICES), "services": kb.SERVICES}


@app.get("/api/services/4ever-care", tags=["Ownership"])
async def get_forever_care():
    """The 4EVER Care programme — warranty, free services and roadside assistance."""
    return kb.FOREVER_CARE


@app.get("/api/used-cars", tags=["Ownership"])
async def get_used_cars_info():
    """Volkswagen Certified Pre-Owned.

    Returns the structured summary plus the raw markdown under `content`, which
    is the field the original endpoint returned.
    """
    file_path = os.path.join(KB_DIR, "en", "available-used-cars.md")
    content = ""
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as handle:
            content = handle.read()
    return {"status": "available", **kb.PRE_OWNED, "content": content}


@app.get("/api/brand", tags=["Ownership"])
async def get_brand():
    """Volkswagen Group in India — the heritage page, structured."""
    return kb.BRAND


# ----------------------------------------------------------------- finance --

@app.get("/api/finance", tags=["Finance"])
async def get_finance():
    """Leasing, insurance and warranty products, plus the states priced below."""
    return {**kb.FINANCE, "states": sorted(kb.STATE_TAX)}


@app.get("/api/finance/emi", tags=["Finance"])
async def get_emi(
    principal: float = Query(1_000_000, gt=0, le=50_000_000, description="Loan amount in rupees"),
    rate: float = Query(9.5, ge=0, le=30, description="Annual interest rate, percent"),
    years: int = Query(5, ge=1, le=8, description="Tenure in years"),
):
    """Reducing-balance EMI, computed server-side so the page never guesses."""
    return kb.emi(principal, rate, years)


@app.get("/api/finance/on-road", tags=["Finance"])
async def get_on_road(
    model_id: str = Query(..., alias="model", description="Model id, e.g. virtus"),
    state: str = Query("Maharashtra", description="Registration state"),
    variant: Optional[str] = Query(None, description="Variant name; defaults to the cheapest"),
):
    """Indicative on-road build-up for a model in one state."""
    entry = kb.model(model_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"No model '{model_id}' in the knowledge base.")
    if state not in kb.STATE_TAX:
        raise HTTPException(
            status_code=422,
            detail=f"No road-tax band for '{state}'. Known: {', '.join(sorted(kb.STATE_TAX))}.",
        )

    price = entry["priceFrom"]
    label = entry["name"]
    if variant:
        match = next(
            (v for v in entry["variants"] if v["name"].lower() == variant.lower()), None
        )
        if match is None:
            raise HTTPException(
                status_code=404,
                detail=f"'{variant}' is not a {entry['name']} variant.",
            )
        price, label = match["price_inr"], match["name"]

    return {"model": entry["id"], "variant": label, **kb.on_road(price, state)}


# -------------------------------------------------------------------- leads --

@app.post("/api/appointments", tags=["Leads"])
async def book_appointment(req: AppointmentRequest):
    """Book a test drive. Demo endpoint — nothing is persisted."""
    return {
        "status": "success",
        "reference": f"VW-TD-{abs(hash((req.phone, req.preferred_date))) % 10**6:06d}",
        "message": (
            f"Test drive confirmed for {req.name}. We will call {req.phone} about your "
            f"{req.model} on {req.preferred_date}"
            + (f" at our {req.dealer_city} dealership." if req.dealer_city else ".")
        ),
    }


@app.post("/api/leads", tags=["Leads"])
async def create_lead(req: LeadRequest):
    """Request a callback. Demo endpoint — nothing is persisted."""
    return {
        "status": "received",
        "reference": f"VW-CB-{abs(hash((req.phone, req.city))) % 10**6:06d}",
        "message": f"Thanks {req.name} — a Volkswagen advisor in {req.city} will call you back.",
    }


# -------------------------------------------------------- knowledge base API --

@app.get("/api/kb", tags=["Knowledge base"])
async def get_kb_index():
    """Every page in the knowledge base, header-parsed."""
    entries = kb.pages()
    return {"count": len(entries), "pages": entries}


@app.get("/api/kb/search", tags=["Knowledge base"])
async def search_kb(
    q: str = Query(..., min_length=2, description="Search term"),
    limit: int = Query(20, ge=1, le=100),
):
    """Full-text search across every markdown page under kb/."""
    results = kb.search(q, limit)
    return {"query": q, "count": len(results), "results": results}


@app.get("/api/kb/page/{page_id}", tags=["Knowledge base"])
async def get_kb_page(page_id: str):
    """One knowledge-base page, header and body."""
    entry = kb.page(page_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"No knowledge-base page '{page_id}'.")
    return entry


@app.get("/api/meta", tags=["Knowledge base"])
async def get_meta():
    """Counts across the knowledge base, plus the endpoint list the site renders."""
    return {
        "name": "Volkswagen India API",
        "version": app.version,
        "generated": date.today().isoformat(),
        "stats": kb.stats(),
        "endpoints": [
            {"method": route.methods and sorted(route.methods - {"HEAD", "OPTIONS"})[0] or "GET",
             "path": route.path,
             "summary": (route.description or "").strip().split("\n")[0]}
            for route in app.routes
            if getattr(route, "path", "").startswith("/api/")
        ],
    }


@app.get("/api/health", tags=["Knowledge base"])
async def health():
    return {"status": "ok", "kb": os.path.isdir(KB_DIR), "models": len(kb.models())}


# ------------------------------------------------------------- static site --

static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"Volkswagen India API  ->  http://localhost:{port}   (docs at /docs)")
    uvicorn.run(app, host="0.0.0.0", port=port)
