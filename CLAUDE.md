# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Siedlungsqualität im Profil** — an interactive map that scores Swiss settlement quality by overlaying rasterized geodata layers (tranquillity, population density, ÖV accessibility) and sampling them at a user-selected location. Two independent parts:

| Part | Stack | Purpose |
|------|-------|---------|
| `data-pipelines/` | Python + uv + zarr/xarray/geopandas | Convert Swiss geodata → GeoZarr, upload to Backblaze B2 |
| `frontend/` | Angular 21 + MapLibre GL + deck.gl + `@carbonplan/zarr-layer` | Interactive map + metric sidebar |

---

## Frontend

**Working directory:** `frontend/`

### Commands

```bash
cd frontend
pnpm install
pnpm start            # Dev server on http://localhost:4200
pnpm build            # Production build
pnpm test             # Unit tests (vitest)
pnpm run ng test      # Angular test runner (Karma)
npx prettier --write src/   # Format
```

Run a single test file:
```bash
npx vitest run src/path/to/file.spec.ts
```

### Architecture

**Data flow:**

```
zarr-layers.config.ts   ← single source of truth for all layer definitions
        ↓
ZarrMapService          ← manages ZarrLayer instances on the MapLibre map,
                           holds Angular signals for weights/enabled/metrics/overviewScore
        ↓
LocationService         ← facade: owns lat/lng/radius signals, delegates zarr
                           sampling to ZarrMapService on location change (via effect)
        ↓
Components (read-only)  ← MapComponent, SidebarComponent, SearchBarComponent
```

**Key files:**

- `src/app/config/zarr-layers.config.ts` — **add new Zarr layers here**. Each `ZarrLayerDefinition` declares the store path, variable name, colormap, `clim` (color scale limits), `metricKey`, and `higherIsBetter`. The rest of the app derives from this config automatically.
- `src/app/services/zarr-map.service.ts` — attaches/detaches `ZarrLayer` objects to MapLibre, samples pixel values via `layer.queryData()`, computes `overviewScore` via `computed()`.
- `src/app/services/location.service.ts` — thin facade; re-exposes zarr signals, owns location/radius state.
- `src/app/components/map/map.component.ts` — initializes MapLibre (CARTO Positron base style), deck.gl `MapboxOverlay`, and calls `zarrMapService.attachToMap()`. The draggable marker updates `LocationService`.
- `src/app/utils/metrics-aggregate.util.ts` — `computeWeightedOverview()` normalizes raw metric values to 0–100 using each layer's `clim` and `higherIsBetter` flag.

**Coordinate system:** All Zarr stores are in **Swiss LV95 / EPSG:2056**. `SWISS_LV95_PROJ4` in the config is passed to `@carbonplan/zarr-layer` so it re-projects tiles to WGS84 for MapLibre.

**State management:** Uses Angular signals exclusively — no RxJS Subjects for application state.

**Environment:** Zarr base URL is configured in `src/environments/environment.ts` (production points to the public Backblaze B2 bucket; no env vars needed for frontend).

---

## Data Pipelines

**Working directory:** `data-pipelines/`

### Commands

```bash
# Requires Python ≥ 3.14 and uv
cp .env.example .env   # fill in B2_KEY_ID and B2_APPLICATION_KEY
cd data-pipelines
uv run python density-rasterize.py --year 2024 --upload
uv run python accessibility-pt-rasterize.py --upload
uv run python tranquillity-rasterize.py --upload
```

Omit `--upload` to write the `.zarr` store locally only. Use `--remote-name` to override the S3 object prefix.

### Pipeline outputs → Frontend layer mapping

| Script | Zarr store | Frontend layer id |
|--------|-----------|-------------------|
| `density-rasterize.py` | `statpop_population_density_100m.zarr` | `population-density` |
| `accessibility-pt-rasterize.py` | `erreichbarkeit_swiss_grid_100m.zarr` | `pt-accessibility` |
| `tranquillity-rasterize.py` | `ch_bafu_tranquillity_karte.zarr` | `tranquillity` |

### Environment variables (`.env` at repo root)

```
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_ENDPOINT_URL=https://s3.eu-central-003.backblazeb2.com   # optional
B2_BUCKET_NAME=egov-hackathon                                 # optional
```

---

## Adding a New Metric Layer

1. Run (or add) a pipeline script in `data-pipelines/` that outputs a Zarr v3 store.
2. Upload it to B2 (with `--upload` or `zarr_b2_upload.py`).
3. Add a `ZarrLayerDefinition` entry in `frontend/src/app/config/zarr-layers.config.ts` — set `storePath`, `variable`, `colormap`, `clim`, `metricKey` (matching a field in `LocationMetrics`), and `higherIsBetter`.
4. Extend `LocationMetrics` in `frontend/src/app/models/metrics.model.ts` with the new field.

The sidebar controls, overview score, and point sampling are all driven from the config automatically.
