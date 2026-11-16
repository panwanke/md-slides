"""Store media and the original Markdown directory for each deck."""

from __future__ import annotations

import mimetypes
import os
import posixpath
from pathlib import Path
from shutil import copyfileobj
from tempfile import NamedTemporaryFile
from typing import BinaryIO
from urllib.parse import quote

from jc_slide_studio.render.delivery import atomic_write
from jc_slide_studio.studio.db import data_dir

ALLOWED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".bmp", ".ico", ".tif", ".tiff",
    ".mp4", ".webm", ".mp3", ".wav", ".pdf",
}
DOCUMENT_DIRECTORY_FILE = ".document-directory"


def _asset_root(deck_id: int) -> Path:
    return data_dir() / "assets" / str(deck_id)


def _clean_path(relative_path: str) -> str:
    path = relative_path.replace("\\", "/")
    parts = [part for part in path.split("/") if part not in ("", ".")]
    if not parts or path.startswith("/") or any(
        part in ("..", DOCUMENT_DIRECTORY_FILE) or any(char in part for char in ":\0\r\n")
        for part in parts
    ):
        raise ValueError("Invalid relative asset path")
    return "/".join(parts)


def _document_directory(deck_id: int) -> str:
    metadata = _asset_root(deck_id) / DOCUMENT_DIRECTORY_FILE
    return metadata.read_text(encoding="utf-8") if metadata.is_file() else ""


def asset_url(deck_id: int, path: str = "") -> str:
    return f"/api/decks/{deck_id}/assets/{quote(path)}"


def asset_base_url(deck_id: int) -> str:
    directory = _document_directory(deck_id)
    return asset_url(deck_id, directory + "/" if directory else "")


def _target_path(deck_id: int, path: str) -> Path:
    root = _asset_root(deck_id).resolve()
    target = (root / _clean_path(path)).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Asset is outside the deck directory")
    return target


def _describe_asset(deck_id: int, path: str, size: int, directory: str) -> dict:
    return {
        "name": posixpath.basename(path),
        "path": posixpath.relpath("/" + path, "/" + directory),
        "size": size,
        "mimeType": mimetypes.guess_type(path)[0] or "application/octet-stream",
        "url": asset_url(deck_id, path),
    }


def _existing_media(path: Path) -> bool:
    if path.suffix:
        return path.suffix.lower() in ALLOWED_EXTENSIONS
    # Older uploads could be stored without a filename extension.
    return not path.name.startswith(".")


def save_deck_assets(
    deck_id: int, files: list[tuple[str, BinaryIO]], document_path: str | None = None
) -> list[dict]:
    """Save uploaded media. Folder imports use paths relative to the selected folder."""
    current_directory = _document_directory(deck_id)
    directory = current_directory
    if document_path is not None:
        directory = posixpath.dirname(_clean_path(document_path))
        if current_directory and directory != current_directory:
            raise ValueError("The deck already has a different document directory")

    pending = []
    for filename, stream in files:
        path = _clean_path(filename)
        extension = Path(path).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise ValueError(f"Unsupported media file type: {extension or filename}")
        if document_path is None:
            path = posixpath.join(directory, path)
        target = _target_path(deck_id, path)
        if target.is_dir() or any(parent.is_file() for parent in target.parents):
            raise ValueError(f"Asset path conflicts with an existing file or folder: {filename}")
        pending.append((path, target, stream))

    saved = []
    for path, target, stream in pending:
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with NamedTemporaryFile(dir=target.parent, prefix=".upload-", suffix=".tmp", delete=False) as output:
                temporary = Path(output.name)
                copyfileobj(stream, output)
                size = output.tell()
            os.replace(temporary, target)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        saved.append(_describe_asset(deck_id, path, size, directory))
    if directory != current_directory:
        atomic_write(_asset_root(deck_id) / DOCUMENT_DIRECTORY_FILE, directory)
    return saved


def get_deck_asset_path(deck_id: int, relative_path: str) -> Path | None:
    try:
        target = _target_path(deck_id, relative_path)
    except ValueError:
        return None
    if _existing_media(target) and target.is_file():
        return target
    return None


def list_deck_assets(deck_id: int) -> list[dict]:
    root = _asset_root(deck_id)
    directory = _document_directory(deck_id)
    results = []
    for file_path in root.rglob("*"):
        if _existing_media(file_path) and file_path.is_file():
            path = file_path.relative_to(root).as_posix()
            results.append(_describe_asset(deck_id, path, file_path.stat().st_size, directory))
    return sorted(results, key=lambda item: item["path"].casefold())


def delete_deck_asset(deck_id: int, relative_path: str) -> bool:
    file_path = get_deck_asset_path(deck_id, relative_path)
    if not file_path:
        return False
    try:
        file_path.unlink()
    except FileNotFoundError:
        return False
    return True
