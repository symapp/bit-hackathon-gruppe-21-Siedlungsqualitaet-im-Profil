import geopandas as gpd
from geocube.api.core import make_geocube
from pathlib import Path
import shutil
import tempfile
import urllib.request

GPKG_URL = "https://data.geo.admin.ch/ch.are.erreichbarkeit-oev/erreichbarkeit-oev/erreichbarkeit-oev_2056.gpkg"


def download_gpkg(url: str) -> Path:
    with urllib.request.urlopen(url) as response:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".gpkg") as temp_file:
            shutil.copyfileobj(response, temp_file)
            return Path(temp_file.name)


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

    zarr_path = "erreichbarkeit_swiss_grid_100m.zarr"
    aligned_grid.to_zarr(zarr_path, mode="w")

    print(f"Success! GeoZarr created at: {zarr_path}")
    print(aligned_grid.head())
finally:
    gpkg_file_path.unlink(missing_ok=True)
