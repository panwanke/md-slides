"""Package generated decks without network dependencies or partial HTML writes."""

from __future__ import annotations

import base64
import html
from html.parser import HTMLParser
import json
import mimetypes
import os
from pathlib import Path
import re
import tempfile
from typing import Optional, Set
from urllib.parse import unquote, urlsplit

OFFLINE_FONTS = """
@font-face{font-family:'Noto Sans SC';src:local('Microsoft YaHei'),local('PingFang SC')}
@font-face{font-family:'Noto Serif SC';src:local('SimSun'),local('Songti SC')}
@font-face{font-family:'Inter';src:local('Arial')}
@font-face{font-family:'Playfair Display';src:local('Georgia')}
"""


class ResourceError(ValueError):
    """Expose missing dependencies to the watch loop without parsing error text."""

    def __init__(self, message: str, dependencies: Set[Path]):
        super().__init__(message)
        self.dependencies = set(dependencies)


def safe_json(value):
    """Encode JSON safely inside script elements, including speaker notes."""
    return (
        json.dumps(value, ensure_ascii=False)
        .replace("<", "\\u003c")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def atomic_write(path: Path | str, content: str) -> None:
    """Replace the output only after a complete successful write."""
    target_path = Path(path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=target_path.parent,
            prefix=".jc-build-",
            suffix=".tmp",
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            stream.write(content)
        os.replace(temporary, target_path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


class ResourcePacker:
    """Resolve local CSS imports and binary resources while tracking dependencies."""

    def __init__(self):
        self.dependencies: Set[Path] = set()
        self.cache = {}

    def resolve(self, reference: str, parent: Path | str) -> Optional[Path]:
        reference = html.unescape(reference.strip())
        if reference.startswith(("data:", "#", "http://", "https://")):
            return None
        parts = urlsplit(reference)
        if reference.startswith("//") or (parts.scheme and not re.match(r"^[A-Za-z]:[/\\]", reference)):
            raise ValueError(f"Unbundled remote resource {reference!r} referenced by {parent}")
        path = (Path(parent) / unquote(reference.split("#", 1)[0].split("?", 1)[0])).resolve()
        self.dependencies.add(path)
        if not path.is_file():
            raise ResourceError(f"Missing resource {path} (referenced by {parent})", self.dependencies)
        return path

    def data_url(self, reference: str, parent: Path | str) -> str:
        path = self.resolve(reference, parent)
        if path is None:
            return reference
        if path not in self.cache:
            mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if path.suffix.lower() == ".svg":
                svg = path.read_text(encoding="utf-8")
                svg = re.sub(
                    r'((?:xlink:)?href)=["\']([^"\']+)["\']',
                    lambda m: f'{m[1]}="{self.data_url(m[2], path.parent)}"',
                    svg,
                )
                svg = self.css(svg, path.parent)
                data = svg.encode("utf-8")
            else:
                data = path.read_bytes()
            self.cache[path] = f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"
        fragment = urlsplit(reference).fragment
        return self.cache[path] + ("#" + fragment if fragment else "")

    def css_file(self, path: Path | str, chain: tuple = ()) -> str:
        p = Path(path).resolve()
        self.dependencies.add(p)
        if p in chain:
            raise ValueError(f"Circular CSS import: {p}")
        if not p.is_file():
            raise ResourceError(f"Missing stylesheet: {p}", self.dependencies)
        text = p.read_text(encoding="utf-8")
        return self.css(text, p.parent, chain + (p,))

    def css(self, text: str, parent: Path | str, chain: tuple = ()) -> str:
        def replace_import(match):
            target = match.group(1) or match.group(2)
            try:
                resolved = self.resolve(target, parent)
                if resolved is None:
                    return match.group(0)
                return self.css_file(resolved, chain)
            except Exception:
                return match.group(0)

        text = re.sub(r'@import\s+(?:url\([\'"]?([^\'")]+)[\'"]?\)|[\'"]([^\'"]+)[\'"]);?', replace_import, text)

        def replace_url(match):
            prefix = match.group(1)
            target = match.group(2).strip('\'"')
            if target.startswith(("data:", "#", "http://", "https://")):
                return match.group(0)
            try:
                return f"{prefix}url('{self.data_url(target, parent)}')"
            except Exception:
                return match.group(0)

        return re.sub(r'([:\s])url\(([^)]+)\)', replace_url, text)


def package_document(document: str, base_dir: Path | str, asset_dir: Path | str) -> tuple[str, Set[Path]]:
    """Inlines scripts, stylesheets, and local images into a self-contained offline deck."""
    packer = ResourcePacker()
    base_path = Path(base_dir).resolve()
    asset_path = Path(asset_dir).resolve()

    def replace_stylesheet(match):
        href = match.group(1)
        # Check asset_dir first then base_path
        if href.startswith(("./", "../")) or not re.match(r"^[A-Za-z]:", href):
            target = (asset_path / href).resolve()
            if not target.is_file():
                target = (base_path / href).resolve()
        else:
            target = Path(href).resolve()

        if target.is_file():
            packed = packer.css_file(target)
            return f"<style>\n{packed}\n</style>"
        return match.group(0)

    # 1. Inline linked stylesheets
    document = re.sub(r'<link\s+[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\'][^>]*>', replace_stylesheet, document)

    # 2. Inline scripts
    def replace_script(match):
        src = match.group(1)
        if src.startswith(("./", "../")) or not re.match(r"^[A-Za-z]:", src):
            target = (asset_path / src).resolve()
            if not target.is_file():
                target = (base_path / src).resolve()
        else:
            target = Path(src).resolve()
        if target.is_file():
            packer.dependencies.add(target)
            script_text = target.read_text(encoding="utf-8")
            # Replace </script> inside script
            safe_script = script_text.replace("</script>", "<\\/script>")
            return f"<script>\n{safe_script}\n</script>"
        return match.group(0)

    document = re.sub(r'<script\s+[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script>', replace_script, document)

    # 3. Inline images and assets in styles
    def replace_img(match):
        attr = match.group(1)
        src = match.group(2)
        if src.startswith(("data:", "http://", "https://")):
            return match.group(0)
        try:
            return f'{attr}="{packer.data_url(src, base_path)}"'
        except Exception:
            return match.group(0)

    document = re.sub(r'(\bsrc)=["\']([^"\']+)["\']', replace_img, document)

    # 4. Pack embedded style tags
    def replace_style_tag(match):
        css_body = match.group(1)
        return f"<style>\n{packer.css(css_body, base_path)}\n</style>"

    document = re.sub(r'<style>([\s\S]*?)</style>', replace_style_tag, document)

    return document, packer.dependencies
