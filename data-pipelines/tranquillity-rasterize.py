import pystac_client
import rioxarray
import zarr

# Swiss Federal Geoportal STAC API endpoint
STAC_URL = "https://data.geo.admin.ch/api/stac/v1/"
COLLECTION_ID = "ch.bafu.tranquillity-karte"

print(f"Connecting to STAC API at {STAC_URL}...")
client = pystac_client.Client.open(STAC_URL)

# Query the STAC API for the Tranquillity map collection
search = client.search(collections=[COLLECTION_ID])
items = list(search.items())

if not items:
    print(f"No data items found for collection: {COLLECTION_ID}")
    exit()
    
# Typically, the collection contains one main composite item for the country
item = items[0]
print(f"Found STAC item: {item.id}")

# Locate the Cloud Optimized GeoTIFF (COG) asset URL
cog_url = None
for key, asset in item.assets.items():
    if str(asset.href).endswith('.tif'):
        cog_url = asset.href
        break
        
# Fallback if no explicit .tif is found
if not cog_url:
    cog_url = item.assets[list(item.assets.keys())[1]].href
    
print(f"Streaming data from COG URL: {cog_url}")

# Open the GeoTIFF lazily using chunks so it doesn't overwhelm your RAM
# rioxarray automatically parses the spatial projection (CRS) and affine transforms
da = rioxarray.open_rasterio(cog_url, chunks={'x': 1024, 'y': 1024})

# Convert DataArray to Dataset (Zarr formatting natively prefers Datasets)
ds = da.to_dataset(name="tranquillity_index")

zarr_store_path = "ch_bafu_tranquillity_karte.zarr"
print(f"Writing dataset to GeoZarr: {zarr_store_path} ...")

# Export to Zarr format. 'consolidated=True' optimizes metadata reading for cloud stores.
ds.to_zarr(zarr_store_path, mode='w', consolidated=True)
print("Successfully converted and saved to GeoZarr!")


