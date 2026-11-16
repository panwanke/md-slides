"""Core HTML rendering engine for jc-slide-studio."""

from __future__ import annotations

import html
from pathlib import Path
import re
import textwrap
from typing import Any, Dict, List, Optional, Tuple

from md_slide_studio.document.parser import (
    IMAGE_MARKDOWN,
    parse_front_matter,
    strip_workspace,
    split_slides_with_ranges,
    parse_slide_meta,
    stable_slide_id,
)
from md_slide_studio.providers.assets import default_provider
from md_slide_studio.render.delivery import atomic_write, package_document, OFFLINE_FONTS
from md_slide_studio.render.navigation import collect_chapters, render_navigation, render_toc

CSS = """
/* ---- jc-slide-studio scoped styles ---- */
.jc-deck .slide{justify-content:flex-start;padding:56px 64px 72px}
.jc-body{width:100%;max-width:1180px;margin:0 auto}
.jc-body h2{font-size:clamp(26px,3vw,42px);margin:0 0 .5em;line-height:1.15}
.jc-body h3{font-size:clamp(18px,1.7vw,24px);margin:1.1em 0 .35em;color:var(--text-2)}
.jc-body ul,.jc-body ol{margin:.2em 0 .6em;padding-left:1.15em}
.jc-body li{margin:.42em 0;font-size:clamp(16px,1.35vw,22px);line-height:1.5}
.jc-body li::marker{color:var(--accent)}
.jc-body p{font-size:clamp(15px,1.25vw,20px);line-height:1.6;color:var(--text-2);max-width:78ch}
.jc-body code{background:var(--bg-soft);padding:.1em .35em;border-radius:3px}
.jc-body table{border-collapse:collapse;width:100%;font-size:clamp(13px,1.1vw,18px)}
.jc-body th,.jc-body td{border:1px solid var(--border);padding:.45em .7em;text-align:left}
.jc-body th{background:var(--surface-2);font-weight:700}
.jc-body blockquote{margin:.3em 0 .7em;padding:.5em 0 .5em 1em;
  border-left:3px solid var(--accent);font-size:clamp(18px,1.7vw,26px);line-height:1.45;color:var(--text-1)}
.jc-body pre{background:var(--bg-soft);padding:.8em 1em;overflow:auto;font-size:14px}

/* columns */
.jc-cols{display:grid;grid-template-columns:1.05fr .95fr;gap:36px;align-items:start}
.jc-cols.jc-nogrid{grid-template-columns:1fr}
.jc-figbox{margin:0}
.jc-figbox img{width:100%;max-height:62vh;object-fit:contain;
  border:1px solid var(--border);background:var(--surface);padding:6px}
.jc-figbox figcaption{margin-top:.5em;font-size:clamp(12px,1vw,16px);color:var(--text-3);line-height:1.4}
.jc-figure-page .jc-figbox img{max-height:60vh}
.jc-figure-page .jc-figbox{margin:0 auto;text-align:center;max-width:1000px}

/* box container */
.jc-box{margin:.8em 0;padding:.75em 1em;border:1px solid var(--border);
  border-left:4px solid var(--accent);background:var(--surface-2)}
.jc-box .jc-box-t{font-weight:700;margin-bottom:.3em;color:var(--text-1)}

/* cover */
.jc-cover{justify-content:center!important;text-align:left}
.jc-cover-in{max-width:1080px}
.jc-cover .jc-title{font-size:clamp(28px,3.6vw,54px);line-height:1.12;margin:.25em 0}
.jc-cover .jc-title-zh{font-size:clamp(16px,1.5vw,24px);color:var(--text-2);margin:.4em 0 1em}
.jc-cover .jc-authors{font-size:clamp(14px,1.2vw,19px);color:var(--text-1);margin:.2em 0}
.jc-cover .jc-journal{font-size:clamp(13px,1.1vw,17px);color:var(--text-3);margin:.15em 0}
.jc-cover .jc-presenter{margin-top:2em;padding-top:1em;border-top:1px solid var(--border);
  font-size:clamp(14px,1.2vw,19px);color:var(--text-1)}
.jc-cover .jc-presenter span{display:block;color:var(--text-3);font-size:.85em;margin-top:.25em}
.jc-cover .jc-presenter a{color:var(--accent)}

/* journal metrics */
.jc-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:.4em 0 .8em}
.jc-metric{border:1px solid var(--border);background:var(--surface);padding:.7em .9em}
.jc-metric .jc-ml{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3)}
.jc-metric b{font-size:clamp(15px,1.3vw,21px);font-weight:700;color:var(--text-1);word-break:break-word}
.jc-src{font-size:12px;color:var(--text-3);margin-top:.4em}

/* section divider */
.jc-section{justify-content:center!important;text-align:center}
.jc-section .jc-body h2{font-size:clamp(32px,4.4vw,64px);margin:0}
.jc-section .jc-body{text-align:center}

/* quote page */
.jc-quote .jc-body blockquote{font-size:clamp(20px,2.3vw,36px);max-width:24ch;max-width:900px}

/* end page */
.jc-end .jc-body h2{margin-bottom:.6em}
.jc-math-block{margin:.8em 0;text-align:center;font-size:clamp(18px,1.8vw,26px)}
.deck-footer{display:flex;justify-content:space-between;width:100%;
  padding:0 64px 20px;font-size:12px;color:var(--text-3);position:absolute;bottom:0;left:0}
.jc-cover .deck-footer,.jc-section .deck-footer{display:flex}

@media (max-width:900px){
  .jc-cols{grid-template-columns:1fr;gap:18px}
  .jc-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
  .jc-deck .slide{padding:36px 28px 64px}
  .deck-footer{padding:0 28px 16px}
}
@media print{
  .jc-deck .slide{page-break-after:always;height:100vh}
}
"""

HEAD_TEMPLATE = """<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
{favicon_tag}
{katex_styles}
<style>
{fonts_css}
{base_css}
{anim_css}
{theme_css}
{nav_css}
{custom_css}
</style>
</head>
<body class="jc-deck">
<div class="deck">
"""

KATEX_CDN_STYLES = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">'
KATEX_CDN_SCRIPTS = """
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
"""
KATEX_SCRIPT = """
<script>
(function() {
  function tryRender() {
    if (typeof renderMathInElement === "function") {
      renderMathInElement(document.body, {
        delimiters: [
          {left: "$$", right: "$$", display: true},
          {left: "$", right: "$", display: false},
          {left: "\\(", right: "\\)", display: false},
          {left: "\\[", right: "\\]", display: true}
        ],
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
        throwOnError: false
      });
      return true;
    }
    return false;
  }
  if (!tryRender()) {
    var count = 0;
    var timer = setInterval(function() {
      count++;
      if (tryRender() || count > 50) clearInterval(timer);
    }, 100);
  }
  window.addEventListener("load", tryRender);
  window.addEventListener("hashchange", function() { setTimeout(tryRender, 50); });
})();
</script>
"""

TAIL_TEMPLATE = """
</div>
<script>
{runtime_js}
{fx_js}
{nav_js}
</script>
{katex_script}
{extra_scripts}
</body>
</html>
"""


INLINE_LITERAL = re.compile(r"`([^`]+)`|" + IMAGE_MARKDOWN.pattern)


def inline(s: str) -> str:
    math_tokens: List[str] = []
    literal_tokens: List[str] = []

    def save_math(match: re.Match) -> str:
        math_tokens.append(match.group(0))
        return f"\x00MATH_{len(math_tokens)-1}\x00"

    # Protect $$...$$ and $...$ from markdown alterations
    s = re.sub(r"(\$\$[\s\S]+?\$\$|(?<!\\)\$(?!\s)[^$\n]+?(?<!\s)(?<!\\)\$)", save_math, s)

    def save_literal(match: re.Match) -> str:
        code, alt, angle_src, bare_src, title = match.groups()
        if code is not None:
            literal_tokens.append(f"<code>{html.escape(code, quote=False)}</code>")
        else:
            literal_tokens.append('<img src="%s" alt="%s" title="%s" class="jc-inline">' % (
                html.escape(angle_src or bare_src, quote=True),
                html.escape(alt, quote=True),
                html.escape(title or "", quote=True),
            ))
        return f"\x00LITERAL_{len(literal_tokens)-1}\x00"

    s = html.escape(INLINE_LITERAL.sub(save_literal, s), quote=False)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", s)

    def render_link(match):
        label, destination = match.groups()
        attributes = "" if destination.startswith("#") else ' target="_blank" rel="noreferrer"'
        return '<a href="%s"%s>%s</a>' % (html.escape(html.unescape(destination), quote=True), attributes, label)

    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", render_link, s)

    for idx, token in enumerate(literal_tokens):
        s = s.replace(f"\x00LITERAL_{idx}\x00", token)

    for idx, token in enumerate(math_tokens):
        escaped_token = html.escape(token, quote=False)
        s = s.replace(f"\x00MATH_{idx}\x00", escaped_token)

    return s


def split_row(row: str) -> List[str]:
    return [c.strip() for c in row.strip().strip("|").split("|")]


def parse_blocks(text: str) -> List[Dict[str, Any]]:
    lines = text.splitlines()
    blocks = []
    i = 0
    while i < len(lines):
        raw = lines[i]
        s = raw.strip()
        if not s:
            i += 1
            continue

        m = re.match(r"^:::\s*(\w+)?\s*(.*)$", s)
        if m:
            kind = (m.group(1) or "box").lower()
            arg = m.group(2).strip()
            i += 1
            buf = []
            depth = 1
            fenced = False
            while i < len(lines):
                line = lines[i].strip()
                if line.startswith("```"):
                    fenced = not fenced
                if not fenced and line.startswith(":::"):
                    depth += -1 if line == ":::" else 1
                    if depth == 0:
                        break
                buf.append(lines[i])
                i += 1
            if depth:
                raise ValueError(f"Unclosed container: {kind}")
            i += 1
            blocks.append({"type": "container", "kind": kind, "arg": arg, "content": "\n".join(buf)})
            continue

        if re.match(r"^\+{3,}\s*$", s):
            i += 1
            continue

        if s.startswith("$$"):
            if s.endswith("$$") and len(s) > 2:
                blocks.append({"type": "math", "text": s[2:-2].strip()})
                i += 1
                continue
            buf = [s[2:].strip()] if len(s) > 2 else []
            i += 1
            while i < len(lines) and not lines[i].strip().endswith("$$"):
                buf.append(lines[i])
                i += 1
            if i < len(lines):
                end_s = lines[i].strip()
                if len(end_s) > 2:
                    buf.append(end_s[:-2].strip())
                i += 1
            blocks.append({"type": "math", "text": "\n".join(x for x in buf if x)})
            continue

        if s.startswith("```"):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            blocks.append({"type": "code", "text": "\n".join(buf)})
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", s)
        if m:
            blocks.append({"type": "heading", "level": len(m.group(1)), "text": m.group(2).strip()})
            i += 1
            continue

        m = IMAGE_MARKDOWN.fullmatch(s)
        if m:
            alt, angle_src, bare_src, caption = m.groups()
            blocks.append({"type": "image", "alt": alt, "src": angle_src or bare_src, "cap": caption or ""})
            i += 1
            continue

        if s.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:\-\|]+\|?$", lines[i + 1].strip()):
            header = split_row(s)
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i].strip()))
                i += 1
            blocks.append({"type": "table", "header": header, "rows": rows})
            continue

        if re.match(r"^(?:[-*+]\s+|\d+\.\s+)", s):
            ordered = bool(re.match(r"^\d+\.\s+", s))
            items = []
            children = []
            base_indent = len(raw) - len(raw.lstrip())
            while i < len(lines):
                st = lines[i].strip()
                indentation = len(lines[i]) - len(lines[i].lstrip())
                if st and indentation > base_indent and items:
                    children[-1].append(lines[i])
                    i += 1
                    continue
                mm = re.match(r"^(?:[-*+]\s+|\d+\.\s+)(.*)$", st)
                if not mm:
                    if items and st and lines[i][:1] in (" ", "\t"):
                        items[-1] += " " + st
                        i += 1
                        continue
                    break
                items.append(mm.group(1))
                children.append([])
                i += 1
            blocks.append({"type": "list", "ordered": ordered, "items": items, "children": children})
            continue

        if s.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            blocks.append({"type": "quote", "text": " ".join(x for x in buf if x.strip())})
            continue

        buf = []
        while i < len(lines):
            st = lines[i].strip()
            if (
                not st
                or st.startswith(("#", ">", "|", ":::", "```", "$$"))
                or re.match(r"^(?:[-*+]\s+|\d+\.\s+|!\[|\+{3,}\s*$)", st)
            ):
                break
            buf.append(st)
            i += 1
        if buf:
            blocks.append({"type": "para", "text": " ".join(buf)})
        else:
            i += 1
    return blocks


def figure_html(src: str, alt: str, cap: str) -> str:
    cap_html = f"<figcaption>{inline(cap)}</figcaption>" if cap else ""
    return '<figure class="jc-figbox"><img src="%s" alt="%s">%s</figure>' % (
        html.escape(src, quote=True),
        html.escape(alt or "", quote=True),
        cap_html,
    )


def render_blocks(blocks: List[Dict[str, Any]], skip_images: bool = False) -> str:
    out = []
    for b in blocks:
        t = b["type"]
        if t == "heading":
            lvl = min(6, max(2, b["level"] + 1))
            out.append(f"<h{lvl}>{inline(b['text'])}</h{lvl}>")
        elif t == "list":
            tag = "ol" if b["ordered"] else "ul"
            entries = []
            for index, item in enumerate(b["items"]):
                children = b.get("children", [])[index] if b.get("children") else []
                nested = "".join(render_blocks(parse_blocks(textwrap.dedent("\n".join(children))))) if children else ""
                entries.append(f"<li>{inline(item)}{nested}</li>")
            out.append(f"<{tag}>{''.join(entries)}</{tag}>")
        elif t == "para":
            out.append(f"<p>{inline(b['text'])}</p>")
        elif t == "quote":
            out.append(f"<blockquote>{inline(b['text'])}</blockquote>")
        elif t == "code":
            out.append(f"<pre><code>{html.escape(b['text'])}</code></pre>")
        elif t == "table":
            th = "".join(f"<th>{inline(c)}</th>" for c in b["header"])
            tr = "".join(
                f"<tr>{''.join(f'<td>{inline(c)}</td>' for c in row)}</tr>" for row in b["rows"]
            )
            out.append(f"<table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>")
        elif t == "math":
            out.append(f'<div class="jc-math-block">$${html.escape(b["text"], quote=False)}$$</div>')
        elif t == "image":
            if skip_images:
                continue
            out.append(figure_html(b["src"], b["alt"], b["cap"]))
        elif t == "container":
            if b["kind"] == "notes":
                continue
            inner = render_blocks(parse_blocks(b["content"]))
            if b["kind"] == "fragment":
                options = dict(re.findall(r"([\w-]+)=([^\s]+)", b["arg"]))
                step = options.get("step", "")
                effect = options.get("effect", "fade")
                if not step.isdigit() or int(step) < 1 or effect not in ("none", "fade", "fade-up"):
                    raise ValueError("Fragments require a positive step and effect=none|fade|fade-up")
                out.append(f'<div class="deck-fragment" data-step="{step}" data-effect="{effect}">{"".join(inner)}</div>')
                continue
            head = f'<div class="jc-box-t">{inline(b["arg"])}</div>' if b["arg"] else ""
            out.append(f'<div class="jc-box">{head}{"".join(inner)}</div>')
    return "".join(out)


def infer_layout(blocks: List[Dict[str, Any]]) -> str:
    kinds = {b["type"] for b in blocks}
    if "table" in kinds:
        return "table"
    if "image" in kinds:
        if len([b for b in blocks if b["type"] in ("list", "para", "heading", "quote", "container")]) > 1:
            return "two-col"
        return "figure"
    if "list" in kinds:
        return "bullets"
    return "bullets"


def render_layout(layout: str, body: List[Dict[str, Any]], meta: Dict[str, Any], navigation: Any = None, slide_index: int = 1) -> str:
    sub = meta.get("md_slide") or meta.get("slides") or meta.get("jc")
    jc = sub if isinstance(sub, dict) else meta
    g = lambda k, d="": (jc.get(k) or d) if isinstance(jc, dict) else d

    if layout == "cover":
        date = g("date", "")
        doi = g("doi", "")
        doi_html = (
            f' · DOI <a href="https://doi.org/{doi}" target="_blank" rel="noreferrer">{doi}</a>'
            if doi
            else ""
        )
        zh = g("title_zh", "")
        parts = ['<div class="jc-cover-in">']
        kicker = g("kicker", "JOURNAL CLUB")
        parts.append(f'<p class="kicker">{html.escape(kicker)} · {html.escape(date)}</p>')
        parts.append(f'<h1 class="h1 jc-title">{inline(g("title", "Untitled"))}</h1>')
        if zh:
            parts.append(f'<p class="lede jc-title-zh">{inline(zh)}</p>')
        parts.append(f'<p class="jc-authors">{inline(g("authors", ""))}</p>')
        meta_line = " · ".join(x for x in [g("journal", ""), str(g("year", "")), g("lab", "")] if x)
        parts.append(f'<p class="jc-journal">{inline(meta_line)}{doi_html}</p>')
        pres = g("presenter", "")
        if pres:
            parts.append(
                f'<div class="jc-presenter">汇报人 · {inline(pres)}<span>{inline(g("presenter_affil", ""))}</span></div>'
            )
        parts.append("</div>")
        extra = render_blocks([b for b in body if b["type"] != "heading"])
        return "".join(parts) + extra

    if layout == "journal":
        doi = g("doi", "")
        doi_val = (
            f'<a href="https://doi.org/{doi}" target="_blank" rel="noreferrer">{html.escape(doi)}</a>'
            if doi
            else "—"
        )
        cards = [
            ("期刊", g("journal", "—")),
            ("年份", str(g("year", "—"))),
            ("影响因子", g("impact_factor", "未确认")),
            ("分区", g("jcr_quartile", "未确认")),
            ("出版社", g("publisher", "—")),
            ("DOI", doi_val),
        ]
        html_cards = "".join(
            f'<div class="jc-metric"><span class="jc-ml">{html.escape(k)}</span><b>{v}</b></div>'
            for k, v in cards
        )
        out = ['<h2>期刊与基本信息</h2>', f'<div class="jc-metrics">{html_cards}</div>']
        src = g("metrics_source", "")
        if src:
            out.append(f'<p class="jc-src">指标来源：{inline(src)}</p>')
        out.append(render_blocks([b for b in body if b["type"] != "heading"]))
        return "".join(out)

    if layout == "toc" and navigation:
        return render_blocks(body) + render_toc(navigation)

    if layout == "section" and navigation:
        chapter = navigation["pages"][slide_index]
        return '<div class="jc-chapter-kicker">%02d / %02d</div>%s' % (
            chapter["number"], len(navigation["chapters"]), render_blocks(body))

    if layout == "two-col":
        imgs = [b for b in body if b["type"] == "image"]
        rest = [b for b in body if b["type"] != "image"]
        left = render_blocks(rest)
        right = figure_html(imgs[0]["src"], imgs[0]["alt"], imgs[0]["cap"]) if imgs else ""
        if len(imgs) > 1:
            right += "".join(figure_html(b["src"], b["alt"], b["cap"]) for b in imgs[1:])
        cls = "jc-cols" if right else "jc-cols jc-nogrid"
        return f'<div class="{cls}"><div>{left}</div><div>{right}</div></div>'

    if layout == "figure":
        imgs = [b for b in body if b["type"] == "image"]
        rest = [b for b in body if b["type"] != "image"]
        return render_blocks(rest) + "".join(figure_html(b["src"], b["alt"], b["cap"]) for b in imgs)

    return render_blocks(body)


def render_slide(raw_slide: str, meta: Dict[str, Any], idx: int, total: int, navigation: Any = None) -> Tuple[str, str, Dict[str, str]]:
    smeta, body_text = parse_slide_meta(raw_slide)
    has_column_split = bool(re.search(r"^[ \t]*\+{3,}[ \t]*$", body_text, re.M))
    layout = (smeta.get("layout") or ("two-col" if has_column_split else infer_layout(parse_blocks(body_text)))).lower()

    if layout == "two-col" and has_column_split:
        col_parts = re.split(r"^[ \t]*\+{3,}[ \t]*$", body_text, maxsplit=1, flags=re.M)
        left_blocks = parse_blocks(col_parts[0])
        right_blocks = parse_blocks(col_parts[1])
        all_blocks = left_blocks + right_blocks
        notes_blocks = [b for b in all_blocks if b["type"] == "container" and b["kind"] == "notes"]
        left_body = [b for b in left_blocks if not (b["type"] == "container" and b["kind"] == "notes")]
        right_body = [b for b in right_blocks if not (b["type"] == "container" and b["kind"] == "notes")]
        body = list(left_body) + list(right_body)

        header_html = ""
        if left_body and left_body[0]["type"] == "heading":
            h = left_body.pop(0)
            lvl = min(6, max(2, h["level"] + 1))
            header_html = f"<h{lvl}>{inline(h['text'])}</h{lvl}>"

        left_html = render_blocks(left_body)
        right_html = render_blocks(right_body)
        inner = f'{header_html}<div class="jc-cols"><div>{left_html}</div><div>{right_html}</div></div>'
    else:
        blocks = parse_blocks(body_text)
        notes_blocks = [b for b in blocks if b["type"] == "container" and b["kind"] == "notes"]
        body = [b for b in blocks if not (b["type"] == "container" and b["kind"] == "notes")]
        inner = render_layout(layout, body, meta, navigation, idx)

    deck_sub = meta.get("md_slide") or meta.get("slides") or meta.get("jc") or {}
    if not isinstance(deck_sub, dict):
        deck_sub = {}

    if layout == "cover":
        title = deck_sub.get("title") or meta.get("title") or "Untitled"
    else:
        title = next((b["text"] for b in body if b["type"] == "heading"), "")
    dtitle = smeta.get("title") or title or f"Slide {idx}"

    cls = ["slide", f"jc-{layout}"]
    chapter = navigation["pages"].get(idx) if navigation else None
    if chapter:
        cls.append("jc-has-chapters")
    if smeta.get("class"):
        cls.append(smeta["class"])

    attrs = [f'class="{" ".join(cls)}"', f'data-title="{html.escape(dtitle, quote=True)}"']
    identifier = stable_slide_id(smeta, idx)
    attrs.append(f'data-slide-id="{identifier}"')

    transition = smeta.get("transition", "fade")
    if transition not in ("none", "fade", "slide"):
        raise ValueError(f"Unknown transition: {transition}")
    attrs.append(f'data-transition="{transition}"')

    if smeta.get("reveal"):
        attrs.append('data-reveal="items"')
    if chapter:
        attrs.append(f'data-chapter="{chapter["id"]}"')
        if layout == "section":
            attrs.append(f'id="chapter-{chapter["id"]}"')
    if smeta.get("bg"):
        attrs.append(f'style="background:{smeta["bg"]}"')

    anim = f' data-anim="{html.escape(smeta["anim"], quote=True)}"' if smeta.get("anim") else ""
    fx = (
        f'<div data-fx="{html.escape(smeta["fx"], quote=True)}" style="position:absolute;inset:0;pointer-events:none;z-index:0"></div>'
        if smeta.get("fx")
        else ""
    )

    notes_html = ""
    if notes_blocks:
        inner_html = "".join(render_blocks(parse_blocks(b["content"])) for b in notes_blocks)
        notes_html = f'<aside class="notes">{inner_html}</aside>'

    footer_text = deck_sub.get("footer") or deck_sub.get("presenter") or meta.get("presenter") or "md-slides"
    footer = (
        f'<div class="deck-footer"><span>{html.escape(footer_text)}</span>'
        f'<span class="slide-number" data-current="{idx}" data-total="{total}"></span></div>'
    )

    chapter_bar = render_navigation(navigation, idx, deck_sub.get("lang") or meta.get("lang") or "zh") if navigation else ""

    slide_html = (
        f'<section {" ".join(attrs)}>\n'
        f'{fx}<div class="jc-body"{anim}>{inner}</div>\n'
        f'{notes_html}{footer}{chapter_bar}\n</section>'
    )
    return slide_html, layout, smeta


def render_text(
    content: str,
    *,
    theme: Optional[str] = None,
    extra_scripts: str = "",
    stem: str = "deck",
    standalone: bool = False,
) -> Tuple[str, Dict[str, Any]]:
    """Render Markdown *content* into a complete HTML presentation.

    Stateless counterpart of :func:`render_deck`: it never touches the filesystem,
    so the very same pipeline can serve a local file, a database row or a request
    body. With ``standalone`` the player dependencies are inlined. Document
    images still need a document-relative resolver.

    Returns ``(html, info)`` where ``info`` carries ``slideCount``, ``title`` and
    ``theme`` for callers that need metadata without re-parsing the Markdown.
    """
    meta, body_after_fm, _ = parse_front_matter(content)
    slides_body, _ = strip_workspace(body_after_fm)
    raw_slides = [s["raw"] for s in split_slides_with_ranges(slides_body)]
    total = len(raw_slides)

    # Resolve navigation
    try:
        navigation = collect_chapters(raw_slides)
    except Exception:
        navigation = None

    rendered_slides = []
    for idx, slide_raw in enumerate(raw_slides, 1):
        s_html, _, _ = render_slide(slide_raw, meta, idx, total, navigation)
        rendered_slides.append(s_html)

    # Theme selection
    deck_sub = meta.get("md_slide") or meta.get("slides") or meta.get("jc") or {}
    if not isinstance(deck_sub, dict):
        deck_sub = {}
    chosen_theme = theme or deck_sub.get("theme") or meta.get("theme") or "academic-paper"
    title = deck_sub.get("title") or meta.get("title") or stem
    theme_css = default_provider.get_theme_css(chosen_theme)
    base_css = default_provider.get_base_css()
    fonts_css = default_provider.get_fonts_css()
    anim_css, fx_js = default_provider.get_animation_assets()
    nav_css, nav_js = default_provider.get_navigation_assets()
    if standalone:
        math_css, math_js = default_provider.get_bundled_math()
        katex_styles = f"<style>{math_css}</style>"
        katex_scripts = "<script>" + math_js.replace("</script", "<\\/script") + "</script>"
        fx_js = default_provider.get_bundled_effects() + "\n" + fx_js
        fonts_css = OFFLINE_FONTS
    else:
        katex_styles = KATEX_CDN_STYLES
        katex_scripts = KATEX_CDN_SCRIPTS
    runtime_js = default_provider.get_runtime_js().replace("</script", "<\\/script")
    fx_js = fx_js.replace("</script", "<\\/script")
    nav_js = nav_js.replace("</script", "<\\/script")

    head = HEAD_TEMPLATE.format(
        lang=deck_sub.get("lang") or meta.get("lang") or "zh",
        title=title,
        favicon_tag=default_provider.get_favicon_tag(),
        katex_styles=katex_styles,
        fonts_css=fonts_css or OFFLINE_FONTS,
        base_css=base_css,
        anim_css=anim_css,
        theme_css=theme_css,
        nav_css=nav_css,
        custom_css=CSS,
    )
    tail = TAIL_TEMPLATE.format(
        runtime_js=runtime_js,
        fx_js=fx_js,
        nav_js=nav_js,
        katex_script=katex_scripts + KATEX_SCRIPT,
        extra_scripts=extra_scripts,
    )

    full_html = head + "\n".join(rendered_slides) + tail
    info = {"slideCount": total, "title": title, "theme": chosen_theme}
    return full_html, info


def render_deck(
    source_path: Path | str,
    out_dir: Optional[Path | str] = None,
    filename: Optional[str] = None,
    theme: Optional[str] = None,
    bundle: bool = True,
    extra_scripts: str = "",
) -> Tuple[str, Optional[Path]]:
    """Render a Markdown presentation file to complete HTML."""
    path = Path(source_path).resolve()
    text = path.read_text(encoding="utf-8")
    full_html, _ = render_text(text, theme=theme, extra_scripts=extra_scripts, stem=path.stem)

    out_file = None
    if out_dir:
        out_path = Path(out_dir).resolve()
        out_path.mkdir(parents=True, exist_ok=True)
        target_name = filename or f"{path.stem}_rendered.html"
        out_file = out_path / target_name

        if bundle:
            standalone_html, _ = render_text(
                text, theme=theme, extra_scripts=extra_scripts, stem=path.stem, standalone=True,
            )
            bundled_html, _ = package_document(
                standalone_html, base_dir=path.parent, asset_dir=default_provider.assets_dir,
            )
            atomic_write(out_file, bundled_html)
        else:
            atomic_write(out_file, full_html)

    return full_html, out_file
