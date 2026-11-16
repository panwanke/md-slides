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
from md_slide_studio.render import engine
assert pathlib.Path(engine.__file__).resolve().is_relative_to(root.resolve()), engine.__file__
from md_slide_studio.render.engine import render_text
html, info = render_text('# A\\n\\n---\\n\\n# B', theme='academic-paper', standalone=True)
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

    from md_slide_studio.render.engine import render_text

    expected, _ = render_text(SAMPLE, theme="academic-paper", standalone=True)
    assert payload["html"] == expected, "browser engine output must match the CLI byte for byte"


@pytest.mark.skipif(
    os.environ.get("MD_TEST_STATIC") != "1" and os.environ.get("JC_TEST_STATIC") != "1",
    reason="opt-in: boots Pyodide in a browser (MD_TEST_STATIC=1)",
)
def test_static_studio_renders_in_browser(tmp_path):
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
            page.add_init_script("delete window.showOpenFilePicker")
            page.goto(f"http://127.0.0.1:{port}/studio.html")
            page.wait_for_function(
                "document.body.innerText.includes('就绪')",
                timeout=180_000,
            )
            frame = page.frame_locator("iframe.studio-preview")
            assert frame.locator("section.slide").count() >= 3
            assert "渲染失败" not in page.locator(".studio-status").inner_text()
            active_slide = frame.locator("section.slide.is-active")
            assert active_slide.evaluate("(slide) => (slide.ownerDocument.defaultView.MDDeck || slide.ownerDocument.defaultView.JCDeck).goTo(2).page") == 2

            editor = page.locator(".studio-editor .cm-content")
            file_menu = page.get_by_role("button", name="文件", exact=True)
            open_markdown = page.get_by_role("button", name="打开 Markdown")
            open_folder = page.get_by_role("button", name="打开工作文件夹")
            tabs = page.get_by_role("tablist", name="打开的文件和文件夹")
            # GitHub static build: sample.md is closable and there is no "导出 .md" button.
            assert page.get_by_role("button", name="关闭 sample.md").count() == 1
            assert page.get_by_role("button", name="导出 .md").count() == 0
            page.get_by_role("button", name="关闭 sample.md").click()
            page.get_by_text("还没有打开的稿件").wait_for()
            file_menu.click()
            for title, open_file in (
                ("First local draft", open_markdown.click),
                ("Second local draft", lambda: page.keyboard.press("Control+o")),
            ):
                with page.expect_file_chooser() as chooser:
                    open_file()
                chooser.value.set_files({
                    "name": "sample.md", "mimeType": "text/markdown",
                    "buffer": f"# {title}".encode(),
                })
                editor.get_by_text(title, exact=True).wait_for(timeout=5_000)
                frame.get_by_role("heading", name=title).wait_for(timeout=5_000)

            workspace = tmp_path / "workspace"
            (workspace / "talks" / "images").mkdir(parents=True)
            (workspace / "shared").mkdir()
            image = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'
            (workspace / "talks" / "images" / "figure.svg").write_text(image, encoding="utf-8")
            (workspace / "shared" / "图 1.svg").write_text(image, encoding="utf-8")
            (workspace / "talks" / "talk.md").write_text(
                "# A\n\n![Local](images/figure.svg)\n\n"
                "Inline ![Shared](<../shared/图 1.svg>)\n\n"
                "![Missing](images/missing.png)\n",
                encoding="utf-8",
            )
            (workspace / "intro.md").write_text("# Intro\n", encoding="utf-8")
            page.evaluate("delete window.showDirectoryPicker")
            file_menu.click()
            with page.expect_file_chooser() as chooser:
                open_folder.click(timeout=5_000)
            chooser.value.set_files(workspace)
            page.get_by_label("工作文件夹中的 Markdown").select_option("talks/talk.md")
            for alt in ("Local", "Shared"):
                image_locator = frame.get_by_alt_text(alt)
                image_locator.wait_for()
                assert image_locator.evaluate("(img) => img.decode().then(() => img.naturalWidth)") == 8
            badge = page.locator(".missing-assets")
            badge.wait_for()
            popover = badge.locator(".missing-assets-popover")
            assert not popover.is_visible()  # hidden until hover/pin
            badge.hover()
            assert "images/missing.png" in popover.inner_text()
            badge.locator(".missing-assets-trigger").click()  # pin: stays open after pointer leaves
            page.mouse.move(0, 0)
            assert popover.is_visible()
            badge.locator(".missing-assets-trigger").click()  # unpin
            page.mouse.move(0, 0)
            assert "就绪 ·" in page.locator(".studio-status").inner_text()
            assert "images/missing.png" not in page.locator(".studio-status").inner_text()
            with page.expect_download() as downloaded:
                page.get_by_role("button", name="导出 HTML").click()
            assert downloaded.value.suggested_filename == "talk.html"
            assert downloaded.value.path().read_text(encoding="utf-8").count("data:image/svg+xml;base64,") >= 2

            editor.fill("# Keep this edit")
            page.get_by_label("工作文件夹中的 Markdown").select_option("intro.md")
            frame.get_by_role("heading", name="Intro").wait_for(timeout=5_000)
            page.get_by_label("工作文件夹中的 Markdown").select_option("talks/talk.md")
            editor.get_by_text("Keep this edit", exact=True).wait_for()

            # A separate workspace can contain the same relative document and image paths.
            other = tmp_path / "other"
            other.mkdir()
            (other / "intro.md").write_text("# Other folder\n\n![Other](figure.svg)", encoding="utf-8")
            (other / "figure.svg").write_text(image.replace('width="8"', 'width="12"'), encoding="utf-8")
            file_menu.click()
            with page.expect_file_chooser() as chooser:
                open_folder.click()
            chooser.value.set_files(other)
            editor.get_by_text("Other folder", exact=True).wait_for(timeout=5_000)
            assert frame.get_by_alt_text("Other").evaluate("(img) => img.decode().then(() => img.naturalWidth)") == 12

            no_decks = tmp_path / "no-markdown"
            no_decks.mkdir()
            (no_decks / "figure.svg").write_text(image, encoding="utf-8")
            file_menu.click()
            with page.expect_file_chooser() as chooser:
                open_folder.click()
            chooser.value.set_files(no_decks)
            page.get_by_role("status").get_by_text("工作文件夹内没有 Markdown 文件", exact=True).wait_for()
            assert editor.get_by_text("Other folder", exact=True).is_visible()

            # Use real browser file handles without automating the system picker.
            page.evaluate("""async () => {
              const root = await navigator.storage.getDirectory();
              const handle = await root.getFileHandle('writable.md', { create: true });
              const writer = await handle.createWritable();
              await writer.write('# Before');
              await writer.close();
              window.showDirectoryPicker = async () => root;
            }""")
            file_menu.click()
            open_folder.click()
            page.get_by_label("工作文件夹中的 Markdown").locator('option[value="writable.md"]').wait_for(state="attached")
            editor.get_by_text("Before", exact=True).wait_for()
            editor.fill("# Saved locally")
            unsaved = tabs.locator('[data-active="true"] .workspace-tab-dirty')
            unsaved.wait_for()
            page.get_by_role("button", name="保存到本地").click()
            unsaved.wait_for(state="hidden")
            assert page.evaluate("""async () => {
              const root = await navigator.storage.getDirectory();
              const file = await (await root.getFileHandle('writable.md')).getFile();
              return file.text();
            }""") == "# Saved locally"
            assert page_errors == [], f"page errors: {page_errors}"
            browser.close()
    finally:
        server.shutdown()
        thread.join(timeout=5)


@pytest.mark.skipif(
    os.environ.get("MD_TEST_STATIC") != "1" and os.environ.get("JC_TEST_STATIC") != "1",
    reason="opt-in: boots Pyodide in a browser (MD_TEST_STATIC=1)",
)
def test_workspace_toolbar_and_custom_shortcuts(tmp_path):
    assert (DIST / "index.html").is_file(), "run `npm run build:static` first"

    from playwright.sync_api import expect, sync_playwright

    handler = partial(SimpleHTTPRequestHandler, directory=str(DIST))
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page(viewport={"width": 390, "height": 844})
                page.add_init_script("delete window.showDirectoryPicker")
                url = f"http://127.0.0.1:{server.server_port}"
                page.goto(url)
                toolbar = page.get_by_role("banner")
                for control in (
                    toolbar.get_by_role("button", name="文件", exact=True),
                    toolbar.get_by_role("link", name="GitHub · Star"),
                    toolbar.get_by_role("button", name="设置"),
                ):
                    expect(control).to_be_in_viewport(ratio=1)
                expect(toolbar.get_by_role("link", name="GitHub · Star")).to_have_attribute(
                    "href", "https://github.com/panwanke/md-slides",
                )

                toolbar.get_by_role("button", name="设置").click()
                settings = page.get_by_role("dialog", name="设置")
                workspace_key = settings.get_by_role("button", name="打开工作文件夹", exact=False)
                workspace_key.click()
                page.keyboard.press("Control+o")
                expect(settings.get_by_role("alert")).to_contain_text("打开 Markdown")
                page.keyboard.press("Control+Alt+j")
                expect(workspace_key).to_contain_text("J")
                settings.get_by_role("button", name="完成").click()
                page.goto(f"{url}/studio/")
                page.get_by_role("tab", name="sample.md").click()

                workspace = tmp_path / "workspace"
                workspace.mkdir()
                (workspace / "shortcut.md").write_text("# Shortcut opened the workspace", encoding="utf-8")
                with page.expect_file_chooser() as chooser:
                    page.keyboard.press("Control+Alt+j")
                chooser.value.set_files(workspace)
                expect(page.get_by_role("tab", name="workspace")).to_have_attribute("aria-selected", "true")
                expect(page.get_by_label("工作文件夹中的 Markdown")).to_have_value("shortcut.md")
                with page.expect_download() as download:
                    page.keyboard.press("Control+s")
                assert download.value.suggested_filename == "shortcut.md"

                page.get_by_role("button", name="预览", exact=True).click()
                preview = page.frame_locator("#previewFrame")
                preview.get_by_role("heading", name="Shortcut opened the workspace").click()
                expect(page.locator("#editor .cm-content")).to_be_focused()
                expect(page.get_by_role("button", name="编辑", exact=True)).to_have_attribute("aria-pressed", "true")

                toolbar.get_by_role("button", name="设置").click()
                settings.get_by_role("button", name="恢复默认快捷键").click()
                expect(workspace_key).to_contain_text("O")
                page.keyboard.press("Escape")
                expect(settings).to_be_hidden()
        finally:
            server.shutdown()
            thread.join(timeout=5)


@pytest.mark.skipif(
    os.environ.get("MD_TEST_STATIC") != "1" and os.environ.get("JC_TEST_STATIC") != "1",
    reason="opt-in: boots Pyodide in a browser (MD_TEST_STATIC=1)",
)
def test_session_restore_and_external_file_change():
    """A reloaded page recovers the open project and reacts to edits made outside the editor."""
    if not (DIST / "index.html").is_file():
        pytest.skip("run `npm run build:static` first")

    from playwright.sync_api import sync_playwright

    handler = partial(SimpleHTTPRequestHandler, directory=str(DIST))
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page()
                page_errors = []
                page.on("pageerror", lambda error: page_errors.append(str(error)))
                page.add_init_script("""
                  navigator.storage.getDirectory().then((root) => {
                    window.showDirectoryPicker = async () => root;
                  });
                """)
                url = f"http://127.0.0.1:{server.server_port}/studio.html"
                page.goto(url)
                page.wait_for_function("document.body.innerText.includes('就绪')", timeout=180_000)

                page.evaluate("""async () => {
                  const root = await navigator.storage.getDirectory();
                  const writer = await (await root.getFileHandle('restore.md', { create: true })).createWritable();
                  await writer.write('# Restored deck');
                  await writer.close();
                }""")
                page.get_by_role("button", name="文件", exact=True).click()
                page.get_by_role("button", name="打开工作文件夹").click()
                selector = page.get_by_label("工作文件夹中的 Markdown")
                selector.wait_for()
                assert selector.input_value() == "restore.md"
                editor = page.locator(".studio-editor .cm-content")
                editor.get_by_text("Restored deck", exact=True).wait_for()

                page.wait_for_function("""async () => {
                  const db = await new Promise((resolve, reject) => {
                    const request = indexedDB.open('md-slide-studio-workspace', 2);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                  });
                  const value = await new Promise((resolve) => {
                    const request = db.transaction('session').objectStore('session').get('current');
                    request.onsuccess = () => resolve(request.result);
                  });
                  db.close();
                  return Array.isArray(value?.tabs) && value.tabs.length > 0;
                }""", timeout=10_000)

                page.reload()
                page.wait_for_function("document.body.innerText.includes('就绪')", timeout=180_000)
                restore_button = page.get_by_role("button", name="恢复会话")
                if restore_button.count():
                    restore_button.click()
                selector = page.get_by_label("工作文件夹中的 Markdown")
                selector.wait_for(timeout=30_000)
                assert selector.input_value() == "restore.md"
                editor = page.locator(".studio-editor .cm-content")
                editor.get_by_text("Restored deck", exact=True).wait_for(timeout=10_000)

                page.evaluate("""async () => {
                  const root = await navigator.storage.getDirectory();
                  const writer = await (await root.getFileHandle('restore.md')).createWritable();
                  await writer.write('# Changed outside');
                  await writer.close();
                }""")
                editor.get_by_text("Changed outside", exact=True).wait_for(timeout=15_000)

                editor.fill("# Local edit")
                page.evaluate("""async () => {
                  const root = await navigator.storage.getDirectory();
                  const writer = await (await root.getFileHandle('restore.md')).createWritable();
                  await writer.write('# Outside again');
                  await writer.close();
                }""")
                page.get_by_text("本地文件已在外部修改").wait_for(timeout=15_000)
                page.on("dialog", lambda dialog: dialog.accept())
                page.get_by_role("button", name="重新载入").click()
                editor.get_by_text("Outside again", exact=True).wait_for(timeout=10_000)
                assert page_errors == [], f"page errors: {page_errors}"
                browser.close()
        finally:
            server.shutdown()
            thread.join(timeout=5)
