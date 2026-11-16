"""Slide syntax and semantic validation for jc-slide-studio."""

from __future__ import annotations

from pathlib import Path
import re
from typing import Any, Dict, List
from urllib.parse import unquote, urlsplit

from md_slide_studio.document.parser import (
    IMAGE_MARKDOWN,
    parse_front_matter,
    strip_workspace,
    split_slides_with_ranges,
    parse_slide_meta,
    stable_slide_id,
)

TODO_RE = re.compile(r"TODO|待补|待确认|待写|XXX|\?\?\?", re.I)


def check_slide_deck(source_path: Path | str, *, strict: bool = False) -> Dict[str, Any]:
    """Validate a Markdown deck.

    With ``strict=True`` speaker-note problems become errors, restoring the
    jc-slides pre-delivery gate. By default they stay warnings so that existing
    decks without notes still pass a syntax-only check.
    """
    path = Path(source_path).resolve()
    if not path.is_file():
        return {
            "ok": False,
            "source": str(path),
            "slideCount": 0,
            "diagnostics": [{"level": "error", "message": f"File not found: {path}"}],
        }

    text = path.read_text(encoding="utf-8")
    diagnostics: List[Dict[str, Any]] = []

    meta, body_after_fm, _ = parse_front_matter(text)
    slides_body, workspace_offset = strip_workspace(body_after_fm)

    # Scan placeholders only in the renderable area
    for m in TODO_RE.finditer(slides_body):
        line_num = text[: workspace_offset + m.start()].count("\n") + 1
        diagnostics.append({
            "level": "warning",
            "message": f"Found placeholder '{m.group(0)}'",
            "line": line_num,
        })

    slides = split_slides_with_ranges(slides_body)
    used_ids = set()
    deck_meta = (
        meta.get("md_slide")
        if isinstance(meta.get("md_slide"), dict)
        else meta.get("slides")
        if isinstance(meta.get("slides"), dict)
        else meta.get("jc")
        if isinstance(meta.get("jc"), dict)
        else {}
    )
    lang = str(deck_meta.get("lang") or meta.get("lang") or "zh").lower()
    lo, hi, unit = (80, 320, "words") if lang == "en" else (100, 400, "characters")
    note_re = re.compile(r"^:::\s*notes\b[^\n]*\n([\s\S]*?)^:::\s*$", re.M)

    for idx, s in enumerate(slides, 1):
        smeta, body = parse_slide_meta(s["raw"])
        layout = (smeta.get("layout") or "").lower()
        note_chunks = note_re.findall(body)
        note_level = "error" if strict else "warning"
        if not note_chunks:
            diagnostics.append({
                "level": note_level if layout not in ("journal", "section") else "warning",
                "message": f"Slide {idx} has no speaker notes",
                "slideIndex": idx,
            })
        else:
            joined = " ".join(note_chunks)
            count = len(joined.split()) if lang == "en" else len(re.sub(r"\s+", "", joined))
            if count < lo or count > hi:
                bound = "short" if count < lo else "long"
                diagnostics.append({
                    "level": note_level,
                    "message": (
                        f"Slide {idx} speaker notes too {bound}: "
                        f"{count} {unit} (expected {lo}-{hi})"
                    ),
                    "slideIndex": idx,
                })
        slide_id = smeta.get("id")
        if slide_id:
            if not re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", slide_id):
                diagnostics.append({
                    "level": "error",
                    "message": f"Invalid slide ID '{slide_id}' on slide {idx}; must be lowercase kebab-case",
                    "slideIndex": idx,
                })
            elif slide_id in used_ids:
                diagnostics.append({
                    "level": "error",
                    "message": f"Duplicate slide ID '{slide_id}' on slide {idx}",
                    "slideIndex": idx,
                })
            used_ids.add(slide_id)

        # Check image existence
        for img_match in IMAGE_MARKDOWN.finditer(body):
            img_src = img_match.group(2) or img_match.group(3)
            parsed = urlsplit(img_src)
            if not parsed.netloc and (not parsed.scheme or re.match(r"^[A-Za-z]:[/\\]", img_src)):
                local_path = re.split(r"[?#]", img_src, maxsplit=1)[0]
                img_path = (path.parent / unquote(local_path)).resolve()
                if not img_path.is_file():
                    diagnostics.append({
                        "level": "warning",
                        "message": f"Referenced image not found: {img_src}",
                        "slideIndex": idx,
                    })

    errors = [d for d in diagnostics if d["level"] == "error"]
    return {
        "ok": len(errors) == 0,
        "source": str(path),
        "slideCount": len(slides),
        "diagnostics": diagnostics,
    }
