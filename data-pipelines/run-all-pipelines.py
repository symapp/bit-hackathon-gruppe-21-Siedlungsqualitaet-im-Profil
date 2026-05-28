import argparse
import subprocess
import sys
from pathlib import Path

# List of pipelines to run
PIPELINES = [
    "accessibility-pt-rasterize.py",
    "density-rasterize.py",
    "pt-quality-rasterize.py",
    "tranquillity-rasterize.py",
]

def main():
    parser = argparse.ArgumentParser(description="Run all data pipelines sequentially.")
    parser.add_argument(
        "--upload", action="store_true", help="Upload results to B2 bucket for all pipelines."
    )
    parser.add_argument(
        "--force", action="store_true", help="Overwrite existing output files/directories."
    )
    parser.add_argument(
        "--percentile-cutoff",
        type=float,
        default=5.0,
        help="Percentage of data to cut off from top and bottom for normalization (default: 5.0).",
    )
    args = parser.parse_args()

    base_path = Path(__file__).parent
    
    extra_flags = []
    if args.upload:
        extra_flags.append("--upload")
    if args.force:
        extra_flags.append("--force")
    
    extra_flags.extend(["--percentile-cutoff", str(args.percentile_cutoff)])

    for pipeline in PIPELINES:
        pipeline_path = base_path / pipeline
        if not pipeline_path.exists():
            print(f"Error: Pipeline script {pipeline} not found in {base_path}")
            continue

        print(f"\n{'='*60}")
        print(f"Running pipeline: {pipeline}")
        print(f"{'='*60}\n")

        # Use 'uv run python' to ensure the correct environment is used
        cmd = ["uv", "run", "python", str(pipeline_path)] + extra_flags
        
        try:
            subprocess.run(cmd, check=True)
            print(f"\nSuccessfully completed {pipeline}\n")
        except subprocess.CalledProcessError as e:
            print(f"\nError: Pipeline {pipeline} failed with exit code {e.returncode}\n")
            sys.exit(e.returncode)

    print("\nAll pipelines completed successfully!")

if __name__ == "__main__":
    main()
