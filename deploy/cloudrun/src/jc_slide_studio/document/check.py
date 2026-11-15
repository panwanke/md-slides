"""Slide syntax and semantic validation for jc-slide-studio."""

from __future__ import annotations

from pathlib import Path
import re
from typing import Any, Dict, List

from jc_slide_studio.document.parser import (
    parse_front_matter,
    strip_workspace,
    split_slides_with_ranges,
    parse_slide_meta,
    stable_slide_id,
)

TODO_RE = re.compile(r"TODO|待补|待确认|待写|XXX|\?\?\?", re.I)


def check_slide_deck(source_path: Path | str) -> Dict[str, Any]:
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

    for idx, s in enumerate(slides, 1):
        smeta, body = parse_slide_meta(s["raw"])
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
        for img_match in re.finditer(r"!\[([^\]]*)\]\(([^)\s]+)", body):
            img_src = img_match.group(2)
            if not img_src.startswith(("http://", "https://", "data:")):
                img_path = (path.parent / img_src).resolve()
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
