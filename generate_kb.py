import json
import os
import shutil

# Path setup
KB_DIR = "kb/bangalore"
if os.path.exists(KB_DIR):
    shutil.rmtree(KB_DIR)
os.makedirs(KB_DIR, exist_ok=True)
os.makedirs(os.path.join(KB_DIR, "outlets"), exist_ok=True)
os.makedirs(os.path.join(KB_DIR, "services"), exist_ok=True)

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Save raw pages as markdown
for page_key, page_data in data.items():
    filename = f"{page_key}.md" if page_key != "home" else "index.md"
    filepath = os.path.join(KB_DIR, filename)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"# {page_data['title']}\n\n")
        f.write(f"{page_data['content']}\n\n")
        
        f.write("## Links\n")
        for link in page_data['links']:
            f.write(f"- [{link['text']}]({link['href']})\n")

print("Generated Bangalore KB markdown files.")
