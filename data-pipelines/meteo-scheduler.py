"""Run meteo-fetch.py every 10 minutes as a blocking loop.

Usage:
    uv run python meteo-scheduler.py

The script fetches current Swiss meteo data from Open-Meteo, converts it to
GeoZarr format on the shared 100 m LV95 grid, uploads to Backblaze B2, and
writes a meteo_manifest.json so the Angular frontend can detect fresh data.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

INTERVAL_SECONDS = 10 * 60  # 10 minutes
SCRIPT = Path(__file__).parent / "meteo-fetch.py"


def run_once() -> None:
    print("=" * 60)
    print("Starting meteo fetch…")
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--upload"],
        check=False,
    )
    if result.returncode != 0:
        print(
            f"[WARNING] meteo-fetch.py exited with code {result.returncode}",
            file=sys.stderr,
        )


if __name__ == "__main__":
    print(f"Meteo scheduler started. Interval: {INTERVAL_SECONDS // 60} minutes.")
    print(f"Script: {SCRIPT}")
    print("Press Ctrl+C to stop.")
    try:
        while True:
            run_once()
            print(f"Sleeping {INTERVAL_SECONDS // 60} minutes until next fetch…")
            time.sleep(INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\nScheduler stopped.")
