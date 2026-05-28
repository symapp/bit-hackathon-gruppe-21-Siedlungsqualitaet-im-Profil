# Frontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.12.

## Install

Use any package manager (`npm`, `pnpm`, or `bun`). A `postinstall` step applies a small patch to `@carbonplan/zarr-layer` (BigInt-safe reads and missing `band` dimension) via [patch-package](https://github.com/ds300/patch-package).

```bash
cd frontend
npm install   # or: pnpm install / bun install
```

## Development server

To start a local development server, run:

```bash
npm start
```

Or:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Settlement-quality preferences

Each factor uses an interactive **trapezoid** editor (plateau = score 100, linear falloff outside). **Wichtigkeit** controls the weighted overview score and composite map.

Normalization uses `settlement-layer-meta.json` next to each GeoZarr (`p5`, `p95`, `higherIsBetter`) from the data pipelines. Until meta is deployed, the UI falls back to `clim` from `zarr-layers.config.ts`.

Default preferences follow a **“good place to live”** profile (`good-place-defaults.config.ts`). Use **Sinnvolle Defaults** in the sidebar to reset.

## Running end-to-end tests

Playwright tests cover the MapLibre Zarr overlay (layer registration, visible raster colors, sidebar score, trapezoid editor).

```bash
cd frontend
npm install
npx playwright install chromium
npm run e2e
```

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
