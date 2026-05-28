import argparse
import geopandas as gpd
from geocube.api.core import make_geocube
from pathlib import Path
import shutil
import tempfile
import urllib.request
import zipfile
from zarr_b2_upload import upload_zarr

# Public Transport Quality Classes 2026
GPKG_ZIP_URL = "https://data.geo.admin.ch/ch.are.gueteklassen_oev/gueteklassen_oev_2026/gueteklassen_oev_2026_2056.gpkg.zip"


def download_and_extract_gpkg(url: str) -> Path:
    print(f"Downloading {url}...")
    with urllib.request.urlopen(url) as response:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_zip:
            shutil.copyfileobj(response, temp_zip)
            temp_zip_path = Path(temp_zip.name)

    temp_dir = Path(tempfile.mkdtemp())
    with zipfile.ZipFile(temp_zip_path, "r") as zip_ref:
        zip_ref.extractall(temp_dir)
    
    temp_zip_path.unlink()
    
    # Find the .gpkg file in the extracted directory
    gpkg_files = list(temp_dir.glob("*.gpkg"))
    if not gpkg_files:
        raise FileNotFoundError("No .gpkg file found in the zip archive")
    
    return gpkg_files[0]


def main():
    parser = argparse.ArgumentParser(
        description="Rasterize public transport quality categories and write GeoZarr."
    )
    parser.add_argument(
        "--out",
        type=str,
        default="pt_quality_swiss_grid_100m.zarr",
        help="Output Zarr path.",
    )
    parser.add_argument(
        "--upload", action="store_true", help="Upload to Backblaze B2 after writing."
    )
    parser.add_argument(
        "--remote-name",
        type=str,
        default=None,
        help="Object prefix inside the B2 bucket (defaults to the output .zarr folder name).",
    )
    args = parser.parse_args()

    gpkg_file_path = download_and_extract_gpkg(GPKG_ZIP_URL)

    try:
        print(f"Reading {gpkg_file_path}...")
        # Specifically use the layer 'OeV_Gueteklassen_ARE'
        geodata = gpd.read_file(gpkg_file_path, layer='OeV_Gueteklassen_ARE')

        print("Mapping classes to numeric values...")
        # Map classes A-D to numeric values 4-1
        class_mapping = {"A": 4, "B": 3, "C": 2, "D": 1}
        geodata["KLASSE_NUM"] = geodata["KLASSE"].map(class_mapping).fillna(0)

        resolution = 100

        print(f"Rasterizing to {resolution}m grid...")
        aligned_grid = make_geocube(
            vector_data=geodata,
            measurements=["KLASSE_NUM"],
            resolution=(-resolution, resolution),
            output_crs="EPSG:2056",
            fill=0,
        )

        zarr_path = args.out
        print(f"Writing to {zarr_path}...")
        aligned_grid.to_zarr(zarr_path, mode="w")

        print(f"Success! GeoZarr created at: {zarr_path}")

        if args.upload:
            remote = upload_zarr(zarr_path, remote_name=args.remote_name)
            print(f"Uploaded to {remote}")

    finally:
        # Cleanup: remove the temp directory and its contents
        if gpkg_file_path.exists():
            temp_dir = gpkg_file_path.parent
            shutil.rmtree(temp_dir)


if __name__ == "__main__":
    main()
