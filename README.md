# GPX & Map Tool

Static, client-side GPX editing, route composition and map-export application intended for GitHub Pages.

## Current capabilities

- Import up to four GPX files locally in the browser.
- Parse and validate GPX track/route geometry.
- Display loaded tracks simultaneously with OpenLayers.
- Show point count, segment count and geodesic distance.
- Trim, split and explicitly join track segments.
- Compose a combined route from selected track slices with undo/redo.
- Export coordinate-only GPX while preserving discontinuities as separate segments.
- Choose raster or curated OpenFreeMap vector basemaps.
- Adjust route appearance independently of the basemap.
- Export publication-style map images with scale, north arrow, attribution, route styling and optional elevation profile.
- Apply experimental deterministic map skins to vector basemaps.

No imported GPX content is uploaded by the application. GPX files and derived route geometry remain in the browser.

## Architecture

The GPX domain model (`src/gpx`) is independent of OpenLayers. Mapping code receives domain tracks and converts them only at the rendering boundary. This keeps track editing, cleaning, combination and undo/redo unit-testable without a map.

Map providers are configuration-driven under `src/map/sources`. Map sources, GPX/route layers, route-appearance presets and map skins are separate concepts rather than being embedded in editor code.

### Map skins

Experimental vector-map skins live under `src/map/skins`. A skin is a deterministic transformation of an already-loaded Mapbox/OpenFreeMap style document. Skins may change visual `paint` properties such as land, water, road and label colors, but they do not alter map sources, source-layer references, filters, layer ordering or GPX geometry.

The current MVP skins are:

- Watercolor hiking
- Antique atlas
- Alpine topo
- Midnight neon
- Blueprint
- Autumn field

Skins currently operate on OpenFreeMap vector styles only. If a skin is selected while a raster basemap such as OpenStreetMap is active, the UI automatically switches to OpenFreeMap Positron. Selecting a raster basemap again disables the active skin.

No AI model or external image-generation service is used when applying a skin. Skin rendering is local and deterministic once the style has been loaded.

The MVP intentionally does not persist the selected skin in project JSON yet. This keeps the feature easy to remove or redesign without introducing a project-file compatibility requirement.

## Develop

```bash
npm install
npm run dev
npm test
npm run build
```

The production Vite base is `/gpx-tools/`, suitable for `https://username.github.io/gpx-tools/`.

## Map licensing

Third-party map-source, vector-style and publication-export licensing notes are documented in [`THIRD_PARTY_MAPS.md`](./THIRD_PARTY_MAPS.md).
