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
    original = (fixture / "workbench-e2e.md").read_text(encoding="utf-8")
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


def test_local_workbench_opens_workspace_and_exports_offline(workbench, tmp_path):
    url, original = workbench
    folder = tmp_path / "workspace"
    (folder / "decks").mkdir(parents=True)
    (folder / "figures").mkdir()
    (folder / "figures" / "plot.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"/>', encoding="utf-8",
    )
    (folder / "decks" / "talk.md").write_text(
        "# Workspace talk\n\n![Plot](../figures/plot.svg)\n\n---\n\n# Next slide\n",
        encoding="utf-8",
    )

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.add_init_script("delete window.showDirectoryPicker")
        page.goto(url)
        expect(page.locator("#fileNameDisplay")).to_have_text("steps.md")
        toolbar = page.get_by_role("banner")
        open_folder = toolbar.get_by_role("button", name="打开工作文件夹")
        expect(open_folder).to_be_visible()
        assert open_folder.bounding_box()["x"] < page.locator("#fileNameDisplay").bounding_box()["x"]
        present = toolbar.get_by_role("link", name="演示")
        assert toolbar.get_by_role("link", name="GitHub · Star").bounding_box()["x"] > present.bounding_box()["x"]
        assert toolbar.get_by_role("button", name="设置").bounding_box()["x"] > present.bounding_box()["x"]

        editor = page.locator("#editor .cm-content")
        editor.fill("# Export the current text\n\n![Original](steps.svg)\n\n$E=mc^2$\n\n---\n\n# Offline slide two")
        with page.expect_download() as downloaded:
            toolbar.get_by_role("button", name="导出 HTML").click()
        assert downloaded.value.suggested_filename == "steps.html"
        output = tmp_path / "export.html"
        downloaded.value.save_as(output)
        offline = browser.new_page(offline=True)
        offline.goto(output.as_uri())
        expect(offline.get_by_role("heading", name="Export the current text")).to_be_visible()
        assert offline.get_by_alt_text("Original").evaluate("img => img.decode().then(() => img.naturalWidth)") > 0
        expect(offline.locator(".katex")).to_be_visible()
        offline.keyboard.press("ArrowRight")
        expect(offline.get_by_role("heading", name="Offline slide two")).to_be_visible()

        with page.expect_file_chooser() as chooser:
            open_folder.click()
        chooser.value.set_files(folder)
        expect(page.locator("#fileNameDisplay")).to_have_text("talk.md")
        frame = page.frame_locator("#previewFrame")
        assert frame.get_by_alt_text("Plot").evaluate("img => img.decode().then(() => img.naturalWidth)") == 24
        with page.expect_download() as downloaded:
            toolbar.get_by_role("button", name="导出 HTML").click()
        assert downloaded.value.suggested_filename == "talk.html"
        assert re.search(r'<img src="data:image/svg\+xml;base64,', downloaded.value.path().read_text(encoding="utf-8"))

        with page.expect_file_chooser() as chooser:
            toolbar.get_by_role("button", name="打开 Markdown").click()
        chooser.value.set_files({"name": "loose.md", "mimeType": "text/markdown", "buffer": b"# Loose draft"})
        expect(editor).to_contain_text("Loose draft")
        toolbar.get_by_role("button", name="返回启动稿件").click()
        expect(page.locator("#fileNameDisplay")).to_have_text("steps.md")
        assert "Export the current text" in original.read_text(encoding="utf-8")


def test_preview_paging_keeps_the_editor_cursor_and_restores_the_view(workbench, tmp_path):
    url, _ = workbench
    profile = tmp_path / "browser-profile"
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(profile, viewport={"width": 1440, "height": 900})
        context.route("https://**/*", lambda route: route.abort())
        page = context.pages[0]
        page.goto(url)
        page.get_by_role("button", name="Markdown 源码").click()
        editor = page.locator("#editor .cm-content")
        editor.press("Control+Home")
        editor.press("ArrowRight")
        editor.press("ArrowRight")
        cursor = page.locator(".cursor-position")
        original = cursor.inner_text()
        frame = page.frame_locator("#previewFrame")
        expect(frame.locator(".slide.is-active")).to_have_attribute("data-slide-id", "slide-1")

        stage = page.get_by_role("group", name="预览翻页")
        stage.click(position={"x": 5, "y": 5})
        page.keyboard.press("ArrowRight")
        expect(frame.locator(".slide.is-active")).to_have_attribute("data-slide-id", "slide-2")
        expect(cursor).to_have_text(original)
        expect(stage).to_be_focused()

        frame.locator(".slide.is-active").click(position={"x": 5, "y": 5})
        page.keyboard.press("ArrowRight")
        expect(frame.locator(".slide.is-active")).to_have_attribute("data-slide-id", "slide-3")
        expect(cursor).to_have_text(original)

        context.close()
        restored = playwright.chromium.launch_persistent_context(profile, viewport={"width": 1440, "height": 900})
        restored.route("https://**/*", lambda route: route.abort())
        reopened = restored.pages[0]
        reopened.goto(url)
        expect(reopened.get_by_role("button", name="Markdown 源码")).to_have_attribute("aria-pressed", "true")
        expect(reopened.locator(".cursor-position")).to_have_text(original)
        expect(reopened.frame_locator("#previewFrame").locator(".slide.is-active")).to_have_attribute(
            "data-slide-id", "slide-3",
        )
        restored.close()


def test_pele_renders_in_editor_preview_and_export(workbench, tmp_path):
    url, deck = workbench
    deck.write_text(
        "# Diagram\n\n"
        "```mermaid\nflowchart LR\nA[输入] --> B[结果]\n```\n\n"
        "```pele\nnot a diagram\n```\n",
        encoding="utf-8",
    )
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.route("https://**/*", lambda route: route.abort())
        page.goto(url)
        editor_diagram = page.locator("#editor .md-diagram img")
        frame = page.frame_locator("#previewFrame")
        for image in (editor_diagram, frame.locator(".md-diagram img")):
            expect(image).to_be_visible()
            assert image.evaluate("img => img.decode().then(() => img.naturalWidth)") > 0
        expect(frame.locator(".md-diagram-error")).to_contain_text("绘图失败")
        editor_diagram.click()
        expect(page.locator("#editor .cm-content")).to_contain_text("flowchart LR")

        with page.expect_download() as download:
            page.get_by_role("button", name="导出 HTML").click()
        output = tmp_path / "diagram.html"
        download.value.save_as(output)
        offline = browser.new_page(offline=True)
        offline.goto(output.as_uri())
        image = offline.locator(".md-diagram img")
        expect(image).to_be_visible()
        assert image.evaluate("img => img.decode().then(() => img.naturalWidth)") > 0


def test_editor_renders_latex_and_reveals_editable_source(workbench):
    url, deck = workbench
    source = (
        "# Math\n\n"
        r"Inline $x_i^2$ and \(e^{i\pi}\)" "\n\n"
        "- Display in a list:\n"
        r"  $$\frac{\sigma}{\sqrt{2}}$$" "\n\n"
        "$$\n"
        r"\begin{aligned}a&=b\\c&=d\end{aligned}" "\n"
        "$$\n\n"
        r"Leave \$escaped and `code $y$` as text." "\n\n"
        "~~~\n$fenced$\n~~~\n\n"
        "After the formulas.\n"
    )
    deck.write_text(source, encoding="utf-8")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.route("https://**/*", lambda route: route.abort())
        page.goto(url)
        editor = page.locator("#editor .cm-content")
        formulas = editor.locator(".md-math .katex")
        expect(formulas).to_have_count(4)
        expect(editor.locator(".md-math .katex-display")).to_have_count(2)
        expect(editor).to_contain_text("$fenced$")

        editor.locator(".md-math").first.click()
        expect(editor).to_contain_text("$x_i^2$")
        expect(formulas).to_have_count(3)
        page.keyboard.press("Control+End")
        expect(formulas).to_have_count(4)

        page.get_by_role("button", name="Markdown 源码").click()
        expect(formulas).to_have_count(0)
        expect(editor).to_contain_text(r"\begin{aligned}a&=b\\c&=d\end{aligned}")
        assert deck.read_text(encoding="utf-8") == source


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
