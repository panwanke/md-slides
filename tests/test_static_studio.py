"""Static-studio (mode A) verification.

The bundle test runs whenever `npm run build:static` has produced engine-bundle.json.
The browser test is opt-in because it boots a 10 MB WebAssembly runtime:

    JC_TEST_STATIC=1 pytest tests/test_static_studio.py -q
"""

import json
import os
import subprocess
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
BUNDLE = WEB / "static-public" / "engine-bundle.json"
DIST = WEB / "dist-static"

SAMPLE = "# A\n\n---\n\n# B"


def test_engine_bundle_is_self_contained(tmp_path):
    """The packed files alone can import render_text, with byte-identical output."""
    if not BUNDLE.is_file():
        pytest.skip("run `npm run build:static` first")

    bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
    assert len(bundle["themes"]) >= 30, "themes should be packed from providers/assets"

    for relative, content in bundle["files"].items():
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        # Write raw bytes: write_text() on Windows rewrites \n to \r\n, which
        # would change the packed CSS and break the byte-for-byte comparison.
        target.write_bytes(content.encode("utf-8"))

    probe = """
import sys, json, pathlib
root = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(root))
from jc_slide_studio.render import engine
assert pathlib.Path(engine.__file__).resolve().is_relative_to(root.resolve()), engine.__file__
from jc_slide_studio.render.engine import render_text
html, info = render_text('# A\\n\\n---\\n\\n# B', theme='academic-paper')
print(json.dumps({'html': html, 'slideCount': info['slideCount']}))
"""
    result = subprocess.run(
        [sys.executable, "-c", probe, str(tmp_path)],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(result.stdout)
    assert payload["slideCount"] == 2

    from jc_slide_studio.render.engine import render_text

    expected, _ = render_text(SAMPLE, theme="academic-paper")
    assert payload["html"] == expected, "browser engine output must match the CLI byte for byte"


@pytest.mark.skipif(
    os.environ.get("JC_TEST_STATIC") != "1",
    reason="opt-in: boots Pyodide in a browser (JC_TEST_STATIC=1)",
)
def test_static_studio_renders_in_browser():
    if not (DIST / "studio.html").is_file():
        pytest.skip("run `npm run build:static` first")

    from playwright.sync_api import sync_playwright

    handler = partial(SimpleHTTPRequestHandler, directory=str(DIST))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page()
            page_errors = []
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{port}/studio.html")
            page.wait_for_function(
                "document.body.innerText.includes('就绪')",
                timeout=180_000,
            )
            frame = page.frame_locator("iframe.studio-preview")
            assert frame.locator("section.slide").count() >= 3
            assert "渲染失败" not in page.locator(".studio-status").inner_text()
            assert page_errors == [], f"page errors: {page_errors}"
            browser.close()
    finally:
        server.shutdown()
        thread.join(timeout=5)
