"""Copy e2e screenshots into public/screens as small JPEGs (top of each page) for the 'not deployed yet' preview.
Run after `npm run e2e`:  python3 scripts/screens.py"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, DST = ROOT / "e2e" / "artifacts", ROOT / "public" / "screens"
MAP = {"swap": "07-swap", "explore": "08-explore", "book": "04-book", "my": "14-reweight", "arbitrage": "05-arbitrage",
       "demo": "13-demo", "share": "16-share", "launch": "03-launch"}
DST.mkdir(parents=True, exist_ok=True)
for name, shot in MAP.items():
    im = Image.open(SRC / f"{shot}.png").convert("RGB")
    im = im.crop((100, 0, im.width - 100, min(im.height, 1300)))  # drop the empty side margins
    im.thumbnail((1100, 1300))
    im.save(DST / f"{name}.jpg", quality=78, optimize=True, progressive=True)
    print(name, im.size, (DST / f"{name}.jpg").stat().st_size // 1024, "KB")
