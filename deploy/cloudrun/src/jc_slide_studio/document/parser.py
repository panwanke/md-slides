"""Markdown slide parser with source position mapping."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

SLIDES_START_RE = re.compile(
    r"^[ \t]*<!--[ \t]*(?:slides:start|slides|@slides)[ \t]*-->[ \t]*$", re.M
)
META_RE = re.compile(r"^<!--\s*slide:\s*(.*?)\s*-->", re.I | re.M)


def parse_front_matter(text: str) -> Tuple[Dict[str, Any], str, Tuple[int, int]]:
    """Parse YAML-like frontmatter and return (meta, remaining_text, fm_range)."""
    meta: Dict[str, Any] = {}
    if not text.startswith("---"):
        return meta, text, (0, 0)
    lines = text.splitlines(keepends=True)
    end_idx = None
    char_count = len(lines[0])
    for i in range(1, len(lines)):
        char_count += len(lines[i])
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return meta, text, (0, 0)

    cur: dict = meta
    for ln in lines[1:end_idx]:
        s = ln.strip()
        if not s or s.startswith("#"):
            continue
        m = re.match(r"^(\s*)([A-Za-z0-9_\-\.]+)\s*:\s*(.*)$", ln)
        if not m:
            continue
        indent, key, val = len(m.group(1)), m.group(2), m.group(3).strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        if indent == 0:
            if val == "":
                d = meta.setdefault(key, {})
                cur = d if isinstance(d, dict) else meta
            else:
                meta[key] = val
                cur = meta
        elif isinstance(cur, dict):
            cur[key] = val

    remaining_text = "".join(lines[end_idx + 1:])
    return meta, remaining_text, (0, char_count)


def strip_workspace(text: str) -> Tuple[str, int]:
    """Discard preamble workspace before <!-- slides:start --> if present."""
    m = SLIDES_START_RE.search(text)
    if not m:
        return text, 0
    return text[m.end():], m.end()


def split_slides_with_ranges(text: str, base_offset: int = 0) -> List[Dict[str, Any]]:
    """Split slides by '---' fences outside of code blocks/containers with exact character offsets."""
    slides: List[Dict[str, Any]] = []
    lines = text.splitlines(keepends=True)

    cur_lines: List[str] = []
    cur_start = base_offset
    current_offset = base_offset

    fence = False
    container = 0

    for ln in lines:
        s = ln.strip()
        if s.startswith("```"):
            fence = not fence
        if not fence and s.startswith(":::"):
            container = max(0, container + (-1 if s == ":::" else 1))

        if not fence and container == 0 and re.fullmatch(r"-{3,}", s):
            slide_raw = "".join(cur_lines)
            if slide_raw.strip():
                slides.append({
                    "raw": slide_raw,
                    "range": (cur_start, current_offset),
                })
            cur_lines = []
            current_offset += len(ln)
            cur_start = current_offset
        else:
            cur_lines.append(ln)
            current_offset += len(ln)

    if cur_lines:
        slide_raw = "".join(cur_lines)
        if slide_raw.strip():
            slides.append({
                "raw": slide_raw,
                "range": (cur_start, current_offset),
            })

    return slides


def parse_slide_meta(text: str) -> Tuple[Dict[str, str], str]:
    meta: Dict[str, str] = {}
    m = META_RE.search(text)
    if not m:
        return meta, text
    for part in re.split(r"[|\s]+", m.group(1).strip()):
        if "=" in part:
            k, v = part.split("=", 1)
            meta[k.strip().lower()] = v.strip()
    clean_text = (text[: m.start()] + text[m.end():]).lstrip("\n")
    return meta, clean_text


def stable_slide_id(meta: Dict[str, str], page_index: int) -> str:
    if "id" in meta:
        identifier = meta["id"]
        if re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", identifier):
            return f"chapter-{identifier}" if meta.get("layout", "").lower() == "section" else identifier
    return f"slide-{page_index}"


def extract_slide_title(text: str) -> str:
    m = re.search(r"^#\s+(.+)$", text, re.M)
    if m:
        return m.group(1).strip()
    m2 = re.search(r"^##\s+(.+)$", text, re.M)
    if m2:
        return m2.group(1).strip()
    return ""


def extract_speaker_notes(text: str) -> str:
    m = re.search(r":::\s*notes\s*\n([\s\S]*?)\n:::", text)
    return m.group(1).strip() if m else ""


def group_slides_into_sections(slides: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    sections: List[Dict[str, Any]] = []
    current_section: Optional[Dict[str, Any]] = None
    sec_counter = 0

    for s in slides:
        meta = s.get("metadata", {})
        layout = s.get("layout", "")
        explicit_sec = meta.get("section")
        is_section_trigger = layout in ("section", "toc") or bool(explicit_sec)

        if current_section is None or is_section_trigger:
            sec_counter += 1
            sec_id = f"sec-{sec_counter}"
            if explicit_sec:
                sec_title = explicit_sec
            elif layout == "cover":
                sec_title = "封面与概述"
            elif layout == "toc":
                sec_title = "目录与大纲"
            elif layout == "section":
                sec_title = s.get("title") or f"第 {sec_counter} 节"
            elif layout == "end":
                sec_title = "结语与致谢"
            else:
                sec_title = s.get("title") or f"第 {sec_counter} 节"

            current_section = {
                "id": sec_id,
                "number": sec_counter,
                "title": sec_title,
                "slideIndices": [],
                "slides": [],
            }
            sections.append(current_section)

        s["sectionId"] = current_section["id"]
        s["sectionTitle"] = current_section["title"]
        current_section["slideIndices"].append(s["index"])
        current_section["slides"].append({
            "slideId": s["slideId"],
            "index": s["index"],
            "title": s["title"],
            "layout": s["layout"],
        })

    return sections


def extract_slide_nodes(raw_text: str, base_offset: int, slide_id: str) -> List[Dict[str, Any]]:
    """Extract identifiable nodes and their source ranges within a single slide."""
    nodes = []

    # 1. Slide metadata directive
    meta_match = META_RE.search(raw_text)
    if meta_match:
        nodes.append({
            "nodeId": f"{slide_id}-meta",
            "nodeType": "meta",
            "sourceRange": [base_offset + meta_match.start(), base_offset + meta_match.end()],
            "content": meta_match.group(1).strip(),
        })

    # 2. Main heading
    h_match = re.search(r"^(#{1,3})\s+(.+)$", raw_text, re.M)
    if h_match:
        nodes.append({
            "nodeId": f"{slide_id}-heading",
            "nodeType": "heading",
            "level": len(h_match.group(1)),
            "title": h_match.group(2).strip(),
            "sourceRange": [base_offset + h_match.start(), base_offset + h_match.end()],
        })

    # 3. Notes block
    notes_match = re.search(r":::\s*notes\s*\n([\s\S]*?)\n:::", raw_text)
    if notes_match:
        nodes.append({
            "nodeId": f"{slide_id}-notes",
            "nodeType": "notes",
            "content": notes_match.group(1).strip(),
            "sourceRange": [base_offset + notes_match.start(), base_offset + notes_match.end()],
        })

    # 4. Images
    for img_idx, img_match in enumerate(re.finditer(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+\"([^\"]*)\")?\)", raw_text), 1):
        nodes.append({
            "nodeId": f"{slide_id}-img-{img_idx}",
            "nodeType": "image",
            "alt": img_match.group(1),
            "src": img_match.group(2),
            "caption": img_match.group(3) or "",
            "sourceRange": [base_offset + img_match.start(), base_offset + img_match.end()],
        })

    # 5. Box containers
    for box_idx, box_match in enumerate(re.finditer(r":::\s*box\s*\n([\s\S]*?)\n:::", raw_text), 1):
        nodes.append({
            "nodeId": f"{slide_id}-box-{box_idx}",
            "nodeType": "box",
            "content": box_match.group(1).strip(),
            "sourceRange": [base_offset + box_match.start(), base_offset + box_match.end()],
        })

    # 6. Fragment containers
    for frag_idx, frag_match in enumerate(re.finditer(r":::\s*fragment(?:\s+([^\n]+))?\n([\s\S]*?)\n:::", raw_text), 1):
        nodes.append({
            "nodeId": f"{slide_id}-frag-{frag_idx}",
            "nodeType": "fragment",
            "arg": frag_match.group(1) or "",
            "content": frag_match.group(2).strip(),
            "sourceRange": [base_offset + frag_match.start(), base_offset + frag_match.end()],
        })

    return nodes


def apply_source_patch(source_text: str, start_offset: int, end_offset: int, replacement: str) -> str:
    """Safely replaces text in [start_offset, end_offset) without touching other characters."""
    if start_offset < 0 or end_offset > len(source_text) or start_offset > end_offset:
        raise ValueError(f"Invalid patch range [{start_offset}, {end_offset}) for length {len(source_text)}")
    return source_text[:start_offset] + replacement + source_text[end_offset:]


def apply_node_patch(source_text: str, node_id: str, new_value: str) -> str:
    """Finds node by nodeId in document AST and safely replaces its source range."""
    ast = build_document_ast(source_text)
    for slide in ast["slides"]:
        for node in slide.get("nodes", []):
            if node["nodeId"] == node_id:
                start, end = node["sourceRange"]
                node_type = node.get("nodeType")
                if node_type == "heading":
                    level = node.get("level", 2)
                    replacement = f"{'#' * level} {new_value}"
                elif node_type == "notes":
                    replacement = f"::: notes\n{new_value}\n:::"
                elif node_type == "meta":
                    replacement = f"<!-- slide: {new_value} -->"
                elif node_type == "box":
                    replacement = f"::: box\n{new_value}\n:::"
                elif node_type == "fragment":
                    arg = node.get("arg", "")
                    prefix = f"::: fragment {arg}".rstrip()
                    replacement = f"{prefix}\n{new_value}\n:::"
                else:
                    replacement = new_value
                return apply_source_patch(source_text, start, end, replacement)
    raise KeyError(f"Node '{node_id}' not found in document AST")


def update_slide_layout(slide_text: str, new_layout: str) -> str:
    """Updates or adds layout=<new_layout> in the slide directive."""
    m = META_RE.search(slide_text)
    if m:
        meta_content = m.group(1).strip()
        if re.search(r"\blayout=[\w-]+", meta_content, re.I):
            new_meta_content = re.sub(r"\blayout=[\w-]+", f"layout={new_layout}", meta_content, flags=re.I)
        else:
            new_meta_content = f"layout={new_layout} | {meta_content}".strip(" |")
        return slide_text[: m.start()] + f"<!-- slide: {new_meta_content} -->" + slide_text[m.end() :]
    else:
        return f"<!-- slide: layout={new_layout} -->\n" + slide_text.lstrip()


def build_document_ast(source_text: str, revision: int = 1) -> Dict[str, Any]:
    """Parse full Markdown text into DocumentAST with exact source mapping."""
    meta, body_after_fm, (fm_start, fm_end) = parse_front_matter(source_text)
    slides_body, workspace_offset = strip_workspace(body_after_fm)
    total_preamble_offset = fm_end + workspace_offset

    raw_slides = split_slides_with_ranges(slides_body, base_offset=total_preamble_offset)
    slide_asts = []

    for idx, s in enumerate(raw_slides, 1):
        raw_text = s["raw"]
        start_offset, end_offset = s["range"]
        slide_meta, body = parse_slide_meta(raw_text)
        slide_id = stable_slide_id(slide_meta, idx)
        title = extract_slide_title(body)
        notes = extract_speaker_notes(body)
        nodes = extract_slide_nodes(raw_text, start_offset, slide_id)

        slide_asts.append({
            "slideId": slide_id,
            "index": idx,
            "title": title or f"Slide {idx}",
            "layout": slide_meta.get("layout", "normal"),
            "sourceRange": [start_offset, end_offset],
            "notes": notes,
            "metadata": slide_meta,
            "nodes": nodes,
            "raw": raw_text,
        })

    sections = group_slides_into_sections(slide_asts)

    return {
        "documentRevision": revision,
        "frontmatter": meta,
        "slideCount": len(slide_asts),
        "slides": slide_asts,
        "sections": sections,
    }
