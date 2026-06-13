# LEGO World Map (31203) — Find the Stud

A tiny static web tool: type a place, and it highlights the stud that best represents it on the 128×80 grid of LEGO Art set **31203 (World Map)**.

## How it works

- Geocodes the place via [Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap).
- Projects the coordinates with **Equal Earth** (the projection the set is based on), fit to the set's 1.6:1 rectangle with a vertical stretch — the same squaring LEGO applied to the original ~2.05:1 projection.
- Rounds to the nearest stud and reports it as column × row, which 16×16 brick plate it lands on, and the local stud within that plate.

The whole map is rendered as a 128×80 stud mosaic (land vs ocean sampled from the projection), so you can eyeball where a stud sits.

> Positions are a close approximation. The set squares an equal-area projection into a rectangle, so it is not survey-grade.

## Run locally

It's fully static — just serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` via `file://` also works, but a local server avoids any CDN/CORS quirks.)

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo.
2. Settings → Pages → Build and deployment → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The site goes live at `https://<user>.github.io/<repo>/`.

No build step. Dependencies (d3, topojson, world-atlas) load from CDN at runtime.

Not affiliated with the LEGO Group.
