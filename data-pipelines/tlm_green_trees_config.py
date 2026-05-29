"""swissTLM3D 2.4 filters for Grünflächen (Bodenbedeckung) and Einzelbaum density.

Object catalogue: swisstopo swissTLM3D 2.4 Objektkatalog (Topic TLM_BB).
https://www.swisstopo.admin.ch/de/landschaftsmodell-swisstlm3d
"""

from __future__ import annotations

# TLM_BODENBEDECKUNG Objektart names (ILI + catalogue codes 6, 11–13, 14).
GREEN_BODENBEDECKUNG_OBJART_NAMES: frozenset[str] = frozenset(
    {
        "Gehoelzflaeche",
        "Gebueschwald",
        "Wald",
        "Wald_offen",
        "Feuchtgebiet",
    }
)

# Numeric Objektart codes from the swissTLM3D object catalogue (Bodenbedeckung).
GREEN_BODENBEDECKUNG_OBJART_CODES: frozenset[int] = frozenset({6, 11, 12, 13, 14})

# TLM_EINZELBAUM_GEBUESCH: ObjectVal / Objektart code 1 = Einzelbaum (isolated tree ≥ 5 m).
SINGLE_TREE_OBJART_NAMES: frozenset[str] = frozenset({"Einzelbaum"})
SINGLE_TREE_OBJECTVAL_CODES: frozenset[int] = frozenset({1})

BODENBEDECKUNG_LAYER_HINTS: tuple[str, ...] = (
    "TLM_BODENBEDECKUNG",
    "bodenbedeckung",
)

EINZELBAUM_LAYER_HINTS: tuple[str, ...] = (
    "TLM_EINZELBAUM_GEBUESCH",
    "einzelbaum",
)

OBJART_COLUMN_CANDIDATES: tuple[str, ...] = (
    "Objektart",
    "OBJART",
    "objektart",
    "ObjectVal",
    "OBJECTVAL",
    "objectval",
)

DEFAULT_OUT_ZARR = "tlm_green_trees_swiss_grid_100m.zarr"
COMPOSITE_VARIABLE = "green_amenity_index"
CELL_AREA_M2 = 10_000.0
TREES_PER_HA_FACTOR = 100.0  # count per 100 m cell × 100 → trees/ha
