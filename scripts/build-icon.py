#!/usr/bin/env python3
"""Build the Stellaview desktop icon from the supplied source image.

The source is a landscape JPEG with a cream background and a gold emblem.
This script isolates the emblem, removes the background, and composites it
onto a dark, rounded app tile with a subtle glow and shadow.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from statistics import median

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "stellaview-logo-source.jpeg"
OUTPUT = ROOT / "build" / "icon.png"
SIZE = 1024
RADIUS = 226


def background_color(image: Image.Image) -> tuple[int, int, int]:
    """Estimate the flat background color from the image border."""
    width, height = image.size
    pixels = image.load()
    samples = []
    step = 4
    band = 40
    for x in range(0, width, step):
        for y in list(range(0, band, step)) + list(range(height - band, height, step)):
            samples.append(pixels[x, y])
    for y in range(0, height, step):
        for x in list(range(0, band, step)) + list(range(width - band, width, step)):
            samples.append(pixels[x, y])
    return tuple(int(median([sample[i] for sample in samples])) for i in range(3))


def subject_bounds(image: Image.Image, bg: tuple[int, int, int], threshold: float):
    """Find the bounding box of pixels that differ from the background."""
    width, height = image.size
    pixels = image.load()
    xs, ys = [], []
    for y in range(0, height, 3):
        for x in range(0, width, 3):
            r, g, b = pixels[x, y]
            distance = ((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2) ** 0.5
            if distance > threshold:
                xs.append(x)
                ys.append(y)
    if not xs:
        return 0, 0, width, height
    padding = 24
    return (
        max(0, min(xs) - padding),
        max(0, min(ys) - padding),
        min(width, max(xs) + padding + 1),
        min(height, max(ys) + padding + 1),
    )


def extract_subject(image: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    """Crop the emblem and build a soft alpha mask that removes the background."""
    bounds = subject_bounds(image, bg, 35)
    crop = image.crop(bounds).convert("RGB")
    crop = ImageEnhance.Color(crop).enhance(1.18)
    crop = ImageEnhance.Contrast(crop).enhance(1.06)

    pixels = crop.load()
    width, height = crop.size
    alpha = Image.new("L", crop.size, 0)
    alpha_pixels = alpha.load()
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            distance = ((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2) ** 0.5
            value = int(max(0, min(255, (distance - 26) / 24 * 255)))
            alpha_pixels[x, y] = value

    alpha = alpha.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    subject = crop.convert("RGBA")
    subject.putalpha(alpha)
    box = alpha.getbbox()
    if box:
        subject = subject.crop(box)
    subject.thumbnail((790, 790), Image.Resampling.LANCZOS)
    return subject


def make_tile() -> Image.Image:
    """Draw the dark rounded-square background with a soft radial glow."""
    tile = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pixels = tile.load()
    inset = 10
    for y in range(inset, SIZE - inset):
        vertical = y / SIZE
        for x in range(inset, SIZE - inset):
            horizontal = x / SIZE
            t = horizontal * 0.45 + vertical * 0.55
            r = int(9 + t * 17)
            g = int(13 + t * 17)
            b = int(40 + t * 42)

            dx = (horizontal - 0.5) * 1.05
            dy = (vertical - 0.44) * 1.18
            glow = max(0.0, 1 - (dx * dx + dy * dy) ** 0.5 / 0.62) ** 2
            r = min(255, int(r + 255 * glow * 0.09))
            g = min(255, int(g + 205 * glow * 0.11))
            b = min(255, int(b + 120 * glow * 0.08))
            pixels[x, y] = (r, g, b, 255)

    mask = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((inset, inset, SIZE - inset, SIZE - inset), radius=RADIUS, fill=255)
    tile.putalpha(mask)

    border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border)
    border_draw.rounded_rectangle(
        (inset + 1, inset + 1, SIZE - inset - 1, SIZE - inset - 1),
        radius=RADIUS - 1,
        outline=(129, 214, 237, 58),
        width=2,
    )
    tile.alpha_composite(border)
    return tile


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    bg = background_color(source)
    subject = extract_subject(source, bg)

    canvas = make_tile()

    left = (SIZE - subject.width) // 2
    top = (SIZE - subject.height) // 2 - 18

    # Soft drop shadow beneath the emblem.
    shadow_alpha = Image.new("L", (SIZE, SIZE), 0)
    shadow_alpha.paste(subject.getchannel("A"), (left, top + 20))
    shadow_alpha = shadow_alpha.filter(ImageFilter.GaussianBlur(24)).point(
        lambda value: int(value * 0.5)
    )
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow.putalpha(shadow_alpha)
    canvas.alpha_composite(shadow)

    canvas.alpha_composite(subject, (left, top))

    canvas.save(OUTPUT)
    print(f"wrote {OUTPUT} ({canvas.size[0]}x{canvas.size[1]}, emblem {subject.size})")


if __name__ == "__main__":
    main()
