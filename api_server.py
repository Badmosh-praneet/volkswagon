import os
from typing import List, Optional
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import kb_index as kb

app = FastAPI(
    title="Volkswagen Bangalore API",
    description="API serving scraped content for Volkswagen Bangalore dealerships.",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ContactRequest(BaseModel):
    name: str
    phone: str
    message: str

@app.get("/api/pages", tags=["Knowledge Base"])
async def get_pages():
    return {"pages": kb.pages()}

@app.get("/api/pages/{page_id}", tags=["Knowledge Base"])
async def get_page(page_id: str):
    page = kb.page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page

@app.get("/api/outlets", tags=["Dealerships"])
async def get_outlets():
    return {"outlets": kb.get_outlets()}

@app.get("/api/models", tags=["Catalogue"])
async def get_models():
    return {"models": kb.get_models()}

@app.post("/api/contact", tags=["Leads"])
async def contact_us(req: ContactRequest):
    return {
        "status": "success",
        "message": f"Thanks {req.name}, we will contact you at {req.phone} soon."
    }

static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"Volkswagen Bangalore API  ->  http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
