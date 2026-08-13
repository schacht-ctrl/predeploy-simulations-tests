#!/usr/bin/env python3
"""
Erzeugt manifest.json im Repo-Root.

Das Dashboard liest dieses Manifest über raw.githubusercontent.com und braucht
dafür keine GitHub-API (kein Zugriffslimit, funktioniert auch in Netzen, die
api.github.com blocken). Als Fallback nutzt das Dashboard weiterhin die API,
falls das Manifest fehlt.

Aufruf:  python3 scripts/build_manifest.py
Wird zusätzlich von .github/workflows/manifest.yml bei jedem Push ausgeführt.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_DIR = re.compile(r"^[Vv]\d+")
OUT = ROOT / "manifest.json"


def git_blob_sha(path: Path) -> str:
    """Gleiche SHA, die auch die GitHub-Contents-API liefert."""
    data = path.read_bytes()
    h = hashlib.sha1()
    h.update(b"blob %d\0" % len(data))
    h.update(data)
    return h.hexdigest()


def version_sort_key(name: str):
    m = re.search(r"\d+", name)
    return (int(m.group()) if m else 10**6, name)


def build() -> dict:
    versions = []
    for d in sorted((p for p in ROOT.iterdir() if p.is_dir() and VERSION_DIR.match(p.name)),
                    key=lambda p: version_sort_key(p.name)):
        files = []
        for f in sorted(d.glob("*.csv")):
            files.append({
                "name": f.name,
                "path": f"{d.name}/{f.name}",
                "sha": git_blob_sha(f),
                "size": f.stat().st_size,
            })
        if not files:
            print(f"Hinweis: Ordner {d.name} enthält keine CSV-Dateien – wird übersprungen.")
            continue
        versions.append({"id": d.name.upper(), "folder": d.name, "files": files})
    return {
        "schema": 1,
        "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "versions": versions,
    }


def main() -> int:
    manifest = build()
    new = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    old = OUT.read_text(encoding="utf-8") if OUT.exists() else ""

    # Nur der Zeitstempel unterscheidet sich? Dann nicht neu schreiben,
    # damit der Workflow keine leeren Commits erzeugt.
    def strip_ts(txt: str) -> str:
        return re.sub(r'"generated":\s*"[^"]*",?', "", txt)

    if old and strip_ts(old) == strip_ts(new):
        print("manifest.json ist aktuell – keine Änderung.")
        return 0

    OUT.write_text(new, encoding="utf-8")
    n_files = sum(len(v["files"]) for v in manifest["versions"])
    print(f"manifest.json geschrieben: {len(manifest['versions'])} Versionen, {n_files} Dateien.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
