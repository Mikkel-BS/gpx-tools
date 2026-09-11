# Development constraints

- GPX files and derived GPX data remain in the browser; do not add upload APIs or telemetry containing track geometry.
- Keep original imported XML immutable.
- Keep GPX parsing/editing/serialization independent of map rendering.
- Do not silently reduce coordinate precision.
- Do not automatically route across discontinuities.
- Map sources, layers and visual style presets are separate concepts.
- Provider-specific configuration must stay behind source adapters/configuration.
- Prefer pure functions and tests for GPX/editor operations.
- GitHub Pages must continue to work at `/gpx-tools/`.
