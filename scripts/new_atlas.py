#!/usr/bin/env python3
"""Copy the offline starter into a new project directory."""
import argparse
from pathlib import Path
from shutil import copytree


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="New directory for the atlas")
    destination = parser.parse_args().destination.expanduser().resolve()
    source = Path(__file__).resolve().parents[1] / "assets" / "starter"
    if destination == source or source in destination.parents:
        parser.error("Choose a directory outside the starter.")
    if destination.exists():
        parser.error(f"Destination already exists: {destination}")
    copytree(source, destination, ignore=lambda _, names: [n for n in names if n.startswith(".")])
    print(destination / "index.html")


if __name__ == "__main__":
    main()
