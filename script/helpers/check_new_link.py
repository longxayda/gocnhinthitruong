import json
import os

# Lấy đúng đường dẫn tới folder helpers
HELPERS_DIR = os.path.dirname(__file__)
LINK_STORAGE_PATH = os.path.join(HELPERS_DIR, "latest_links.json")

def check_and_store_new_links(new_links: list[str]) -> list[str]:
    print(f"📄 File lưu link: {LINK_STORAGE_PATH}")

    if not os.path.exists(LINK_STORAGE_PATH):
        with open(LINK_STORAGE_PATH, 'w', encoding='utf-8') as f:
            json.dump(new_links, f, ensure_ascii=False, indent=2)
        return new_links

    try:
        with open(LINK_STORAGE_PATH, 'r', encoding='utf-8') as f:
            old_links = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        old_links = []

    fresh_links = [link for link in new_links if link not in old_links]

    if fresh_links:
        try:
            with open(LINK_STORAGE_PATH, 'w', encoding='utf-8') as f:
                json.dump(new_links, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"❌ Ghi file thất bại: {e}")

    return fresh_links
