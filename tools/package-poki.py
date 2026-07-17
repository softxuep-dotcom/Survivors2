from hashlib import sha256
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
CLIENT_DIST = DIST / "client"
PACKAGE_JSON = ROOT / "package.json"

with PACKAGE_JSON.open(encoding="utf-8") as package_file:
    version = str(json.load(package_file)["version"])

safe_version = "".join(char for char in version if char.isalnum() or char in ".-_")
if not safe_version or safe_version != version:
    raise SystemExit(f"Invalid package version for ZIP filename: {version!r}")

OUTPUT = ROOT / f"horde-breaker-poki-v{safe_version}.zip"
LEGACY_OUTPUT = ROOT / "horde-breaker-poki.zip"

if not (CLIENT_DIST / "index.html").is_file():
    raise SystemExit("dist/index.html is missing; run npm run build first")

with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(CLIENT_DIST.rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(CLIENT_DIST).as_posix())

with ZipFile(OUTPUT) as archive:
    bad_file = archive.testzip()
    names = archive.namelist()

if bad_file:
    raise SystemExit(f"ZIP integrity check failed: {bad_file}")
if "index.html" not in names:
    raise SystemExit("ZIP must contain index.html at its root")
if OUTPUT.stat().st_size > 8 * 1024 * 1024:
    raise SystemExit("Poki package exceeds the 8 MiB target")

if LEGACY_OUTPUT.is_file():
    LEGACY_OUTPUT.unlink()

digest = sha256(OUTPUT.read_bytes()).hexdigest().upper()
print(f"Created {OUTPUT.name}: {OUTPUT.stat().st_size / 1024 / 1024:.2f} MiB, {len(names)} files")
print(f"ZIP: {OUTPUT}")
print(f"SHA-256: {digest}")
