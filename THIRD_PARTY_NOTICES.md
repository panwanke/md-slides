# Third-Party Notices and Licenses

This project incorporates components from or depends upon open-source software:

1. **Reveal.js / Slide Presentation Framework**
   - Source: Epool presentation assets / Reveal.js
   - License: MIT License
   - Usage: Slide playback and rendering runtime

2. **FastAPI & Uvicorn**
   - License: MIT License / BSD License
   - Usage: Local HTTP & WebSocket API service

3. **CodeMirror 6**
   - License: MIT License
   - Usage: Web-based markdown editor component

4. **React & Vite**
   - License: MIT License
   - Usage: Web studio frontend framework and build tool

5. **KaTeX 0.16.47**
   - Source: [KaTeX npm package](https://www.npmjs.com/package/katex/v/0.16.47)
   - License: MIT License, in `src/md_slide_studio/providers/assets/katex/LICENSE`
   - Usage: Offline math rendering. The bundled CSS embeds the WOFF2 fonts from the distribution.

The workbench build includes the license texts of bundled runtime dependencies in
`src/jc_slide_studio/web_dist/THIRD_PARTY_LICENSES.txt`.
