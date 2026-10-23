import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest = (root / "SKILL.md").read_bytes()
rubric = (root / "references" / "rubric.md").read_bytes()
print(json.dumps({
    "proof": {
        "skill": "topic-assessment",
        "version": "1.0.0",
        "manifest_sha256": hashlib.sha256(manifest).hexdigest(),
        "rubric_sha256": hashlib.sha256(rubric).hexdigest(),
    },
    "manifest": manifest.decode("utf-8"),
    "rubric": rubric.decode("utf-8"),
}, ensure_ascii=False))
