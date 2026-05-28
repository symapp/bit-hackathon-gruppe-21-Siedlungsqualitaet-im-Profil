"""Upload local Zarr stores to Backblaze B2 via the S3-compatible API."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
for _env_path in (_REPO_ROOT / ".env", Path(__file__).resolve().parent / ".env"):
    if _env_path.is_file():
        load_dotenv(_env_path)
        break
else:
    load_dotenv()

B2_KEY_ID = os.getenv("B2_KEY_ID")
B2_APPLICATION_KEY = os.getenv("B2_APPLICATION_KEY")
ENDPOINT_URL = os.getenv(
    "B2_ENDPOINT_URL", "https://s3.eu-central-003.backblazeb2.com"
)
BUCKET_NAME = os.getenv("B2_BUCKET_NAME", "egov-hackathon")


def credentials_configured() -> bool:
    return bool(B2_KEY_ID and B2_APPLICATION_KEY)


def upload_zarr(local_path: Path | str, remote_name: str | None = None) -> str:
    """Upload a local Zarr directory to B2. Returns the remote s3:// path."""
    if not credentials_configured():
        raise RuntimeError(
            "B2 credentials missing. Set B2_KEY_ID and B2_APPLICATION_KEY."
        )

    local = Path(local_path)
    if not local.is_dir():
        raise FileNotFoundError(f"Local Zarr store not found: {local}")

    remote = remote_name or local.name
    target_path = f"{BUCKET_NAME}/{remote}"

    import s3fs

    print("Connecting to Backblaze B2...")
    fs = s3fs.S3FileSystem(
        key=B2_KEY_ID,
        secret=B2_APPLICATION_KEY,
        endpoint_url=ENDPOINT_URL,
        config_kwargs={"max_pool_connections": 50},
    )

    print(f"Uploading '{local}' to 's3://{target_path}'...")
    fs.put(lpath=str(local), rpath=target_path, recursive=True)
    print("Upload completed successfully!")
    return f"s3://{target_path}"
