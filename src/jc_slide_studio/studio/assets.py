"""Asset (image and media) storage and retrieval for slide decks.

Every deck gets an isolated directory under ``~/.jc-slide-studio/assets/{deck_id}/``.
This allows markdown documents to use relative paths like ``![img](images/fig1.png)``
or ``![](assets/photo.jpg)`` both in live editing, iframe preview, and exported bundles.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import mimetypes

from jc_slide_studio.studio.db import data_dir

ALLOWED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico", ".tiff",
    ".mp4", ".webm", ".mp3", ".wav", ".pdf",
}


def get_deck_assets_dir(deck_id: int) -> Path:
    """Resolve and create the storage directory for a specific deck's assets."""
    target = data_dir() / "assets" / str(deck_id)
    target.mkdir(parents=True, exist_ok=True)
    return target


def _clean_path(relative_path: str) -> str:
    # Normalize separators and reject any directory traversal attempts
    cleaned = relative_path.replace("\\", "/").strip().lstrip("/")
    parts = []
    for segment in cleaned.split("/"):
        if segment in ("", "."):
            continue
        if segment == "..":
            raise ValueError("非法路径: 不允许包含父级目录引用 (..)")
        parts.append(segment)
    return "/".join(parts)


def save_deck_asset(deck_id: int, relative_path: str, data: bytes) -> str:
    """Save an asset byte payload under a clean relative path."""
    clean_rel = _clean_path(relative_path)
    if not clean_rel:
        raise ValueError("无效的资产路径")

    ext = Path(clean_rel).suffix.lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"不支持的媒体文件类型: {ext}")

    assets_root = get_deck_assets_dir(deck_id).resolve()
    target_file = (assets_root / clean_rel).resolve()

    # Safety check: ensure file stays within deck's assets folder
    if not target_file.is_relative_to(assets_root):
        raise ValueError("非法的文件路径越界")

    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_bytes(data)
    return clean_rel


def get_deck_asset_path(deck_id: int, relative_path: str) -> Optional[Path]:
    """Retrieve absolute path to an asset file if it exists safely."""
    clean_rel = _clean_path(relative_path)
    if not clean_rel:
        return None
    assets_root = get_deck_assets_dir(deck_id).resolve()
    target_file = (assets_root / clean_rel).resolve()
    if target_file.is_file() and target_file.is_relative_to(assets_root):
        return target_file
    return None


def list_deck_assets(deck_id: int) -> List[Dict[str, Any]]:
    """List all assets stored for the given deck."""
    assets_root = get_deck_assets_dir(deck_id).resolve()
    if not assets_root.is_dir():
        return []

    results: List[Dict[str, Any]] = []
    for file_path in assets_root.rglob("*"):
        if file_path.is_file():
            rel_path = file_path.relative_to(assets_root).as_posix()
            mime, _ = mimetypes.guess_type(file_path.name)
            results.append({
                "name": file_path.name,
                "path": rel_path,
                "size": file_path.stat().st_size,
                "mimeType": mime or "application/octet-stream",
                "url": f"/api/decks/{deck_id}/assets/{rel_path}",
            })
    results.sort(key=lambda item: item["path"].lower())
    return results


def delete_deck_asset(deck_id: int, relative_path: str) -> bool:
    """Delete a deck asset file. Returns True if deleted."""
    file_path = get_deck_asset_path(deck_id, relative_path)
    if file_path and file_path.is_file():
        file_path.unlink()
        return True
    return False
