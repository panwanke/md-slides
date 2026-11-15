"""Account + deck store HTTP API (library mode).

Everything here is owner-scoped through a signed-in session. The payload shape
of ``GET /api/decks/{id}`` and ``PUT /api/decks/{id}`` deliberately mirrors the
local ``/api/document`` contract, so the front end can swap stores without
touching the editor kernel.
"""

from __future__ import annotations

from html import escape
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel

from jc_slide_studio.document.parser import build_document_ast
from jc_slide_studio.render.engine import render_text
from jc_slide_studio.server.preview_scripts import CLICK_MAP_SCRIPT, EMBEDDED_STYLE
from jc_slide_studio.studio import assets
# Local runs keep SQLite; CloudRun switches to the CloudBase PG HTTP backend.
if os.environ.get("JC_STUDIO_BACKEND") == "cloudbase_pg":
    from jc_slide_studio.studio import service_pg as service
else:
    from jc_slide_studio.studio import service

router = APIRouter(prefix="/api")

SESSION_COOKIE = "jc_studio_session"
COOKIE_MAX_AGE = 30 * 24 * 3600


class Credentials(BaseModel):
    email: str
    password: str
    displayName: Optional[str] = None


class DeckCreate(BaseModel):
    title: str = "未命名演示稿"
    content: Optional[str] = None
    template: Optional[str] = None


class DeckSave(BaseModel):
    content: str
    baseRevision: int


class DeckRename(BaseModel):
    title: str


class ImportPayload(BaseModel):
    files: List[Dict[str, str]]


def current_user(request: Request) -> Dict[str, Any]:
    user = service.resolve_session(request.cookies.get(SESSION_COOKIE))
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    return user


def _session_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        path="/",
    )


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

@router.post("/auth/signup", status_code=201)
def signup(payload: Credentials, request: Request, response: Response):
    try:
        user = service.create_user(payload.email, payload.password, payload.displayName)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    _session_cookie(response, request, service.create_session(user["id"]))
    return {"ok": True, "user": user}


@router.post("/auth/login")
def login(payload: Credentials, request: Request, response: Response):
    user = service.authenticate(payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="邮箱或密码不正确")
    _session_cookie(response, request, service.create_session(user["id"]))
    return {"ok": True, "user": user}


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    service.delete_session(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me")
def me(user: Dict[str, Any] = Depends(current_user)):
    return {"ok": True, "user": user}


# ---------------------------------------------------------------------------
# Deck library
# ---------------------------------------------------------------------------

@router.get("/templates")
def list_templates():
    from jc_slide_studio.studio.starter_deck import TEMPLATES
    return {
        "ok": True,
        "templates": [
            {
                "id": key,
                "title": val["title"],
                "description": val["description"],
                "content": val["content"],
            }
            for key, val in TEMPLATES.items()
        ],
    }


@router.get("/decks")
def list_decks(user: Dict[str, Any] = Depends(current_user)):
    return {"ok": True, "decks": service.list_decks(user["id"])}


@router.post("/decks", status_code=201)
def create_deck(payload: DeckCreate, user: Dict[str, Any] = Depends(current_user)):
    from jc_slide_studio.studio.starter_deck import TEMPLATES
    content = payload.content
    title = payload.title
    if content is None:
        if payload.template and payload.template in TEMPLATES:
            tpl = TEMPLATES[payload.template]
            content = tpl["content"]
            if title == "未命名演示稿":
                title = tpl["title"]
            else:
                content = content.replace('title: "未命名演示稿"', f'title: "{title}"')
                content = content.replace('title: "学术研究与课题汇报"', f'title: "{title}"')
                content = content.replace('title: "新一代智能协作产品"', f'title: "{title}"')
        else:
            content = service.STARTER_CONTENT
    return {"ok": True, "deck": service.create_deck(user["id"], title, content)}


@router.post("/decks/import", status_code=201)
def import_decks(payload: ImportPayload, user: Dict[str, Any] = Depends(current_user)):
    """Batch-import local Markdown files; cloud becomes the source of truth."""
    if not payload.files or len(payload.files) > 50:
        raise HTTPException(status_code=400, detail="一次最多导入 50 个文件")
    created = service.import_decks(user["id"], payload.files)
    return {"ok": True, "count": len(created), "decks": created}


@router.get("/decks/{deck_id}/revisions")
def list_revisions(deck_id: int, user: Dict[str, Any] = Depends(current_user)):
    if not service.get_deck(user["id"], deck_id):
        raise HTTPException(status_code=404, detail="演示稿不存在")
    return {"ok": True, "revisions": service.list_revisions(user["id"], deck_id)}


@router.get("/decks/{deck_id}/preview", response_class=HTMLResponse)
def preview_deck(deck_id: int, embedded: int = 1, user: Dict[str, Any] = Depends(current_user)):
    """Render a stored deck straight into the preview iframe (same origin)."""
    result = service.get_deck_content(user["id"], deck_id)
    if not result:
        raise HTTPException(status_code=404, detail="演示稿不存在")
    _, content = result
    scripts = CLICK_MAP_SCRIPT + (EMBEDDED_STYLE if embedded else "")
    try:
        html_text, _ = render_text(content, extra_scripts=scripts)
    except ValueError as error:
        return HTMLResponse(
            '<meta charset="utf-8"><style>body{font:24px system-ui;padding:50px}</style>'
            f'<h2>预览暂时无法渲染</h2><code>{escape(str(error))}</code>',
            status_code=422,
        )
    # Inject <base> tag so relative image paths like images/fig.png hit deck assets
    base_tag = f'<base href="/api/decks/{deck_id}/assets/">'
    if "<head>" in html_text and "<base" not in html_text:
        html_text = html_text.replace("<head>", f"<head>\n    {base_tag}", 1)
    return HTMLResponse(content=html_text)


@router.get("/decks/{deck_id}/assets")
def list_assets(deck_id: int, user: Dict[str, Any] = Depends(current_user)):
    if not service.get_deck(user["id"], deck_id):
        raise HTTPException(status_code=404, detail="演示稿不存在")
    return {"ok": True, "assets": assets.list_deck_assets(deck_id)}


@router.get("/decks/{deck_id}/assets/{asset_path:path}")
def get_asset(deck_id: int, asset_path: str, user: Dict[str, Any] = Depends(current_user)):
    if not service.get_deck(user["id"], deck_id):
        raise HTTPException(status_code=404, detail="演示稿不存在")
    file_path = assets.get_deck_asset_path(deck_id, asset_path)
    if not file_path:
        raise HTTPException(status_code=404, detail="资源不存在")
    return FileResponse(file_path)


@router.post("/decks/{deck_id}/assets")
async def upload_assets(
    deck_id: int,
    request: Request,
    user: Dict[str, Any] = Depends(current_user),
):
    if not service.get_deck(user["id"], deck_id):
        raise HTTPException(status_code=404, detail="演示稿不存在")
    form = await request.form()
    saved: List[Dict[str, Any]] = []
    for key, value in form.multi_items():
        if hasattr(value, "filename") and hasattr(value, "read"):
            filename = getattr(value, "filename", "") or "file"
            content = await value.read()
            try:
                clean_name = assets.save_deck_asset(deck_id, filename, content)
                saved.append({
                    "path": clean_name,
                    "url": f"/api/decks/{deck_id}/assets/{clean_name}",
                    "size": len(content),
                })
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error))
    return {"ok": True, "saved": saved, "count": len(saved)}


@router.delete("/decks/{deck_id}/assets/{asset_path:path}")
def delete_asset(deck_id: int, asset_path: str, user: Dict[str, Any] = Depends(current_user)):
    if not service.get_deck(user["id"], deck_id):
        raise HTTPException(status_code=404, detail="演示稿不存在")
    if not assets.delete_deck_asset(deck_id, asset_path):
        raise HTTPException(status_code=404, detail="资源不存在")
    return {"ok": True}


@router.get("/decks/{deck_id}")
def get_deck(deck_id: int, user: Dict[str, Any] = Depends(current_user)):
    result = service.get_deck_content(user["id"], deck_id)
    if not result:
        raise HTTPException(status_code=404, detail="演示稿不存在")
    deck, content = result
    return {
        "ok": True,
        "source": deck["title"],
        "fullPath": f"deck://{deck_id}",
        "content": content,
        "revision": deck["revision"],
        "ast": build_document_ast(content, revision=deck["revision"]),
        "deck": deck,
    }


@router.put("/decks/{deck_id}")
def save_deck(deck_id: int, payload: DeckSave, user: Dict[str, Any] = Depends(current_user)):
    try:
        deck = service.save_deck(user["id"], deck_id, payload.content, payload.baseRevision)
    except service.ConflictError as error:
        raise HTTPException(status_code=409, detail=str(error))
    if not deck:
        raise HTTPException(status_code=404, detail="演示稿不存在")
    return {
        "ok": True,
        "revision": deck["revision"],
        "ast": build_document_ast(payload.content, revision=deck["revision"]),
        "deck": deck,
    }


@router.patch("/decks/{deck_id}")
def rename_deck(deck_id: int, payload: DeckRename, user: Dict[str, Any] = Depends(current_user)):
    deck = service.rename_deck(user["id"], deck_id, payload.title)
    if not deck:
        raise HTTPException(status_code=404, detail="演示稿不存在")
    return {"ok": True, "deck": deck}


@router.delete("/decks/{deck_id}")
def delete_deck(deck_id: int, user: Dict[str, Any] = Depends(current_user)):
    if not service.soft_delete_deck(user["id"], deck_id):
        raise HTTPException(status_code=404, detail="演示稿不存在")
    return {"ok": True}
