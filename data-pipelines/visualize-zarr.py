import streamlit as st
import leafmap.foliumap as leafmap
import xarray as xr


zarr_path = input("input the path to the zarr dataset to visualize: ")
zarr_variable_name = input("input the variable name to visualize: ")
try:
    # 1. Open Zarr V3 (Xarray handles the zarr.json structure automatically)
    ds = xr.open_dataset(zarr_path, engine="zarr", chunks={})

    # 2. Assign the Swiss Grid CRS (EPSG:2056) if not detected
    if ds.rio.crs is None:
        ds = ds.rio.write_crs("EPSG:2056")

    # 3. Select the variable from your screenshot

    data_slice = ds[zarr_variable_name]

    # 4. Create Map
    m = leafmap.Map(center=[46.8, 8.2], zoom=8)  # Centered on Switzerland

    # add_raster will reproject EPSG:2056 to Web Mercator for the browser
    m.add_raster(
        data_slice,
        layer_name="Public Transport Accessibility",
        cmap="viridis",
        opacity=0.7,
    )

    m.to_streamlit(height=700)
    st.write("Metadata Detected:", ds.attrs)

except Exception as e:
    st.error(f"Error: {e}")
    st.info("Ensure you are pointing to the directory containing the 'zarr.json' file.")
