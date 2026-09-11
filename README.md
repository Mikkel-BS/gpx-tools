# GPX & Map Tool

Static, client-side GPX editing and map composition application intended for GitHub Pages.

## Current baseline (Phase 1)

- Import up to four GPX files locally in the browser.
- Parse and validate GPX track/route geometry.
- Display loaded tracks simultaneously with OpenLayers.
- Show point count, segment count and geodesic distance.
- Select/remove tracks.
- Export a coordinate-only GPX containing GPX 1.1 structure plus `lat`/`lon` only.
- GitHub Pages workflow.

No imported GPX content is uploaded by the application. The only network requests are map-tile requests made by the configured map provider.

## Architecture

The GPX domain model (`src/gpx`) is independent of OpenLayers. Mapping code receives domain tracks and converts them only at the rendering boundary. This keeps track editing, cleaning, combination and undo/redo unit-testable without a map.

Map providers are configuration-driven under `src/map/sources`. WMS/WMTS/vector sources and style presets should be added as separate adapters rather than embedded in editor code.

## Develop

```bash
npm install
npm run dev
npm test
npm run build
```

The production Vite base is `/gpx-tools/`, suitable for `https://username.github.io/gpx-tools/`.

## Planned next implementation

Phase 2 should introduce immutable editor commands and a route-composition model consisting of ordered references to slices of source tracks. Undo/redo should operate on editor state, not map-layer state. Discontinuities should be represented explicitly and never silently bridged.
