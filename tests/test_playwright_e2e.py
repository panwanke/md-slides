from pathlib import Path
import re
import shutil
import socket
from threading import Thread
import time

import pytest
import uvicorn
from playwright.sync_api import expect, sync_playwright

from md_slide_studio.server.app import app, state


@pytest.fixture
def workbench(tmp_path):
    fixture = Path(__file__).parent / "fixtures"
    deck = tmp_path / "steps.md"
    original = (fixture / deck.name).read_text(encoding="utf-8")
    deck.write_text(original.replace('kicker: "功能示例"', 'kicker: "功能示例 🎬"'), encoding="utf-8")
    shutil.copy(fixture / "steps.svg", tmp_path)
    previous_source, previous_revision = state.source_path, state.revision
    state.source_path, state.revision = deck, 1

    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        host, port = listener.getsockname()
        server = uvicorn.Server(uvicorn.Config(app, log_level="warning"))
        thread = Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        thread.start()
        try:
            deadline = time.monotonic() + 5
            while not server.started and time.monotonic() < deadline:
                time.sleep(0.02)
            assert server.started
            yield f"http://{host}:{port}", deck
        finally:
            server.should_exit = True
            thread.join(5)
            state.source_path, state.revision = previous_source, previous_revision


def test_workbench_and_sections_e2e(workbench):
    url, deck = workbench
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url)

        editor = page.locator("#editor .cm-content")
        expect(editor).to_be_visible()
        expect(page.locator(".section-group").first).to_be_visible()
        frame = page.frame_locator("#previewFrame")
        expect(frame.locator(".slide.is-active")).to_have_attribute(
            "data-title", "单文件与分步动画演示"
        )

        page.locator("#slide-item-2").click()
        expect(frame.locator(".slide.is-active")).to_have_attribute(
            "data-title", "按方向键逐条出现"
        )

        splitter = page.locator("#resizer-2")
        assert splitter.bounding_box()
        initial_width = page.locator("#editorPane").bounding_box()["width"]
        bounds = splitter.bounding_box()
        page.mouse.move(bounds["x"] + bounds["width"] / 2, bounds["y"] + 10)
        page.mouse.down()
        page.mouse.move(bounds["x"] + bounds["width"] / 2 - 100, bounds["y"] + 10)
        page.mouse.up()
        assert abs(page.locator("#editorPane").bounding_box()["width"] - initial_width + 100) < 15

        page.locator("#layoutSelect").select_option("figure")
        expect(page.locator("#saveStatus")).to_have_text("已保存")
        expect(frame.locator(".slide.is-active")).to_have_class(re.compile(r"\bjc-figure\b"))
        assert "layout=figure | transition=slide | reveal=items" in deck.read_text(encoding="utf-8")

        page.get_by_role("button", name="Markdown 源码").click()
        expect(editor).to_contain_text("<!-- slide: layout=figure")
        frame.locator(".slide.is-active h2").click()
        expect(editor).to_be_focused()
        assert page.evaluate("window.getSelection().toString().trim()").endswith("按方向键逐条出现")

        page.get_by_role("button", name="插入块").click()
        expect(page.locator("#insertNotesBtn")).to_be_visible()
        page.locator("#insertNotesBtn").click()
        expect(page.locator("#saveStatus")).to_have_text("已保存")
        assert deck.read_text(encoding="utf-8").count("::: notes") == 5
        assert not errors


def test_live_preview_widgets_round_trip(workbench):
    url, deck = workbench
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(url)
        page.locator("#slide-item-3").click()
        frame = page.frame_locator("#previewFrame")
        expect(frame.locator(".slide.is-active")).to_have_attribute("data-title", "图片与说明分步出现")
        editor = page.locator("#editor .cm-content")
        expect(editor.locator(".md-heading-1").get_by_text("图片与说明分步出现")).to_be_visible()

        slide_settings = editor.locator(".syntax-meta").filter(
            has=page.locator('select[aria-label="版式"] option:checked[value="bullets"]')
        )
        slide_settings.get_by_label("版式", exact=True).select_option("table")
        expect(page.locator("#saveStatus")).to_have_text("已保存")
        assert "<!-- slide: layout=table | transition=fade -->" in deck.read_text(encoding="utf-8")
        section_field = editor.locator(".syntax-meta").filter(
            has=page.locator('select[aria-label="版式"] option:checked[value="table"]')
        ).get_by_label("章节", exact=True)
        section_field.fill("实验设计")
        section_field.press("Enter")
        expect(page.locator(".section-title").get_by_text("实验设计", exact=True)).to_be_visible()
        assert "layout=table | transition=fade | section=实验设计" in deck.read_text(encoding="utf-8")

        fragment = editor.locator(".syntax-fragment").filter(
            has=page.get_by_label("动画步骤", exact=True)
        ).nth(1)
        fragment.get_by_label("动画效果").select_option("fade-up")
        expect(page.locator("#saveStatus")).to_have_text("已保存")
        assert "::: fragment step=2 effect=fade-up\n::: box 解释" in deck.read_text(encoding="utf-8")

        fragment.get_by_role("button", name="折叠内容").click()
        expect(fragment.get_by_role("button", name="展开内容")).to_be_visible()
        expect(editor.get_by_text("第二步：出现这张说明卡片。", exact=True)).to_have_count(0)
        fragment.get_by_role("button", name="展开内容").click()
        expect(editor.get_by_text("第二步：出现这张说明卡片。", exact=True)).to_be_visible()

        page.get_by_role("button", name="分步", exact=True).click()
        first_step = frame.locator(".slide.is-active [data-step='1']")
        expect(first_step).to_have_attribute("aria-hidden", "true")
        page.get_by_role("button", name="下一步").click()
        expect(first_step).to_have_attribute("aria-hidden", "false")

        page.get_by_role("button", name="Markdown 源码").click()
        expect(editor).to_contain_text("::: fragment step=2 effect=fade-up")
        editor.press("Control+z")
        expect(page.locator("#saveStatus")).to_have_text("已保存")
        assert "::: fragment step=2 effect=fade\n::: box 解释" in deck.read_text(encoding="utf-8")

        page.set_viewport_size({"width": 390, "height": 844})
        expect(editor).to_be_visible()
        expect(page.locator("#previewPane")).to_be_hidden()
        page.get_by_role("button", name="预览", exact=True).click()
        expect(page.locator("#previewPane")).to_be_visible()
        expect(editor).to_be_hidden()
