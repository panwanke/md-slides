"""FastAPI application for preview and interactive editing."""

from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Optional, Set
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from md_slide_studio import __protocol_version__, __version__
from md_slide_studio.document.parser import build_document_ast, apply_source_patch, apply_node_patch
from md_slide_studio.providers.assets import default_provider
from md_slide_studio.render.engine import render_deck, render_text
from md_slide_studio.server.preview_scripts import HOT_RELOAD_SCRIPT
from md_slide_studio.server.api import router as studio_router

app = FastAPI(title="md-slide-studio", version=__version__)
app.include_router(studio_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active document state
class StudioState:
    def __init__(self):
        self.source_path: Optional[Path] = None
        self.revision: int = 1
        self.active_connections: Set[WebSocket] = set()

state = StudioState()


WORKBENCH_DIST = Path(__file__).resolve().parents[1] / "web_dist"
app.mount("/workbench", StaticFiles(directory=WORKBENCH_DIST, check_dir=False), name="workbench")


class ContentPayload(BaseModel):
    content: str


class RenderPayload(BaseModel):
    """Stateless render request: the server holds no document for this route."""

    content: str
    theme: Optional[str] = None


class PatchPayload(BaseModel):
    base_revision: Optional[int] = None
    node_id: Optional[str] = None
    value: Optional[str] = None
    start_offset: Optional[int] = None
    end_offset: Optional[int] = None
    replacement: Optional[str] = None


@app.post("/api/render")
async def render_document(payload: RenderPayload):
    """Render Markdown supplied in the request body, without any filesystem state.

    Unlike ``/api/document`` and ``/preview/*`` this route does not depend on
    ``state.source_path``. It exists so a document stored anywhere (a database,
    another machine, a future cloud store) can go through the identical engine.
    """
    try:
        html_text, info = render_text(payload.content, theme=payload.theme)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return {"ok": True, "html": html_text, **info}


@app.post("/api/patch")
async def patch_document(payload: PatchPayload):
    if not state.source_path or not state.source_path.is_file():
        raise HTTPException(status_code=400, detail="No source document loaded")

    current_content = state.source_path.read_text(encoding="utf-8")

    if payload.node_id is not None and payload.value is not None:
        try:
            new_content = apply_node_patch(current_content, payload.node_id, payload.value)
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
    elif payload.start_offset is not None and payload.end_offset is not None and payload.replacement is not None:
        try:
            new_content = apply_source_patch(current_content, payload.start_offset, payload.end_offset, payload.replacement)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        raise HTTPException(
            status_code=422,
            detail="Either (node_id, value) or (start_offset, end_offset, replacement) must be provided"
        )

    state.source_path.write_text(new_content, encoding="utf-8")
    state.revision += 1
    ast = build_document_ast(new_content, revision=state.revision)

    # Broadcast reload to all connected clients
    for ws in list(state.active_connections):
        try:
            await ws.send_json({"type": "RELOAD", "revision": state.revision})
        except Exception:
            state.active_connections.discard(ws)

    return {"ok": True, "revision": state.revision, "ast": ast, "content": new_content}


@app.get("/")
async def get_workbench():
    """Serve the bundled workbench without a Node process."""
    index = WORKBENCH_DIST / "index.html"
    if not index.is_file():
        return HTMLResponse("<p>Build the workbench with npm run build in web/.</p>", status_code=503)
    return FileResponse(index, headers={"Cache-Control": "no-cache"})


def _render_live_preview(*, embedded: bool = False):
    if not state.source_path or not state.source_path.is_file():
        return HTMLResponse("<h3>未指定演示稿文件或文件不存在</h3>", status_code=404)
    scripts = HOT_RELOAD_SCRIPT
    if embedded:
        scripts += "<style>.progress-bar{display:none}</style>"
    try:
        html_text, _ = render_deck(state.source_path, bundle=False, extra_scripts=scripts)
    except ValueError as error:
        message = escape(str(error))
        return HTMLResponse(
            '<meta charset="utf-8"><style>body{font:24px system-ui;padding:50px}'
            'code{white-space:pre-wrap}</style>'
            f'<h2>预览暂时无法渲染</h2><p>请检查 Markdown 语法。</p><code>{message}</code>{HOT_RELOAD_SCRIPT}',
            status_code=422,
        )
    return HTMLResponse(content=html_text)


@app.get("/preview/live", response_class=HTMLResponse)
async def get_live_preview():
    """Serve the presentation player with live reloading."""
    return _render_live_preview()


@app.get("/preview/workbench", response_class=HTMLResponse)
async def get_workbench_preview():
    """Keep navigation in the editor canvas independent of the presentation window."""
    return _render_live_preview(embedded=True)


@app.get("/preview/{resource_name:path}")
async def get_preview_resource(resource_name: str):
    """Serve document-relative files (images, data) and animation runtime modules."""
    # 1. Document relative assets (e.g. steps.svg, images)
    if state.source_path and state.source_path.parent:
        doc_res = (state.source_path.parent / resource_name).resolve()
        if doc_res.is_file() and doc_res.is_relative_to(state.source_path.parent.resolve()):
            return FileResponse(doc_res)

    # 2. FX runtime modules (e.g. _util.js, particle-burst.js)
    fx_file = default_provider.assets_dir / "animations" / "fx" / resource_name
    if fx_file.is_file():
        return FileResponse(fx_file)

    # 3. Bundled assets
    asset_file = default_provider.assets_dir / resource_name
    if asset_file.is_file():
        return FileResponse(asset_file)

    raise HTTPException(status_code=404, detail=f"Resource not found: {resource_name}")


@app.get("/api/doctor")
async def get_doctor():
    return {
        "protocolVersion": __protocol_version__,
        "ok": True,
        "version": __version__,
        "themes": default_provider.list_themes(),
        "source": str(state.source_path) if state.source_path else None,
        "statelessRender": True,
    }


@app.get("/api/document")
async def get_document():
    if not state.source_path or not state.source_path.is_file():
        raise HTTPException(status_code=404, detail="No source document loaded")
    content = state.source_path.read_text(encoding="utf-8")
    ast = build_document_ast(content, revision=state.revision)
    return {
        "source": state.source_path.name,
        "fullPath": str(state.source_path),
        "content": content,
        "revision": state.revision,
        "ast": ast,
    }


@app.put("/api/document")
async def update_document(payload: ContentPayload):
    if not state.source_path:
        raise HTTPException(status_code=400, detail="No source document loaded")
    state.source_path.write_text(payload.content, encoding="utf-8")
    state.revision += 1
    ast = build_document_ast(payload.content, revision=state.revision)

    # Broadcast reload to all connected clients
    for ws in list(state.active_connections):
        try:
            await ws.send_json({"type": "RELOAD", "revision": state.revision})
        except Exception:
            state.active_connections.discard(ws)

    return {"ok": True, "revision": state.revision, "ast": ast}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.active_connections.add(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        state.active_connections.discard(websocket)
    except Exception:
        state.active_connections.discard(websocket)


def set_active_source(path: Path | str):
    state.source_path = Path(path).resolve()
