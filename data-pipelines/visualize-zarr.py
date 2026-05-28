from pathlib import Path

import leafmap.foliumap as leafmap
import rioxarray  # noqa: F401 - needed to register the .rio accessor on xarray objects
import streamlit as st
import xarray as xr


def discover_zarr_stores(search_root: Path) -> list[Path]:
    if not search_root.exists():
        return []

    zarr_dirs = sorted(search_root.rglob("*.zarr"))
    return [path for path in zarr_dirs if path.is_dir()]


def variable_options(ds: xr.Dataset) -> list[str]:
    return [name for name, data_var in ds.data_vars.items() if data_var.ndim >= 2]


st.set_page_config(page_title="Zarr Visualizer", layout="wide")
st.title("Dynamic GeoZarr Visualizer")
st.caption("Load and visualize any pipeline Zarr output dynamically.")

default_root = Path(__file__).resolve().parent
search_root_input = st.sidebar.text_input(
    "Search root directory",
    value=str(default_root),
    help="The app scans this folder recursively for '.zarr' stores.",
)
search_root = Path(search_root_input).expanduser()

if st.sidebar.button("Refresh Zarr list"):
    st.rerun()

zarr_candidates = discover_zarr_stores(search_root)

manual_path = st.sidebar.text_input(
    "Or enter a custom Zarr path",
    value="",
    help="Use this if your store is outside the search root.",
).strip()

selected_path: str | None = None
if manual_path:
    selected_path = manual_path
elif zarr_candidates:
    selected_path = st.sidebar.selectbox(
        "Discovered Zarr stores",
        options=[str(path) for path in zarr_candidates],
    )

if not selected_path:
    st.warning("No Zarr store selected. Add one or adjust the search root.")
    if not zarr_candidates:
        st.info("No '.zarr' directories were found in the selected root.")
    st.stop()

try:
    ds = xr.open_dataset(selected_path, engine="zarr", chunks={})
except Exception as err:
    st.error(f"Failed to open dataset: {err}")
    st.info("Ensure the selected path points to a valid Zarr store.")
    st.stop()

vars_for_map = variable_options(ds)
if not vars_for_map:
    st.error("No plottable variables found (expected at least 2 dimensions).")
    st.write("Available variables:", list(ds.data_vars))
    st.stop()

selected_variable = st.sidebar.selectbox("Variable", options=vars_for_map)
selected_cmap = st.sidebar.selectbox(
    "Color map",
    options=["viridis", "plasma", "magma", "cividis", "terrain"],
    index=0,
)
selected_opacity = st.sidebar.slider("Opacity", min_value=0.1, max_value=1.0, value=0.7, step=0.1)

data_slice = ds[selected_variable]
if data_slice.rio.crs is None:
    data_slice = data_slice.rio.write_crs("EPSG:2056")

m = leafmap.Map(center=[46.8, 8.2], zoom=8)
m.add_raster(
    data_slice,
    layer_name=selected_variable,
    cmap=selected_cmap,
    opacity=selected_opacity,
)
m.to_streamlit(height=700)

st.subheader("Dataset details")
st.write("Store path:", selected_path)
st.write("Variables:", list(ds.data_vars))
st.write("Dimensions:", dict(ds.sizes))
st.write("Dataset attributes:", ds.attrs)
