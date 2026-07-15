import json
import posixpath
import re
from pathlib import Path

_navigation = None
_docs_dir = None


def _mkdocs_item(item):
    if item["type"] == "page":
        path = item["path"]
        return {item["title"]: path} if item.get("title") else path

    children = []
    if item.get("index"):
        children.append(item["index"])
    children.extend(_mkdocs_item(child) for child in item.get("items", []))
    return {item["title"]: children}


def on_config(config):
    global _navigation, _docs_dir
    navigation_path = Path(config["config_file_path"]).parent / "docs" / "navigation.json"
    navigation = json.loads(navigation_path.read_text(encoding="utf-8"))
    config["nav"] = [_mkdocs_item(item) for item in navigation["items"]]
    _navigation = navigation
    _docs_dir = navigation_path.parent
    return config


def _find_section(items, index_path):
    for item in items:
        if item.get("type") != "section":
            continue
        if item.get("index") == index_path:
            return item
        nested = _find_section(item.get("items", []), index_path)
        if nested:
            return nested
    return None


def _page_title(path):
    content = (_docs_dir / path).read_text(encoding="utf-8")
    match = re.search(r"^#\s+(.+?)\s*(?:\{[^}]+\})?$", content, re.MULTILINE)
    return match.group(1).strip() if match else Path(path).stem


def on_page_markdown(markdown, page, **kwargs):
    if not _navigation or "<!-- auto-directory -->" not in markdown:
        return markdown
    section = _find_section(_navigation["items"], page.file.src_uri)
    if not section:
        return markdown.replace("<!-- auto-directory -->", "")

    current_dir = posixpath.dirname(section["index"])
    links = []
    for child in section.get("items", []):
        if child["type"] == "section":
            target = child.get("index")
            title = child["title"]
        else:
            target = child["path"]
            title = _page_title(target)
        if target:
            links.append(f"- [{title}]({posixpath.relpath(target, current_dir or '.')})")
    listing = "\n".join(links) if links else "_这个目录还没有文章。_"
    return markdown.replace("<!-- auto-directory -->", listing)
