"""Per-metric metadata for settlement-layer-meta.json (ARE batch rasterize)."""

from __future__ import annotations

METRIC_META: dict[str, tuple[bool, str]] = {
    "pt-accessibility": (True, "EW"),
    "miv-accessibility": (True, "EW"),
    "pt-quality": (True, "Nr."),
    "pt-travel-time": (False, "min"),
    "miv-travel-time": (False, "min"),
    "rail-traffic": (False, "DTV"),
    "road-traffic": (False, "DTV"),
    "secondary-homes": (False, "%"),
    "landscape-type": (True, "Nr."),
    "solar-potential": (True, "Stufe"),
    "tranquillity": (True, ""),
    "population-density": (False, "per km²"),
    "tlm-green-trees": (True, "Index"),
}
