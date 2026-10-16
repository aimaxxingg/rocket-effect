# Rocket Effect Agency

Static site — no build step. Open `index.html` or serve the folder:

    python -m http.server 5190

- `assets/blobfont.js` — the bubbly "Rocket Effect" lettering, drawn as SVG dots.
- `assets/style.css` — layout, marquee, work grid.
- `content.json` — all site content: texts, links, hero words, folder tabs, project cards (position, image, detail text) and the about copy.
- `admin/` — admin panel (open `/admin/`). Edits content.json, uploads images to `assets/work/` and publishes them with one commit through the GitHub API. Needs a fine-grained token with Contents read/write on this repo (the panel explains how).

Hosted on GitHub Pages. The custom domain lives in `CNAME`.
