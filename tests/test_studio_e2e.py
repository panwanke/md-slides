"""Browser end-to-end check of the account + deck-library flow (serve mode)."""

import socket
from threading import Thread
import time

import pytest
import uvicorn
from playwright.sync_api import expect, sync_playwright

from jc_slide_studio.server.app import app, state


@pytest.fixture
def library_server(tmp_path, monkeypatch):
    monkeypatch.setenv("JC_STUDIO_DB", str(tmp_path / "studio.db"))
    previous_source, previous_revision = state.source_path, state.revision
    state.source_path, state.revision = None, 1

    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        _, port = listener.getsockname()
        server = uvicorn.Server(uvicorn.Config(app, log_level="warning"))
        thread = Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        thread.start()
        try:
            deadline = time.monotonic() + 5
            while not server.started and time.monotonic() < deadline:
                time.sleep(0.02)
            assert server.started
            yield f"http://127.0.0.1:{port}"
        finally:
            server.should_exit = True
            thread.join(5)
            state.source_path, state.revision = previous_source, previous_revision


def test_signup_library_edit_and_reload(library_server):
    url = library_server
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("dialog", lambda dialog: dialog.accept("E2E 稿件"))

        page.goto(url)
        expect(page.locator(".auth-card")).to_be_visible()

        page.get_by_role("tab", name="注册").click()
        page.locator('input[type="email"]').fill("e2e@example.com")
        page.locator('input[type="password"]').fill("password123")
        page.get_by_role("button", name="创建账号").click()

        expect(page.locator(".library")).to_be_visible()
        page.get_by_role("button", name="新建演示稿").click()
        expect(page.locator(".deck-card")).to_have_count(1)

        page.locator(".deck-open").click()
        editor = page.locator("#editor .cm-content")
        expect(editor).to_be_visible()
        expect(page.locator("#fileNameDisplay")).to_have_text("E2E 稿件")

        frame = page.frame_locator("#previewFrame")
        expect(frame.locator(".slide.is-active")).to_contain_text("新演示稿")

        editor.click()
        page.keyboard.press("Control+A")
        page.keyboard.type("# 持久化标记\n\n换设备也能看到")
        expect(page.locator("#saveStatus")).to_have_text("已保存")
        expect(frame.locator(".slide.is-active")).to_contain_text("持久化标记")

        page.reload()
        expect(page.locator("#editor .cm-content")).to_contain_text("持久化标记")
        expect(page.locator("#fileNameDisplay")).to_have_text("E2E 稿件")

        page.get_by_role("button", name="幻灯片库").click()
        expect(page.locator(".library")).to_be_visible()
        expect(page.locator(".deck-card-meta")).to_contain_text("v2")

        assert not errors
        browser.close()
