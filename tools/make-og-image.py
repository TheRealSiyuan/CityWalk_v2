# Builds marketing/og-1200x630.jpg, the link-preview image shown when someone pastes the
# game's address into a chat app. Source: an in-game capture (marketing/screenshots/gameplay-300.jpg).
# Font: Poppins Bold (SIL Open Font License), rasterised into the image only.
# Usage: python3 tools/make-og-image.py
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'marketing/screenshots/gameplay-300.jpg'
OUT = ROOT / 'marketing/og-1200x630.jpg'
FONT = '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
W, H = 1200, 630

img = Image.open(SRC).convert('RGB')
# Crop to 1200:630 keeping the sky (title space) and the rooftop, then scale.
sw, sh = img.size
ch = round(sw * H / W)
img = img.crop((0, 0, sw, min(sh, ch))).resize((W, H), Image.LANCZOS)

d = ImageDraw.Draw(img)
ink, cream = (58, 44, 37), (255, 246, 230)


def centred(text: str, size: int, y: int, stroke: int) -> None:
    f = ImageFont.truetype(FONT, size)
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=cream, stroke_width=stroke, stroke_fill=ink)


centred('CityWalk', 104, 18, 8)
centred('Swing through London', 46, 150, 5)
img.save(OUT, quality=84, optimize=True, progressive=True)
print(OUT.relative_to(ROOT), img.size, OUT.stat().st_size, 'bytes')
