# Rocket Effect Agency

Static site â€” no build step. Open `index.html` or serve the folder:

    python -m http.server 5190

- `assets/blobfont.js` â€” the bubbly "Rocket Effect" lettering, drawn as SVG dots.
- `assets/style.css` â€” layout, marquee, work grid.
- Work opens as an overlay on the home page (`#work`); `work.html` redirects there. Edit items inside `#work` in `index.html` (`--x --y --w --r`); images in `assets/work/`.

Hosted on GitHub Pages. The custom domain lives in `CNAME`.
