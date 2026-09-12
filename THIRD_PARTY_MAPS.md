# Third-party map sources and styles

This project deliberately keeps map-source licensing explicit and conservative. The application has no server-side map proxy: the browser requests third-party map resources directly when a user chooses those sources.

## OpenFreeMap vector styles

Curated styles currently exposed in the UI:

- Positron
- Liberty
- Fiord
- Dark

Runtime style/tile resources are requested directly from `tiles.openfreemap.org`. No API key or account is required.

OpenFreeMap states that commercial usage is allowed and that printed media/video must carry the attribution:

`OpenFreeMap © OpenMapTiles Data from OpenStreetMap`

The image exporter therefore treats these styles as `allowed-with-attribution` and embeds an equivalent visible credit in exported images.

References:

- https://openfreemap.org/
- https://openfreemap.org/quick_start/
- https://openfreemap.org/tos/

The app normalizes label fonts to common system fonts before applying MapLibre-style JSON through OpenLayers. This avoids the default `ol-mapbox-style` behavior of fetching web fonts from an unrelated font CDN. Sprites and map tile resources may still be requested from OpenFreeMap as part of rendering the selected map.

## OpenStreetMap standard raster tiles

The OpenStreetMap raster source remains available with visible OpenStreetMap attribution. Publication export is enabled only with embedded attribution and ODbL notice information.

Reference: https://www.openstreetmap.org/copyright

## Kartverket cache tiles

Kartverket raster cache sources remain available for interactive mapping, but publication image export is intentionally blocked pending a rights review. Kartverket notes that detailed cache/WMS services can include Geovekst material for which separate permission may be required for copying or other reuse.

Reference: https://www.kartverket.no/en/api-and-data/terms-of-use

## Rendering library

`ol-mapbox-style` is used to apply Mapbox/MapLibre Style documents to the existing OpenLayers map. It is distributed under the BSD-2-Clause license and is bundled by Vite; no library code is loaded from a CDN at runtime.

Reference: https://github.com/openlayers/ol-mapbox-style

## Policy for adding future styles

A style/source should not be added to the default curated library unless all of the following are clear:

1. The style/service can be used without a private API key in this static application.
2. Runtime use is allowed by the provider's published terms.
3. Required data/style attribution can be stated explicitly.
4. Publication/static-image use is either explicitly allowed or conservatively blocked in the exporter.
5. No user GPX or derived geometry is sent to the map provider; only ordinary map-resource requests are made.
