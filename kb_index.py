import os
import re
from typing import Any

KB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kb", "bangalore")

def pages() -> list[dict[str, Any]]:
    found = []
    if not os.path.exists(KB_DIR):
        return found
        
    for root, _dirs, files in os.walk(KB_DIR):
        for name in sorted(files):
            if not name.endswith(".md"):
                continue
            full = os.path.join(root, name)
            with open(full, "r", encoding="utf-8") as f:
                content = f.read()
                
            title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
            title = title_match.group(1) if title_match else name[:-3]
            
            found.append({
                "id": name[:-3],
                "title": title.strip(),
                "content": content
            })
    return found

def page(page_id: str) -> dict[str, Any] | None:
    for p in pages():
        if p["id"] == page_id:
            return p
    return None

def get_outlets() -> list[dict[str, str]]:
    return [
        {
            "name": "Volkswagen Bangalore - Showroom",
            "address": "SY No. 49/8-9, 10, Hosur Rd, Singasandra, Bengaluru, Karnataka 560100",
            "phone": "8040138004",
            "email": "crm@vw-elitemotors.co.in",
            "type": "Showroom"
        },
        {
            "name": "Volkswagen Bangalore - Service",
            "address": "SY No. 49/8-9, 10, Hosur Rd, Singasandra, Bengaluru, Karnataka 560100",
            "phone": "8040138004",
            "email": "crhead@vw-elitemotors.co.in",
            "type": "Service Center"
        }
    ]

def get_models() -> list[dict[str, str]]:
    return [
        {"id": "tayron-r-line", "name": "Tayron R-Line", "image": "/assets/img/tayron.webp"},
        {"id": "golf-gti", "name": "Golf GTI", "image": "/assets/img/golf-gti.webp"},
        {"id": "tiguan-r-line", "name": "Tiguan R-Line", "image": "/assets/img/tiguan.webp"},
        {"id": "virtus-sport", "name": "Virtus Sport", "image": "/assets/img/virtus-sport.webp"},
        {"id": "taigun-sport", "name": "Taigun Sport", "image": "/assets/img/taigun.webp"},
    ]
