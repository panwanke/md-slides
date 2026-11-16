"""Command Line Interface for jc-slide-studio."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import webbrowser
import click

from jc_slide_studio import __protocol_version__, __version__
from jc_slide_studio.document.check import check_slide_deck
from jc_slide_studio.providers.assets import default_provider
from jc_slide_studio.render.engine import render_deck
from jc_slide_studio.server.app import app, set_active_source, state


@click.group()
@click.version_option(__version__, prog_name="jc-slide-studio")
def main() -> None:
    """jc-slide-studio: Markdown slide studio and standalone rendering engine."""
    pass


@main.command()
@click.option("--json", "as_json", is_flag=True, help="Output diagnosis in JSON format.")
def doctor(as_json: bool) -> None:
    """Diagnose environment, protocol version, and installed providers."""
    themes = default_provider.list_themes()
    info = {
        "protocolVersion": __protocol_version__,
        "ok": True,
        "version": __version__,
        "pythonVersion": sys.version.split()[0],
        "markdownSpecVersion": "1.0",
        "providers": {
            "themes": themes,
            "themeCount": len(themes),
            "player": "bundled",
        },
    }
    if as_json:
        click.echo(json.dumps(info, ensure_ascii=False, indent=2))
    else:
        click.echo(f"jc-slide-studio v{__version__} (Protocol v{__protocol_version__})")
        click.echo(f"Python: {info['pythonVersion']}")
        click.echo(f"Bundled Themes: {len(themes)} available")
        click.echo("Status: OK (Environment ready)")


@main.command()
@click.argument("source", type=click.Path(exists=True, path_type=Path))
@click.option("--json", "as_json", is_flag=True, help="Output check results in JSON.")
@click.option("--strict", "strict", is_flag=True,
              help="Treat missing or out-of-range speaker notes as failures.")
def check(source: Path, as_json: bool, strict: bool) -> None:
    """Check Markdown slide syntax, structure, placeholders, and speaker notes."""
    result = check_slide_deck(source, strict=strict)
    output = {
        "protocolVersion": __protocol_version__,
        **result,
    }
    if as_json:
        click.echo(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        status_str = "PASS" if result["ok"] else "FAIL"
        click.echo(f"Check {source}: {status_str} ({result['slideCount']} slides)")
        for diag in result["diagnostics"]:
            lvl = diag["level"].upper()
            line_str = f" [line {diag.get('line')}]" if diag.get("line") else ""
            click.echo(f"  {lvl}: {diag['message']}{line_str}")
    if not result["ok"]:
        sys.exit(1)


@main.command()
@click.argument("source", type=click.Path(exists=True, path_type=Path))
@click.option("--out", "out_dir", required=True, type=click.Path(path_type=Path), help="Output directory.")
@click.option("--filename", "filename", default=None, help="Output HTML file name.")
@click.option("--theme", "theme", default=None, help="Theme override.")
@click.option("--bundle/--no-bundle", default=True, help="Embed resources for offline playback.")
@click.option("--json", "as_json", is_flag=True, help="Output render results in JSON.")
def render(source: Path, out_dir: Path, filename: str | None, theme: str | None, bundle: bool, as_json: bool) -> None:
    """Render Markdown slide to standalone HTML."""
    if filename and filename.lower() == "index.html":
        click.echo("Error: Output filename must not be index.html.", err=True)
        sys.exit(1)

    try:
        html_content, out_file = render_deck(
            source_path=source,
            out_dir=out_dir,
            filename=filename,
            theme=theme,
            bundle=bundle,
        )
        check_res = check_slide_deck(source)
        info = {
            "protocolVersion": __protocol_version__,
            "ok": True,
            "source": str(source.resolve()),
            "output": str(out_file.resolve()) if out_file else None,
            "slideCount": check_res["slideCount"],
            "diagnostics": check_res["diagnostics"],
        }
        if as_json:
            click.echo(json.dumps(info, ensure_ascii=False, indent=2))
        else:
            click.echo(f"Rendered: {out_file} ({check_res['slideCount']} slides)")
    except Exception as exc:
        err_info = {
            "protocolVersion": __protocol_version__,
            "ok": False,
            "source": str(source.resolve()),
            "error": str(exc),
        }
        if as_json:
            click.echo(json.dumps(err_info, ensure_ascii=False, indent=2))
        else:
            click.echo(f"Render error: {exc}", err=True)
        sys.exit(1)


@main.command()
@click.argument("source", type=click.Path(exists=True, path_type=Path))
@click.option("--port", default=8000, help="Local server port.")
@click.option("--no-browser", is_flag=True, help="Do not open browser automatically.")
def preview(source: Path, port: int, no_browser: bool) -> None:
    """Start local preview server for the specified slide deck."""
    import uvicorn
    set_active_source(source)
    url = f"http://127.0.0.1:{port}/preview/live"
    click.echo(f"Starting slide preview on {url}")
    if not no_browser:
        webbrowser.open(url)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


@main.command()
@click.argument("source", type=click.Path(exists=True, path_type=Path))
@click.option("--port", default=8000, help="Local server port.")
@click.option("--no-browser", is_flag=True, help="Do not open browser automatically.")
def edit(source: Path, port: int, no_browser: bool) -> None:
    """Open interactive slide studio workbench in browser."""
    import uvicorn
    set_active_source(source)
    url = f"http://127.0.0.1:{port}/"
    click.echo(f"Starting jc-slide-studio workbench on {url}")
    if not no_browser:
        webbrowser.open(url)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


@main.command()
@click.option("--port", default=9000, help="Local server port.")
@click.option("--host", default="127.0.0.1", help="Bind address (use 0.0.0.0 behind a proxy).")
@click.option("--no-browser", is_flag=True, help="Do not open browser automatically.")
def serve(port: int, host: str, no_browser: bool) -> None:
    """Start the deck-library workbench: accounts + server-side storage.

    Unlike ``edit``, no Markdown file is bound to the process. The browser
    detects this through ``/api/doctor`` and switches to the login/library view.
    Set ``JC_STUDIO_DB`` or ``JC_STUDIO_DATA_DIR`` to move the database.
    """
    import uvicorn

    state.source_path = None
    url = f"http://{host if host != '0.0.0.0' else '127.0.0.1'}:{port}/"
    click.echo(f"Deck library on {url}")
    from jc_slide_studio.studio.db import db_path
    click.echo(f"Database: {db_path()}")
    if not no_browser:
        webbrowser.open(url)
    # Behind a reverse proxy the connection comes from the proxy IP, not
    # 127.0.0.1. Trust its X-Forwarded-Proto so request.url.scheme is https and
    # the session cookie is emitted with the Secure flag.
    uvicorn.run(
        app, host=host, port=port, log_level="warning",
        proxy_headers=True, forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
