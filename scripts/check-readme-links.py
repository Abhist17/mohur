"""README code links point at exact lines (…/File.sol#L393). Code moves, links don't: this pins each link to the
text it should land on, so CI fails when a line link drifts.
  python3 scripts/check-readme-links.py           check
  python3 scripts/check-readme-links.py --update  re-pin after verifying the links by hand"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIN = ROOT / "scripts" / "readme-links.json"
LINK = re.compile(r"\[([^\]]+)\]\(https://github\.com/Abhist17/mohur/blob/main/([^)#]+)#L(\d+)\)")

def target(path: str, line: int) -> str:
    lines = (ROOT / path).read_text().split("\n")
    return lines[line - 1].strip()[:80] if 0 < line <= len(lines) else "<past end of file>"

links = [(m.group(1), m.group(2), int(m.group(3))) for m in LINK.finditer((ROOT / "README.md").read_text())]
now = {f"{label} -> {path}#L{line}": target(path, line) for label, path, line in links}
if "--update" in sys.argv:
    PIN.write_text(json.dumps(now, indent=1, ensure_ascii=False) + "\n")
    print(f"pinned {len(now)} README line links")
    sys.exit(0)
pinned = json.loads(PIN.read_text())
bad = [f"{k}\n    expected: {pinned.get(k, '<new link: run with --update>')}\n    now:      {v}" for k, v in now.items() if pinned.get(k) != v]
if bad:
    print("README line links drifted:\n  " + "\n  ".join(bad))
    sys.exit(1)
print(f"all {len(now)} README line links land on their pinned code")
