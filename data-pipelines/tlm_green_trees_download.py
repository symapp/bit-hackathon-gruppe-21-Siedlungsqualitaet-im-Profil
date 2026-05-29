"""Download swissTLM3D GeoPackage from geo.admin.ch STAC (same source as other pipelines)."""

from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

import pystac_client
import requests

STAC_URL = "https://data.geo.admin.ch/api/stac/v1/"
COLLECTION_ID = "ch.swisstopo.swisstlm3d"
DEFAULT_CACHE_DIR = Path("../data/swisstlm3d")


def _latest_stac_item(client: pystac_client.Client):
    search = client.search(collections=[COLLECTION_ID])
    items = list(search.items())
    if not items:
        raise RuntimeError(f"No STAC items for collection {COLLECTION_ID}")

    def sort_key(item) -> str:
        return str(item.properties.get("datetime") or item.id)

    return max(items, key=sort_key)


def _gpkg_zip_asset(item) -> tuple[str, str]:
    candidates: list[tuple[str, str]] = []
    for key, asset in item.assets.items():
        href = str(asset.href)
        if ".gpkg.zip" in key.lower() or href.lower().endswith(".gpkg.zip"):
            candidates.append((key, href))
    if not candidates:
        raise RuntimeError(f"No .gpkg.zip asset on STAC item {item.id}")
    return candidates[0]


def download_swisstlm3d_gpkg(
    cache_dir: Path = DEFAULT_CACHE_DIR,
    *,
    force: bool = False,
) -> Path:
    """Download and extract the latest national swissTLM3D GeoPackage; return path to .gpkg."""
    cache_dir = cache_dir.resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)

    extracted_marker = cache_dir / ".extracted"
    existing = sorted(cache_dir.glob("*.gpkg"))
    if existing and extracted_marker.exists() and not force:
        print(f"Using cached swissTLM3D GeoPackage: {existing[0]}", flush=True)
        return existing[0]

    print(f"Connecting to STAC API at {STAC_URL}...")
    client = pystac_client.Client.open(STAC_URL)
    item = _latest_stac_item(client)
    asset_key, zip_url = _gpkg_zip_asset(item)
    print(f"STAC item {item.id}, asset {asset_key}")

    zip_path = cache_dir / Path(zip_url).name
    if zip_path.exists() and not force:
        print(f"Using cached zip: {zip_path}")
    else:
        if zip_path.exists():
            zip_path.unlink()
        print(f"Downloading {zip_url} ...")
        _download_large(zip_url, zip_path)

    extract_dir = cache_dir / item.id
    if extract_dir.exists() and force:
        shutil.rmtree(extract_dir)
    extract_dir.mkdir(parents=True, exist_ok=True)

    gpkg_files = list(extract_dir.rglob("*.gpkg"))
    if not gpkg_files or force:
        print(f"Extracting {zip_path.name} ...")
        with zipfile.ZipFile(zip_path, "r") as archive:
            archive.extractall(extract_dir)
        gpkg_files = list(extract_dir.rglob("*.gpkg"))

    if not gpkg_files:
        raise FileNotFoundError(f"No .gpkg found inside {zip_path}")

    gpkg_path = max(gpkg_files, key=lambda p: p.stat().st_size)
    extracted_marker.write_text(f"{item.id}\n{gpkg_path.name}\n", encoding="utf-8")
    print(f"Extracted GeoPackage: {gpkg_path}")
    return gpkg_path


def _download_large(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=600) as response:
        response.raise_for_status()
        total = int(response.headers.get("content-length") or 0)
        written = 0
        last_reported = 0
        with dest.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=8 * 1024 * 1024):
                if not chunk:
                    continue
                handle.write(chunk)
                written += len(chunk)
                if total and written - last_reported >= 100 * 1024 * 1024:
                    print(f"  … {written / 1024 / 1024:.0f} MiB / {total / 1024 / 1024:.0f} MiB")
                    last_reported = written
        if total:
            print(f"Downloaded {written / 1024 / 1024:.1f} MiB to {dest}")
        else:
            print(f"Downloaded {written / 1024 / 1024:.1f} MiB to {dest}")
