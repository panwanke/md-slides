"""Asset and provider management for jc-slide-studio."""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

PACKAGE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = PACKAGE_DIR / "assets"


class AssetProvider:
    """Provides bundled runtime, theme, and font assets."""

    def __init__(self, custom_assets_dir: Optional[Path] = None):
        self.assets_dir = custom_assets_dir or ASSETS_DIR

    def get_asset_path(self, rel_path: str) -> Path:
        return self.assets_dir / rel_path

    def list_themes(self) -> List[str]:
        themes_dir = self.assets_dir / "themes"
        if not themes_dir.is_dir():
            return []
        return sorted([p.stem for p in themes_dir.glob("*.css")])

    def has_theme(self, theme_name: str) -> bool:
        theme_file = self.assets_dir / "themes" / f"{theme_name}.css"
        return theme_file.is_file()

    def get_theme_css(self, theme_name: str) -> str:
        theme_file = self.assets_dir / "themes" / f"{theme_name}.css"
        if not theme_file.is_file():
            # Fallback to academic-paper or first theme available
            theme_file = self.assets_dir / "themes" / "academic-paper.css"
        if theme_file.is_file():
            return theme_file.read_text(encoding="utf-8")
        return ""

    def get_base_css(self) -> str:
        base_file = self.assets_dir / "base.css"
        return base_file.read_text(encoding="utf-8") if base_file.is_file() else ""

    def get_fonts_css(self) -> str:
        fonts_file = self.assets_dir / "fonts.css"
        return fonts_file.read_text(encoding="utf-8") if fonts_file.is_file() else ""

    def get_runtime_js(self) -> str:
        js_file = self.assets_dir / "runtime.js"
        return js_file.read_text(encoding="utf-8") if js_file.is_file() else ""

    def get_animation_assets(self) -> tuple[str, str]:
        anim_css = self.assets_dir / "animations" / "animations.css"
        fx_js = self.assets_dir / "animations" / "fx-runtime.js"
        css_text = anim_css.read_text(encoding="utf-8") if anim_css.is_file() else ""
        js_text = fx_js.read_text(encoding="utf-8") if fx_js.is_file() else ""
        return css_text, js_text

    def get_bundled_effects(self) -> str:
        modules = sorted((self.assets_dir / "animations" / "fx").glob("*.js"))
        return "\n".join([
            "window.__hpxBundled = true;",
            *(module.read_text(encoding="utf-8") for module in modules),
        ])

    def get_bundled_math(self) -> tuple[str, str]:
        katex = self.assets_dir / "katex"
        css = (katex / "katex.inline.css").read_text(encoding="utf-8")
        js = "\n".join(
            (katex / filename).read_text(encoding="utf-8")
            for filename in ("katex.min.js", "auto-render.min.js")
        )
        license_text = (katex / "LICENSE").read_text(encoding="utf-8")
        return css, f"/*!\n{license_text}\n*/\n{js}"

    def get_pele_js(self) -> str:
        pele = self.assets_dir / "pele"
        license_text = (pele / "LICENSE").read_text(encoding="utf-8")
        runtime = (pele / "pele.global.js").read_text(encoding="utf-8").split("\n//# sourceMappingURL=", 1)[0]
        return f"/*!\n{license_text}\n*/\n{runtime}"

    def get_navigation_assets(self) -> tuple[str, str]:
        nav_css = self.assets_dir / "chapter-navigation.css"
        nav_js = self.assets_dir / "chapter-navigation.js"
        css_text = nav_css.read_text(encoding="utf-8") if nav_css.is_file() else ""
        js_text = nav_js.read_text(encoding="utf-8") if nav_js.is_file() else ""
        return css_text, js_text

    def get_favicon_tag(self) -> str:
        icon_file = self.assets_dir / "icon.svg"
        if icon_file.is_file():
            import base64
            b64 = base64.b64encode(icon_file.read_bytes()).decode("ascii")
            return f'<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,{b64}">'
        return '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📊</text></svg>">'



default_provider = AssetProvider()
