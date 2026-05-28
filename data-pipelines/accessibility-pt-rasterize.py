import argparse
import shutil
import geopandas as gpd
import numpy as np
from geocube.api.core import make_geocube

from are_rasterize_lib import align_geocube_to_swiss_100m_grid, write_swiss_grid_zarr
from pathlib import Path
import tempfile
import urllib.request

from zarr_b2_upload import upload_zarr

GPKG_URL = "https://data.geo.admin.ch/ch.are.erreichbarkeit-oev/erreichbarkeit-oev/erreichbarkeit-oev_2056.gpkg"
DEFAULT_ZARR_PATH = "erreichbarkeit_swiss_grid_100m.zarr"


def download_gpkg(url: str) -> Path:
    with urllib.request.urlopen(url) as response:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".gpkg") as temp_file:
            shutil.copyfileobj(response, temp_file)
            return Path(temp_file.name)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rasterize public transport accessibility and write GeoZarr."
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(DEFAULT_ZARR_PATH),
        help="Output .zarr directory.",
    )
    parser.add_argument("--upload", action="store_true", help="Upload to Backblaze B2 after writing.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing output directory.")
    parser.add_argument(
        "--percentile-cutoff",
        type=float,
        default=5.0,
        help="Percentage of data to cut off from top and bottom for normalization (default: 5.0).",
    )
    parser.add_argument(
        "--remote-name",
        default=None,
        help="Object prefix inside the B2 bucket (defaults to the output .zarr folder name).",
    )
    args = parser.parse_args()

    if args.out.exists():
        if args.force:
            print(f"Removing existing output: {args.out}")
            shutil.rmtree(args.out)
        else:
            raise RuntimeError(f"Output already exists: {args.out}. Use --force to overwrite.")

    gpkg_file_path = download_gpkg(GPKG_URL)

    try:
        geodata = gpd.read_file(gpkg_file_path)

        print(f"Normalizing accessibility values (percentile-based, cutoff={args.percentile_cutoff}%)...")
        p_low = np.percentile(geodata["OeV_Erreichb_EW"], args.percentile_cutoff)
        p_high = np.percentile(geodata["OeV_Erreichb_EW"], 100 - args.percentile_cutoff)
        
        # Avoid division by zero
        if p_high == p_low:
             geodata["pt_accessibility_score"] = (geodata["OeV_Erreichb_EW"] > p_low).astype(float)
        else:
            geodata["pt_accessibility_score"] = (geodata["OeV_Erreichb_EW"] - p_low) / (p_high - p_low)
            geodata["pt_accessibility_score"] = geodata["pt_accessibility_score"].clip(0.0, 1.0)

        resolution = 100

        geocube_grid = make_geocube(
            vector_data=geodata,
            measurements=["pt_accessibility_score"],
            resolution=(-resolution, resolution),
            output_crs="EPSG:2056",
            fill=0,
        )
        aligned_grid = align_geocube_to_swiss_100m_grid(geocube_grid, fill_value=0)

        write_swiss_grid_zarr(aligned_grid, args.out)

        print(f"Success! GeoZarr created at: {args.out}")
        print(aligned_grid.head())

        if args.upload:
            remote = upload_zarr(args.out, remote_name=args.remote_name)
            print(f"Uploaded to {remote}")
    finally:
        gpkg_file_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
