import argparse
import geopandas as gpd
from geocube.api.core import make_geocube
from pathlib import Path
import shutil
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
    parser.add_argument(
        "--remote-name",
        default=None,
        help="Object prefix inside the B2 bucket (defaults to the output .zarr folder name).",
    )
    args = parser.parse_args()

    gpkg_file_path = download_gpkg(GPKG_URL)

    try:
        geodata = gpd.read_file(gpkg_file_path)

        resolution = 100

        aligned_grid = make_geocube(
            vector_data=geodata,
            measurements=["OeV_Erreichb_EW"],
            resolution=(-resolution, resolution),
            output_crs="EPSG:2056",
            fill=0,
        )

        aligned_grid.to_zarr(args.out, mode="w")

        print(f"Success! GeoZarr created at: {args.out}")
        print(aligned_grid.head())

        if args.upload:
            remote = upload_zarr(args.out, remote_name=args.remote_name)
            print(f"Uploaded to {remote}")
    finally:
        gpkg_file_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
