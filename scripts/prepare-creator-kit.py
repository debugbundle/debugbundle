"""Build the creator kit from the existing DebugBundle artwork and sample."""
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
KIT_FILES = (
    ("README.md", "apps/web/creator-kit/README.md"),
    ("debugbundle-icon.png", "site/public/icon-512.png"),
    ("debugbundle-workflow-light.webp", "site/public/images/how-it-works-light.webp"),
    ("debugbundle-workflow-dark.webp", "site/public/images/how-it-works-dark.webp"),
    ("checkout.bundle.json", "site/public/demos/checkout.bundle.json"),
)

if __name__ == "__main__":
    destination = ROOT / "apps/web/public/creator-kit.zip"
    # The site assets live in a companion checkout. Keep the working download
    # intact if that checkout or an individual source file is missing.
    with TemporaryDirectory(dir=destination.parent) as staging:
        archive = Path(staging) / destination.name
        with ZipFile(archive, "w") as kit:
            for name, source in KIT_FILES:
                kit.writestr(ZipInfo(name), (ROOT / source).read_bytes(), ZIP_DEFLATED)
        archive.replace(destination)
