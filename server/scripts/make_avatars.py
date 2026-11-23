"""Generate placeholder player photos as WebP at two sizes (64px and 128px).

Two sizes let the browser pick the right one via srcset (1x vs 2x screens),
and WebP is ~25-35% smaller than PNG/JPEG for the same quality.
Usage: python3 make_avatars.py <out_dir>
"""
import sys, hashlib, os
from PIL import Image, ImageDraw, ImageFont

NAMES = ["Nova", "Kai", "Rhea", "Jonas", "Mira", "Theo", "Ana", "Leo", "Sana"]
out = sys.argv[1]
os.makedirs(out, exist_ok=True)

def font(size):
    for f in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"]:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()

for name in NAMES:
    h = hashlib.sha1(name.encode()).digest()
    c1, c2 = (h[0], h[1] // 2 + 60, h[2]), (h[3] // 2, h[4], h[5] // 2 + 100)
    big = 512
    img = Image.new("RGB", (big, big))
    d = ImageDraw.Draw(img)
    for y in range(big):  # diagonal-ish gradient background
        t = y / big
        d.line([(0, y), (big, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(c1, c2)))
    # simple "head and shoulders" silhouette
    d.ellipse([176, 110, 336, 270], fill=(255, 255, 255, 0), outline=None)
    d.ellipse([96, 300, 416, 640], fill=(255, 255, 255))
    d.ellipse([176, 110, 336, 270], fill=(255, 255, 255))
    f = font(120)
    d.text((big / 2, 400), name[0], font=f, anchor="mm", fill=c2)
    for size in (64, 128):
        img.resize((size, size), Image.LANCZOS).save(f"{out}/{name.lower()}-{size}.webp", "WEBP", quality=80)
print(f"wrote {len(NAMES) * 2} avatars to {out}")
