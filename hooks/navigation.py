import json
import posixpath
import re
from pathlib import Path

_navigation = None
_docs_dir = None


def _validate_navigation(navigation):
    if navigation.get("version") != 1 or not isinstance(navigation.get("items"), list):
        raise ValueError("docs/navigation.json must use schema version 1")

    ids = set()
    paths = set()
    id_pattern = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")
    path_pattern = re.compile(r"^[a-z0-9_-]+(?:/[a-z0-9_-]+)*\.md$")
    prefix_pattern = re.compile(r"^[a-z0-9_-]+(?:/[a-z0-9_-]+)*$")

    def visit(items):
        for item in items:
            item_type = item.get("type")
            if item_type == "page":
                path = item.get("path")
                if not isinstance(path, str) or not path_pattern.fullmatch(path):
                    raise ValueError("navigation page entries require a Markdown path")
                if path in paths:
                    raise ValueError(f"duplicate navigation path: {path}")
                paths.add(path)
                continue
            if item_type != "section":
                raise ValueError(f"unsupported navigation item type: {item_type}")
            required = ("id", "title", "pathPrefix", "index", "items")
            if any(key not in item for key in required) or not isinstance(item["items"], list):
                raise ValueError("navigation sections are missing required fields")
            if (
                not isinstance(item["id"], str)
                or not id_pattern.fullmatch(item["id"])
                or not isinstance(item["title"], str)
                or not item["title"].strip()
                or "\n" in item["title"]
                or not isinstance(item["index"], str)
                or not path_pattern.fullmatch(item["index"])
                or not isinstance(item["pathPrefix"], str)
                or not prefix_pattern.fullmatch(item["pathPrefix"])
                or (
                    item.get("childPrefix") is not None
                    and (
                        not isinstance(item["childPrefix"], str)
                        or not prefix_pattern.fullmatch(item["childPrefix"])
                    )
                )
            ):
                raise ValueError(f"invalid navigation section: {item.get('id')}")
            if item["id"] in ids:
                raise ValueError(f"duplicate navigation section id: {item['id']}")
            if item["index"] in paths:
                raise ValueError(f"duplicate navigation path: {item['index']}")
            ids.add(item["id"])
            paths.add(item["index"])
            visit(item["items"])

    visit(navigation["items"])


def _mkdocs_item(item):
    if item["type"] == "page":
        path = item["path"]
        return {item["title"]: path} if item.get("title") else path

    children = []
    if item.get("index"):
        children.append(item["index"])
    children.extend(_mkdocs_item(child) for child in item.get("items", []))
    return {item["title"]: children}


def _validate_directory_titles(items, docs_dir):
    for item in items:
        if item.get("type") != "section":
            continue
        index_path = docs_dir / item["index"]
        content = index_path.read_text(encoding="utf-8")
        match = re.search(r"^#\s+(.+?)\s*(?:\{[^}]+\})?$", content, re.MULTILINE)
        page_title = match.group(1).strip() if match else None
        if page_title != item["title"]:
            raise ValueError(
                f"directory title mismatch for {item['index']}: "
                f"navigation={item['title']!r}, page={page_title!r}"
            )
        _validate_directory_titles(item.get("items", []), docs_dir)


def on_config(config):
    global _navigation, _docs_dir
    navigation_path = Path(config["config_file_path"]).parent / "docs" / "navigation.json"
    navigation = json.loads(navigation_path.read_text(encoding="utf-8"))
    _validate_navigation(navigation)
    _validate_directory_titles(navigation["items"], navigation_path.parent)
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


def _find_page_context(items, path, parent=None):
    for item in items:
        if item.get("type") == "page" and item.get("path") == path:
            page_type = "home" if path == "index.md" else "article"
            return page_type, parent.get("id") if parent else None
        if item.get("type") != "section":
            continue
        if item.get("index") == path:
            return "directory", item["id"]
        nested = _find_page_context(item.get("items", []), path, item)
        if nested:
            return nested
    return None


def _page_title(path):
    content = (_docs_dir / path).read_text(encoding="utf-8")
    match = re.search(r"^#\s+(.+?)\s*(?:\{[^}]+\})?$", content, re.MULTILINE)
    return match.group(1).strip() if match else Path(path).stem


def on_page_markdown(markdown, page, **kwargs):
    if not _navigation:
        return markdown

    if "<!-- auto-directory -->" in markdown:
        section = _find_section(_navigation["items"], page.file.src_uri)
        if not section:
            markdown = markdown.replace("<!-- auto-directory -->", "")
        else:
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
            markdown = markdown.replace("<!-- auto-directory -->", listing)

    context = _find_page_context(_navigation["items"], page.file.src_uri)
    if not context:
        return markdown
    page_type, directory_id = context
    directory_attribute = f' data-directory-id="{directory_id}"' if directory_id else ""
    marker = (
        f'<div class="editor-page-context" data-page-type="{page_type}"'
        f'{directory_attribute} hidden></div>'
    )
    return re.sub(r"(^#\s+.*$)", rf"\1\n\n{marker}", markdown, count=1, flags=re.MULTILINE)
