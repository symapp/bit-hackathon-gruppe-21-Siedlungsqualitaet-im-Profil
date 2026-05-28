# bit-hackathon-gruppe-21-Siedlungsqualit-t-im-Profil
Siedlungsqualität im Profil

## Data pipelines

Rasterize scripts write local `.zarr` stores. To upload to Backblaze B2 after conversion, set credentials and pass `--upload`:

Copy `.env.example` to `.env` at the repo root and set your Backblaze Application Key credentials (`.env` is gitignored).

```bash
cd data-pipelines
uv run python density-rasterize.py --year 2024 --upload
uv run python accessibility-pt-rasterize.py --upload
uv run python tranquillity-rasterize.py --upload

# Ten additional ARE indicators (Erreichbarkeit MIV, ÖV-Güte, Reisezeiten, Verkehr, …)
uv run python rasterize-are-metrics.py all-new --upload

# Or a single layer, e.g. Strassen-Erreichbarkeit:
uv run python rasterize-are-metrics.py miv-accessibility --upload
uv run python rasterize-are-metrics.py --list
```

Optional environment variables: `B2_ENDPOINT_URL` (default `https://s3.eu-central-003.backblazeb2.com`), `B2_BUCKET_NAME` (default `egov-hackathon`). Use `--remote-name` to override the object prefix in the bucket.
