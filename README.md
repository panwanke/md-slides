# jc-slide-studio

> [中文版](README_zh.md) | [Live Demo](https://panwanke.github.io/md-slides/)

jc-slide-studio (md-slides) is a standalone Markdown academic slide workbench and offline rendering engine featuring real-time CodeMirror 6 live editing, bidirectional source mapping, and instant HTML presentation generation.

![jc-slide-studio Workbench Live Preview](docs/images/workbench-live-preview.png)

## Overview

jc-slide-studio decouples presentation authoring from external agent environments into a clean, standalone toolchain. It provides an intuitive desktop/browser-based workspace designed specifically for academic and technical presentations.

Key views and workflows include:
- **Interactive Workbench**: A three-pane layout featuring an Accordion Section Navigator, a CodeMirror 6 live-editing Markdown workspace with visual block widgets, and an instant slide preview iframe.
- **Bidirectional Source Mapping**: Selecting slides or chapters in the outline updates the preview; clicking rendered elements in the presentation automatically scrolls and highlights the corresponding Markdown source block.
- **Controlled Atomic Writebacks**: Quickly modify slide layouts, chapters, speaker notes, and fragment steps through UI controls, persisting changes directly back into the Markdown source file via atomic patch transactions.
- **Standalone Offline Bundling**: Packages 36 academic themes, offline fonts, and slide runtime assets into self-contained single-file HTML presentations with zero external server dependencies.

## CLI Commands

| Command | Description |
|---------|-------------|
| `jc-slide-studio doctor` | Check environment, dependencies, and font assets health status |
| `jc-slide-studio check <deck.md>` | Validate Markdown syntax, slide delimiters, frontmatter, and assets |
| `jc-slide-studio render <deck.md>` | Compile Markdown into a standalone offline HTML presentation |
| `jc-slide-studio edit <deck.md>` | Launch the interactive local studio workbench |
| `jc-slide-studio preview <deck.md>` | Launch a lightweight live-reloading presentation preview server |
| `jc-slide-studio serve` | Start the account-based deck library (server-side storage, no bound file) |

### Deck library mode

`serve` starts the same workbench with a sign-in screen and a deck library:
decks are stored in a server-side SQLite database, every save keeps a full
revision snapshot, and each account only sees its own decks. Local `.md` files
can be imported in bulk. `edit <deck.md>` remains the offline single-file mode.

```bash
jc-slide-studio serve --port 9000
# Database: ~/.jc-slide-studio/studio.db
# Override with JC_STUDIO_DB=/path/to/studio.db or JC_STUDIO_DATA_DIR=/path/to/dir
```

The API contract is documented in [docs/protocol.md](docs/protocol.md).

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/panwanke/md-slides.git
cd md-slides

# Install in development mode
pip install -e .

# Or install with development & testing dependencies
pip install -e ".[dev]"
```

### CLI & Studio Usage

```bash
# Check environment health
jc-slide-studio doctor

# Launch the interactive live-editing workbench
jc-slide-studio edit sample.md

# Render deck to a standalone HTML file
jc-slide-studio render sample.md --out ./dist
```

In the studio workbench, live preview is enabled by default. Switch to "Source" to edit raw Markdown tokens, use "Insert Block" to insert callouts, cards, or step-by-step animations, check animation order in "Fragments", and click "Present" to open a presentation window from the current slide.

### Frontend Development (Optional)

The prebuilt frontend distribution is embedded in the Python package (`src/jc_slide_studio/web_dist`). If you want to modify or develop the React studio UI:

```bash
cd web
npm install
npm run dev    # Start Vite dev server on port 3000 (proxies API to 8000)
npm run build  # Rebuild and package frontend assets into web_dist
```

## Features

- **Standalone Execution**: Fully decoupled from agent environments; runs as an independent Python package and web workbench.
- **Accordion Section Navigation**: PowerPoint-style collapsible sections and chapters for organizing large slide decks.
- **CodeMirror 6 Live Editing**: In-editor Markdown typography, layout configuration widgets, speaker notes, and container components with native undo/redo.
- **Bidirectional Synchronization**: Seamless position alignment between outline, editor cursor, and presentation canvas.
- **Batteries-Included Offline Engine**: Built-in academic color palettes, CJK fonts, KaTeX math typesetting, and syntax highlighting.
- **Comprehensive Quality Gates**: Rigorous test suite covering AST parsing, round-trip serialization, WebSocket transactions, and Playwright end-to-end browser workflows.

## Tech Stack

| Component | Technology |
|---|---|
| Core Engine & CLI | Python 3.11+, Click, Jinja2, Pydantic |
| Local Backend Server | FastAPI, Uvicorn, WebSockets, Watchfiles |
| Studio Frontend | React 18, TypeScript, Vite |
| Editor & Live Preview | CodeMirror 6, custom syntax decorations |
| Presentation Runtime | Reveal.js, KaTeX, Highlight.js |
| Testing & Verification | Pytest, Pytest-Asyncio, Playwright |

## License

MIT
