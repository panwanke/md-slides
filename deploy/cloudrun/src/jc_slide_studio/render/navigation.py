"""Build chapter navigation from explicit Markdown section slides."""

from __future__ import annotations

import html
import re
from typing import Any, Dict, List, Optional


def collect_chapters(slides: List[str]) -> Optional[Dict[str, Any]]:
    """Resolve chapter IDs and numeric destinations without changing old decks."""
    entries = []
    for index, slide in enumerate(slides, 1):
        directive = re.search(r"<!--\s*slide:\s*(.*?)\s*-->", slide, re.I)
        metadata = dict(re.findall(r"([\w-]+)=([^|\s]+)", directive.group(1))) if directive else {}
        title = re.search(r"^#\s+(.+)$", slide, re.M)
        entries.append((index, metadata, title.group(1).strip() if title else ""))
    contents = [index for index, metadata, _ in entries if metadata.get("layout") == "toc"]
    if not contents:
        return None
    if len(contents) != 1:
        raise ValueError("A chapter deck must contain exactly one toc slide")
    chapters = []
    identifiers = set()
    for index, metadata, title in entries:
        if metadata.get("layout") != "section":
            continue
        identifier = metadata.get("id", "")
        if not re.fullmatch(r"[a-z][a-z0-9-]*", identifier):
            raise ValueError("Each section in a chapter deck needs a lowercase kebab-case id")
        if identifier in identifiers:
            raise ValueError("Duplicate chapter id: " + identifier)
        if not title:
            raise ValueError("Each chapter section needs a heading")
        identifiers.add(identifier)
        chapters.append({"id": identifier, "title": title, "page": index, "number": len(chapters) + 1})
    if not chapters:
        raise ValueError("A toc slide requires at least one section slide")
    if contents[0] >= chapters[0]["page"]:
        raise ValueError("The toc slide must precede the first chapter")
    page_chapters = {}
    current = None
    by_page = {chapter["page"]: chapter for chapter in chapters}
    for index, metadata, _ in entries:
        if index in by_page:
            current = by_page[index]
        if current and metadata.get("layout") not in ("cover", "toc"):
            page_chapters[index] = current
    return {"toc_page": contents[0], "chapters": chapters, "pages": page_chapters}


def render_toc(navigation: Dict[str, Any]) -> str:
    """Render chapter links whose destinations are recomputed at each build."""
    cards = []
    for chapter in navigation["chapters"]:
        cards.append(
            '<a class="jc-toc-card" href="#/%d" data-chapter-link="%s">'
            '<span class="jc-toc-number">%02d</span><span>%s</span>'
            '<span class="jc-toc-arrow" aria-hidden="true">↗</span></a>'
            % (chapter["page"], chapter["id"], chapter["number"], html.escape(chapter["title"]))
        )
    return '<nav class="jc-toc-grid" aria-label="Chapters">%s</nav>' % "".join(cards)


def render_navigation(navigation: Dict[str, Any], page: int, lang: str = "zh") -> str:
    """Render a local navigation bar with the current chapter preselected."""
    current = navigation["pages"].get(page)
    if current is None:
        return ""
    links = ['<a class="jc-toc-return" href="#/%d">%s</a>' % (
        navigation["toc_page"], "Outline" if lang == "en" else "目录")]
    for chapter in navigation["chapters"]:
        selected = chapter["id"] == current["id"]
        links.append('<a href="#/%d" data-chapter-link="%s"%s>%s</a>' % (
            chapter["page"], chapter["id"],
            ' class="is-current" aria-current="true"' if selected else "",
            html.escape(chapter["title"])))
    return '<nav class="jc-chapter-nav" aria-label="Chapter navigation">%s</nav>' % "".join(links)
