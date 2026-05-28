import geopandas as gpd
from geocube.api.core import make_geocube

gpkg_file_path = "~/Downloads/erreichbarkeit-oev_2056.gpkg"
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
