"""Arcanist's own Winamp skins: light, dark and OLED, drawn here from scratch (no other skin's art).

    python skins-src/arcanist_skins.py        (needs Pillow; writes skins/Arcanist_*.wsz and their screenshots)

Every sprite sits where Webamp reads it (packages/webamp/js/skinSprites.ts) and every background where Webamp
puts the controls on it (packages/webamp/css). The output is reproducible: same script, same bytes.
"""

from __future__ import annotations

import io
import math
import os
import zipfile
from dataclasses import dataclass

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "skins")

Color = tuple[int, int, int]


def hex_(value: str) -> Color:
    return tuple(int(value[i : i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def mix(a: Color, b: Color, t: float) -> Color:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


@dataclass
class Theme:
    name: str
    face_top: Color  # the body's gradient
    face_bottom: Color
    light: Color  # bevels
    shadow: Color
    edge: Color  # the outer line
    lcd: Color  # displays
    lcd_edge: Color
    ghost: Color | None  # unlit LCD segments
    ink: Color  # LCD text
    ink_bright: Color
    label: Color  # text printed on the body
    accent: Color  # violet
    gold: Color  # Arcanist's bolt
    engraving: Color  # the astrolabe on the body
    title: Color  # title bar text
    title_dim: Color
    button_top: Color
    button_bottom: Color
    button_pressed: Color
    flat: bool = False  # OLED: lines on black, no fills


LIGHT = Theme(
    name="Light",
    face_top=hex_("#fbfaff"),
    face_bottom=hex_("#e7e3f4"),
    light=hex_("#ffffff"),
    shadow=hex_("#c3bcdb"),
    edge=hex_("#9d93c2"),
    lcd=hex_("#efeafd"),
    lcd_edge=hex_("#b7aedb"),
    ghost=hex_("#ded6f6"),
    ink=hex_("#4c1d95"),
    ink_bright=hex_("#6d28d9"),
    label=hex_("#6b6390"),
    accent=hex_("#7c3aed"),
    gold=hex_("#d97706"),
    engraving=hex_("#ddd7ef"),
    title=hex_("#4c1d95"),
    title_dim=hex_("#9d93c2"),
    button_top=hex_("#ffffff"),
    button_bottom=hex_("#e4dff3"),
    button_pressed=hex_("#d6cdf2"),
)

DARK = Theme(
    name="Dark",
    face_top=hex_("#221e35"),
    face_bottom=hex_("#110e1c"),
    light=hex_("#3b3459"),
    shadow=hex_("#07050d"),
    edge=hex_("#04030a"),
    lcd=hex_("#07060e"),
    lcd_edge=hex_("#2a2442"),
    ghost=hex_("#1a1530"),
    ink=hex_("#a78bfa"),
    ink_bright=hex_("#ddd6fe"),
    label=hex_("#8c83b3"),
    accent=hex_("#8b5cf6"),
    gold=hex_("#f59e0b"),
    engraving=hex_("#2a2440"),
    title=hex_("#ddd6fe"),
    title_dim=hex_("#6f6796"),
    button_top=hex_("#2f2948"),
    button_bottom=hex_("#1a1629"),
    button_pressed=hex_("#3d2f6e"),
)

OLED = Theme(
    name="OLED",
    face_top=hex_("#000000"),
    face_bottom=hex_("#000000"),
    light=hex_("#2b1d57"),
    shadow=hex_("#000000"),
    edge=hex_("#3b2a7a"),
    lcd=hex_("#000000"),
    lcd_edge=hex_("#2b1d57"),
    ghost=None,
    ink=hex_("#b69cff"),
    ink_bright=hex_("#f1ebff"),
    label=hex_("#6e5bb8"),
    accent=hex_("#a78bfa"),
    gold=hex_("#fbbf24"),
    engraving=hex_("#1c1240"),
    title=hex_("#e9e1ff"),
    title_dim=hex_("#5b4a9e"),
    button_top=hex_("#000000"),
    button_bottom=hex_("#000000"),
    button_pressed=hex_("#160d33"),
    flat=True,
)

# ── A 3×5 pixel font, Arcanist's own ───────────────────────────────────────────────────────────────

FONT: dict[str, str] = {
    "A": "010 101 111 101 101", "B": "110 101 110 101 110", "C": "011 100 100 100 011", "D": "110 101 101 101 110",
    "E": "111 100 110 100 111", "F": "111 100 110 100 100", "G": "011 100 101 101 011", "H": "101 101 111 101 101",
    "I": "111 010 010 010 111", "J": "001 001 001 101 010", "K": "101 101 110 101 101", "L": "100 100 100 100 111",
    "M": "101 111 111 101 101", "N": "110 101 101 101 101", "O": "010 101 101 101 010", "P": "110 101 110 100 100",
    "Q": "010 101 101 110 011", "R": "110 101 110 101 101", "S": "011 100 010 001 110", "T": "111 010 010 010 010",
    "U": "101 101 101 101 111", "V": "101 101 101 101 010", "W": "101 101 111 111 101", "X": "101 101 010 101 101",
    "Y": "101 101 010 010 010", "Z": "111 001 010 100 111",
    "0": "111 101 101 101 111", "1": "010 110 010 010 111", "2": "110 001 010 100 111", "3": "110 001 010 001 110",
    "4": "101 101 111 001 001", "5": "111 100 110 001 110", "6": "011 100 111 101 111", "7": "111 001 010 010 010",
    "8": "111 101 111 101 111", "9": "111 101 111 001 110",
    '"': "101 101 000 000 000", "@": "111 101 111 100 011", " ": "000 000 000 000 000", "…": "000 000 000 000 101",
    ".": "000 000 000 000 010", ":": "000 010 000 010 000", "(": "001 010 010 010 001", ")": "100 010 010 010 100",
    "-": "000 000 111 000 000", "'": "010 010 000 000 000", "!": "010 010 010 000 010", "_": "000 000 000 000 111",
    "+": "000 010 111 010 000", "\\": "100 100 010 001 001", "/": "001 001 010 100 100", "[": "011 010 010 010 011",
    "]": "110 010 010 010 110", "^": "010 101 000 000 000", "&": "010 101 010 101 011", "%": "101 001 010 100 101",
    ",": "000 000 000 010 100", "=": "000 111 000 111 000", "$": "011 110 010 011 110", "#": "101 111 101 111 101",
    "Å": "010 010 101 111 101", "Ö": "101 000 111 101 111", "Ä": "101 000 010 111 101", "?": "110 001 010 000 010",
    "*": "101 010 101 000 000",
}

# Where Webamp reads each character in text.bmp (row, column), as in skinSprites.ts.
TEXT_LAYOUT = (
    [(c, 0, i) for i, c in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ")]
    + [('"', 0, 26), ("@", 0, 27), (" ", 0, 30)]
    + [(c, 1, i) for i, c in enumerate("0123456789")]
    + [(c, 1, 10 + i) for i, c in enumerate("….:()-'!_+\\/[]^&%,=$#")]
    + [("Å", 2, 0), ("Ö", 2, 1), ("Ä", 2, 2), ("?", 2, 3), ("*", 2, 4)]
)


def glyph(img: Image.Image, x: int, y: int, char: str, color: Color) -> None:
    rows = FONT.get(char.upper(), FONT["?"]).split()
    for dy, row in enumerate(rows):
        for dx, bit in enumerate(row):
            if bit == "1":
                img.putpixel((x + dx, y + dy), color)


def text(img: Image.Image, x: int, y: int, value: str, color: Color, spacing: int = 1) -> int:
    for char in value:
        glyph(img, x, y, char, color)
        x += 3 + spacing
    return x


def text_width(value: str, spacing: int = 1) -> int:
    return len(value) * (3 + spacing) - spacing


# ── Drawing helpers ────────────────────────────────────────────────────────────────────────────────


def gradient(img: Image.Image, box: tuple[int, int, int, int], top: Color, bottom: Color) -> None:
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(img)
    for y in range(y0, y1 + 1):
        t = 0 if y1 == y0 else (y - y0) / (y1 - y0)
        d.line([(x0, y), (x1, y)], fill=mix(top, bottom, t))


def face(img: Image.Image, t: Theme, box: tuple[int, int, int, int]) -> None:
    gradient(img, box, t.face_top, t.face_bottom)


def raised(img: Image.Image, t: Theme, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(img)
    if t.flat:
        d.rectangle(box, outline=t.light)
        return
    d.line([(x0, y0), (x1, y0)], fill=t.light)
    d.line([(x0, y0), (x0, y1)], fill=t.light)
    d.line([(x0, y1), (x1, y1)], fill=t.shadow)
    d.line([(x1, y0), (x1, y1)], fill=t.shadow)


def sunken(img: Image.Image, t: Theme, box: tuple[int, int, int, int], fill: Color | None = None) -> None:
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(img)
    d.rectangle(box, fill=fill if fill is not None else t.lcd)
    if t.flat:
        d.rectangle(box, outline=t.lcd_edge)
        return
    d.line([(x0, y0), (x1, y0)], fill=t.shadow)
    d.line([(x0, y0), (x0, y1)], fill=t.shadow)
    d.line([(x0, y1), (x1, y1)], fill=t.light)
    d.line([(x1, y0), (x1, y1)], fill=t.light)
    d.rectangle((x0 + 1, y0 + 1, x1 - 1, y1 - 1), outline=t.lcd_edge)


def button(img: Image.Image, t: Theme, box: tuple[int, int, int, int], pressed: bool) -> None:
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(img)
    if t.flat:
        d.rectangle(box, fill=t.button_pressed if pressed else (0, 0, 0), outline=t.accent if pressed else t.light)
        return
    if pressed:
        d.rectangle(box, fill=t.button_pressed)
        d.line([(x0, y0), (x1, y0)], fill=t.shadow)
        d.line([(x0, y0), (x0, y1)], fill=t.shadow)
        d.line([(x0, y1), (x1, y1)], fill=t.light)
        d.line([(x1, y0), (x1, y1)], fill=t.light)
    else:
        gradient(img, box, t.button_top, t.button_bottom)
        raised(img, t, box)
    d.point([(x0, y0), (x1, y0), (x0, y1), (x1, y1)], fill=t.edge)


def polygon(img: Image.Image, points: list[tuple[float, float]], color: Color) -> None:
    ImageDraw.Draw(img).polygon(points, fill=color)


def bolt(img: Image.Image, x: int, y: int, color: Color) -> None:
    """Arcanist's lightning bolt, 7×11."""
    polygon(img, [(x + 4, y), (x, y + 6), (x + 3, y + 6), (x + 2, y + 10), (x + 6, y + 4), (x + 3, y + 4), (x + 5, y)], color)


def astrolabe(img: Image.Image, cx: float, cy: float, radius: float, color: Color, clip: tuple[int, int, int, int]) -> None:
    """The panel's astrolabe, engraved: rings, ticks and a star, clipped to a box."""
    layer = Image.new("RGB", img.size, (0, 0, 0))
    mask = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(mask)
    for r in (radius, radius * 0.82, radius * 0.5):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255)
    for i in range(48):
        a = i * math.tau / 48
        inner = radius * (0.9 if i % 4 else 0.84)
        d.line([(cx + math.cos(a) * inner, cy + math.sin(a) * inner), (cx + math.cos(a) * radius, cy + math.sin(a) * radius)], fill=255)
    star = [(cx + math.cos(-math.pi / 2 + i * 4 * math.pi / 5) * radius * 0.48, cy + math.sin(-math.pi / 2 + i * 4 * math.pi / 5) * radius * 0.48) for i in range(5)]
    d.line(star + [star[0]], fill=255)
    d.ellipse((cx - 2, cy - 2, cx + 2, cy + 2), outline=255)
    box = Image.new("L", img.size, 0)
    ImageDraw.Draw(box).rectangle(clip, fill=255)
    from PIL import ImageChops

    mask = ImageChops.multiply(mask, box)
    layer.paste(color, (0, 0, *img.size))
    img.paste(layer, (0, 0), mask)


def frame(img: Image.Image, t: Theme, box: tuple[int, int, int, int]) -> None:
    ImageDraw.Draw(img).rectangle(box, outline=t.edge)


# ── 7-segment digits (numbers.bmp) ─────────────────────────────────────────────────────────────────

SEGMENTS = {
    "a": (2, 0, 6, 0), "b": (6, 1, 7, 5), "c": (6, 7, 7, 11), "d": (2, 12, 6, 12),
    "e": (1, 7, 2, 11), "f": (1, 1, 2, 5), "g": (2, 6, 6, 6),
}
DIGITS = {
    0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg",
}


def digit(img: Image.Image, ox: int, oy: int, value: int | None, t: Theme) -> None:
    d = ImageDraw.Draw(img)
    lit = DIGITS.get(value, "") if value is not None else ""
    for name, (x0, y0, x1, y1) in SEGMENTS.items():
        color = t.ink_bright if name in lit else t.ghost
        if color is not None:
            d.rectangle((ox + x0, oy + y0, ox + x1, oy + y1), fill=color)


# ── The sheets ─────────────────────────────────────────────────────────────────────────────────────


def sheet(w: int, h: int, t: Theme) -> Image.Image:
    return Image.new("RGB", (w, h), t.face_bottom)


def main_bmp(t: Theme) -> Image.Image:
    img = sheet(275, 116, t)
    face(img, t, (0, 0, 274, 115))
    astrolabe(img, 236, 112, 62, t.engraving, (1, 14, 273, 114))
    raised(img, t, (1, 1, 273, 114))
    frame(img, t, (0, 0, 274, 115))
    # The display: time, visualizer, the clutter bar.
    sunken(img, t, (8, 20, 103, 63))
    # The time's colon (Winamp draws only the digits).
    d = ImageDraw.Draw(img)
    for y in (30, 34):
        d.rectangle((72, y, 73, y + 1), fill=t.ink_bright)
    # Song title.
    sunken(img, t, (108, 21, 267, 32))
    # Bitrate, sample rate, mono and stereo.
    sunken(img, t, (108, 40, 128, 51))
    text(img, 130, 43, "KBPS", t.label)
    sunken(img, t, (153, 40, 168, 51))
    text(img, 170, 43, "KHZ", t.label)
    # The logo: Arcanist's bolt in a ring (the "about" corner).
    d.ellipse((252, 90, 266, 104), outline=t.accent)
    bolt(img, 256, 92, t.gold)
    return img


def titlebar_bmp(t: Theme) -> Image.Image:
    img = sheet(344, 87, t)
    d = ImageDraw.Draw(img)

    def bar(y: int, selected: bool, shade: bool) -> None:
        box = (27, y, 27 + 274, y + 13)
        if t.flat:
            d.rectangle(box, fill=(0, 0, 0))
            d.line([(27, y + 13), (27 + 274, y + 13)], fill=t.accent if selected else t.light)
        else:
            gradient(img, box, mix(t.face_top, t.light, 0.35 if selected else 0.0), t.face_top if selected else t.face_bottom)
            d.line([(27, y + 13), (27 + 274, y + 13)], fill=t.shadow)
        ink = t.title if selected else t.title_dim
        if shade:
            # The shade view: a small display for the visualizer and the time.
            sunken(img, t, (27 + 76, y + 3, 27 + 120, y + 10))
            sunken(img, t, (27 + 124, y + 3, 27 + 162, y + 10))
            text(img, 27 + 20, y + 5, "ARCANIST", ink)
        else:
            label = "ARCANIST"
            x = 27 + (275 - text_width(label, 2)) // 2
            text(img, x, y + 5, label, ink, spacing=2)
            # Thin rules either side, like the panel's dividers.
            rule = t.accent if selected else t.title_dim
            d.line([(27 + 20, y + 7), (x - 6, y + 7)], fill=mix(rule, t.face_top, 0.45))
            d.line([(x + text_width(label, 2) + 5, y + 7), (27 + 236, y + 7)], fill=mix(rule, t.face_top, 0.45))
        # The option button's spot, left.
        d.ellipse((27 + 6, y + 3, 27 + 14, y + 11), outline=ink)

    bar(0, True, False)
    bar(15, False, False)
    bar(57, True, False)
    bar(72, False, False)
    bar(29, True, True)
    bar(42, False, True)

    def small(x: int, y: int, pressed: bool, icon: str) -> None:
        button(img, t, (x, y, x + 8, y + 8), pressed)
        ink = t.ink_bright if pressed else t.title
        if icon == "option":
            d.ellipse((x + 2, y + 2, x + 6, y + 6), outline=ink)
        elif icon == "minimize":
            d.line([(x + 2, y + 6), (x + 6, y + 6)], fill=ink)
        elif icon == "shade":
            d.rectangle((x + 2, y + 2, x + 6, y + 3), outline=ink)
        elif icon == "unshade":
            d.rectangle((x + 2, y + 2, x + 6, y + 6), outline=ink)
        elif icon == "close":
            d.line([(x + 2, y + 2), (x + 6, y + 6)], fill=ink)
            d.line([(x + 6, y + 2), (x + 2, y + 6)], fill=ink)

    small(0, 0, False, "option")
    small(0, 9, True, "option")
    small(9, 0, False, "minimize")
    small(9, 9, True, "minimize")
    small(0, 18, False, "shade")
    small(9, 18, True, "shade")
    small(18, 0, False, "close")
    small(18, 9, True, "close")
    small(0, 27, False, "unshade")
    small(9, 27, True, "unshade")

    # The clutter bar: O A I D V, normal, disabled and each one pressed.
    for x, ink in ((304, t.label), (312, mix(t.label, t.face_bottom, 0.6))):
        d.rectangle((x, 0, x + 7, 42), fill=t.lcd)
        for letter, top in zip("OAIDV", (3, 11, 18, 25, 33)):
            glyph(img, x + 2, top + 1, letter, ink)
    for (x, y, h), letter in zip(((304, 47, 8), (312, 55, 7), (320, 62, 7), (328, 69, 8), (336, 77, 7)), "OAIDV"):
        d.rectangle((x, y, x + 7, y + h - 1), fill=t.button_pressed)
        glyph(img, x + 2, y + 1, letter, t.ink_bright)

    # The shade view's position bar and its thumbs.
    d.rectangle((0, 36, 16, 42), fill=t.lcd)
    d.line([(1, 39), (15, 39)], fill=t.lcd_edge)
    for x, color in ((17, t.accent), (20, t.ink_bright), (23, t.accent)):
        d.rectangle((x, 36, x + 2, 42), fill=color)
    return img


def transport_icon(img: Image.Image, cx: int, cy: int, kind: str, color: Color) -> None:
    d = ImageDraw.Draw(img)
    if kind == "previous":
        d.rectangle((cx - 4, cy - 3, cx - 4, cy + 3), fill=color)
        polygon(img, [(cx + 3, cy - 3), (cx - 3, cy), (cx + 3, cy + 3)], color)
    elif kind == "play":
        polygon(img, [(cx - 2, cy - 4), (cx + 3, cy), (cx - 2, cy + 4)], color)
    elif kind == "pause":
        d.rectangle((cx - 3, cy - 3, cx - 2, cy + 3), fill=color)
        d.rectangle((cx + 1, cy - 3, cx + 2, cy + 3), fill=color)
    elif kind == "stop":
        d.rectangle((cx - 3, cy - 3, cx + 3, cy + 3), fill=color)
    elif kind == "next":
        polygon(img, [(cx - 3, cy - 3), (cx + 3, cy), (cx - 3, cy + 3)], color)
        d.rectangle((cx + 4, cy - 3, cx + 4, cy + 3), fill=color)
    elif kind == "eject":
        polygon(img, [(cx - 4, cy + 1), (cx, cy - 3), (cx + 4, cy + 1)], color)
        d.rectangle((cx - 4, cy + 3, cx + 4, cy + 3), fill=color)


def cbuttons_bmp(t: Theme) -> Image.Image:
    img = sheet(136, 36, t)
    for i, kind in enumerate(("previous", "play", "pause", "stop", "next")):
        x = i * 23
        w = 22 if kind == "next" else 23
        for y, pressed in ((0, False), (18, True)):
            button(img, t, (x, y, x + w - 1, y + 17), pressed)
            transport_icon(img, x + w // 2, y + 9, kind, t.ink_bright if pressed else (t.accent if kind == "play" else t.title))
    # Webamp's eject ("open file"): in Arcanist it opens the library.
    for y, pressed in ((0, False), (16, True)):
        button(img, t, (114, y, 135, y + 15), pressed)
        text(img, 114 + (22 - text_width("LIB")) // 2, y + 6, "LIB", t.ink_bright if pressed else t.gold)
    return img


def posbar_bmp(t: Theme) -> Image.Image:
    img = sheet(307, 10, t)
    face(img, t, (0, 0, 247, 9))
    d = ImageDraw.Draw(img)
    sunken(img, t, (0, 2, 247, 7))
    for x in range(8, 247, 30):
        d.point((x, 4), fill=t.lcd_edge)
    for x, selected in ((248, False), (278, True)):
        if t.flat:
            d.rectangle((x, 1, x + 28, 8), fill=(0, 0, 0), outline=t.ink_bright if selected else t.accent)
        else:
            button(img, t, (x, 0, x + 28, 9), selected)
        d.line([(x + 6, 5), (x + 22, 5)], fill=t.ink_bright if selected else t.accent)
        d.ellipse((x + 12, 2, x + 16, 7), outline=t.gold)
    return img


def slider_frames(img: Image.Image, t: Theme, x0: int, width: int, centered: bool) -> None:
    d = ImageDraw.Draw(img)
    for i in range(28):
        y = i * 15
        face(img, t, (x0, y, x0 + width - 1, y + 14))
        sunken(img, t, (x0 + 1, y + 4, x0 + width - 2, y + 8))
        inner = width - 6
        if centered:
            mid = x0 + width // 2
            half = round(i / 27 * (inner // 2))
            if half:
                d.rectangle((mid - half, y + 6, mid + half, y + 6), fill=mix(t.accent, t.gold, i / 27))
        else:
            fill = round(i / 27 * inner)
            for k in range(fill):
                d.point((x0 + 3 + k, y + 6), fill=mix(t.accent, t.ink_bright, k / max(inner, 1)))


def thumb(img: Image.Image, t: Theme, x: int, y: int, w: int, h: int, selected: bool) -> None:
    d = ImageDraw.Draw(img)
    if t.flat:
        d.rectangle((x, y, x + w - 1, y + h - 1), fill=(0, 0, 0), outline=t.ink_bright if selected else t.accent)
    else:
        button(img, t, (x, y, x + w - 1, y + h - 1), selected)
    d.line([(x + w // 2, y + 3), (x + w // 2, y + h - 4)], fill=t.gold if selected else t.accent)


def volume_bmp(t: Theme) -> Image.Image:
    img = sheet(68, 433, t)
    slider_frames(img, t, 0, 68, centered=False)
    thumb(img, t, 0, 422, 14, 11, True)
    thumb(img, t, 15, 422, 14, 11, False)
    return img


def balance_bmp(t: Theme) -> Image.Image:
    img = sheet(68, 433, t)
    slider_frames(img, t, 9, 38, centered=True)
    thumb(img, t, 0, 422, 14, 11, True)
    thumb(img, t, 15, 422, 14, 11, False)
    return img


def toggle(img: Image.Image, t: Theme, box: tuple[int, int, int, int], label: str, on: bool, pressed: bool) -> None:
    x0, y0, x1, y1 = box
    button(img, t, box, pressed)
    d = ImageDraw.Draw(img)
    led = t.gold if on else (t.lcd_edge if not t.flat else t.light)
    d.rectangle((x0 + 3, y0 + (y1 - y0) // 2 - 1, x0 + 4, y0 + (y1 - y0) // 2), fill=led)
    w = text_width(label)
    text(img, x0 + 7 + (x1 - x0 - 7 - w) // 2, y0 + (y1 - y0 - 4) // 2, label, t.ink_bright if on else t.title)


def shufrep_bmp(t: Theme) -> Image.Image:
    img = sheet(92, 85, t)
    for i, (on, pressed) in enumerate(((False, False), (False, True), (True, False), (True, True))):
        y = i * 15
        toggle(img, t, (0, y, 27, y + 14), "REP", on, pressed)
        toggle(img, t, (28, y, 74, y + 14), "SHUFFLE", on, pressed)
    for x, label in ((0, "EQ"), (23, "PL")):
        for y, on in ((61, False), (73, True)):
            toggle(img, t, (x, y, x + 22, y + 11), label, on, False)
            toggle(img, t, (x + 46, y, x + 46 + 22, y + 11), label, on, True)
    return img


def monoster_bmp(t: Theme) -> Image.Image:
    img = sheet(56, 24, t)
    face(img, t, (0, 0, 55, 23))
    for y, on in ((0, True), (12, False)):
        for x, w, label in ((0, 29, "STEREO"), (29, 27, "MONO")):
            ink = t.ink_bright if on else mix(t.label, t.face_bottom, 0.5)
            text(img, x + (w - text_width(label)) // 2, y + 4, label, ink)
    return img


def playpaus_bmp(t: Theme) -> Image.Image:
    img = Image.new("RGB", (42, 9), t.lcd)
    d = ImageDraw.Draw(img)
    polygon(img, [(2, 1), (7, 4), (2, 7)], t.ink_bright)
    d.rectangle((11, 1, 12, 7), fill=t.ink)
    d.rectangle((15, 1, 16, 7), fill=t.ink)
    d.rectangle((20, 2, 24, 6), fill=t.ink)
    d.rectangle((37, 3, 37, 5), fill=t.lcd_edge)
    d.rectangle((40, 3, 40, 5), fill=t.gold)
    return img


def numbers_bmp(t: Theme) -> Image.Image:
    img = Image.new("RGB", (99, 13), t.lcd)
    for n in range(10):
        digit(img, n * 9, 0, n, t)
    digit(img, 90, 0, None, t)
    return img


def text_bmp(t: Theme) -> Image.Image:
    img = Image.new("RGB", (155, 18), t.lcd)
    for char, row, column in TEXT_LAYOUT:
        glyph(img, column * 5 + 1, row * 6, char, t.ink)
    return img


def eqmain_bmp(t: Theme) -> Image.Image:
    img = sheet(275, 315, t)
    d = ImageDraw.Draw(img)
    # The window.
    face(img, t, (0, 0, 274, 115))
    astrolabe(img, 30, 118, 70, t.engraving, (1, 14, 273, 114))
    raised(img, t, (1, 1, 273, 114))
    frame(img, t, (0, 0, 274, 115))
    sunken(img, t, (84, 15, 200, 37))
    for x in [21] + [78 + 18 * i for i in range(10)]:
        sunken(img, t, (x - 1, 37, x + 14, 101), fill=t.face_bottom if not t.flat else (0, 0, 0))
    text(img, 45, 37, "+12", t.label)
    text(img, 49, 65, "0", t.label)
    text(img, 45, 96, "-12", t.label)
    text(img, 17, 104, "PREAMP", t.label)
    for i, label in enumerate(("60", "170", "310", "600", "1K", "3K", "6K", "12K", "14K", "16K")):
        cx = 78 + 18 * i + 7
        text(img, cx - text_width(label) // 2, 104, label, t.label)

    # Title bars.
    for y, selected in ((134, True), (149, False)):
        box = (0, y, 274, y + 13)
        if t.flat:
            d.rectangle(box, fill=(0, 0, 0))
            d.line([(0, y + 13), (274, y + 13)], fill=t.accent if selected else t.light)
        else:
            gradient(img, box, mix(t.face_top, t.light, 0.35 if selected else 0.0), t.face_top if selected else t.face_bottom)
        label = "EQUALIZER"
        text(img, (275 - text_width(label, 2)) // 2, y + 5, label, t.title if selected else t.title_dim, spacing=2)
        d.rectangle((254, y + 3, 262, y + 11), outline=t.title_dim)

    # Close button.
    for y, pressed in ((116, False), (125, True)):
        button(img, t, (0, y, 8, y + 8), pressed)
        ink = t.ink_bright if pressed else t.title
        d.line([(2, y + 2), (6, y + 6)], fill=ink)
        d.line([(6, y + 2), (2, y + 6)], fill=ink)

    # ON and AUTO, each normal, pressed, on and on-pressed.
    for x, w, label, on, pressed in (
        (10, 26, "ON", False, False), (128, 26, "ON", False, True), (69, 26, "ON", True, False), (187, 26, "ON", True, True),
        (36, 32, "AUTO", False, False), (154, 32, "AUTO", False, True), (95, 32, "AUTO", True, False), (213, 32, "AUTO", True, True),
    ):
        toggle(img, t, (x, 119, x + w - 1, 130), label, on, pressed)

    # Band frames: 28 levels, 14 per row, each 15×65.
    for k in range(28):
        x = 13 + (k % 14) * 15
        y = 164 + (k // 14) * 65
        d.rectangle((x, y, x + 13, y + 62), fill=t.face_bottom if not t.flat else (0, 0, 0))
        d.rectangle((x + 6, y + 2, x + 7, y + 60), fill=t.lcd)
        if t.flat:
            d.line([(x + 6, y + 2), (x + 6, y + 60)], fill=t.light)
        level = round(k / 27 * 56)
        for j in range(level):
            yy = y + 60 - j
            d.line([(x + 6, yy), (x + 7, yy)], fill=mix(t.gold, t.accent, j / 56))
    for y, selected in ((164, False), (176, True)):
        if t.flat:
            d.rectangle((0, y, 10, y + 10), fill=(0, 0, 0), outline=t.ink_bright if selected else t.accent)
        else:
            button(img, t, (0, y, 10, y + 10), selected)
        d.line([(2, y + 5), (8, y + 5)], fill=t.gold if selected else t.accent)

    # Presets.
    for y, pressed in ((164, False), (176, True)):
        button(img, t, (224, y, 267, y + 11), pressed)
        label = "PRESETS"
        text(img, 224 + (44 - text_width(label)) // 2, y + 4, label, t.ink_bright if pressed else t.title)

    # The graph, its line colors and the preamp line.
    d.rectangle((0, 294, 112, 312), fill=t.lcd)
    for y in (294 + 9,):
        d.line([(0, y), (112, y)], fill=t.lcd_edge)
    for i in range(19):
        img.putpixel((115, 294 + i), mix(t.ink_bright, t.gold, i / 18))
    d.line([(0, 314), (112, 314)], fill=t.gold)
    return img


def eq_ex_bmp(t: Theme) -> Image.Image:
    img = sheet(275, 56, t)
    d = ImageDraw.Draw(img)
    for y, selected in ((0, True), (15, False)):
        box = (0, y, 274, y + 13)
        if t.flat:
            d.rectangle(box, fill=(0, 0, 0))
            d.line([(0, y + 13), (274, y + 13)], fill=t.accent if selected else t.light)
        else:
            gradient(img, box, mix(t.face_top, t.light, 0.35 if selected else 0.0), t.face_bottom)
        text(img, 8, y + 5, "EQ", t.title if selected else t.title_dim)
        sunken(img, t, (60, y + 3, 158, y + 10))
        sunken(img, t, (163, y + 3, 208, y + 10))
    for x, color in ((1, t.accent), (4, t.ink_bright), (7, t.accent), (11, t.accent), (14, t.ink_bright), (17, t.accent)):
        d.rectangle((x, 30, x + 2, 36), fill=color)
    for x, y, icon in ((1, 38, "max"), (1, 47, "min"), (11, 38, "close"), (11, 47, "close")):
        button(img, t, (x, y, x + 8, y + 8), y == 47 or icon == "max")
        ink = t.title
        if icon == "close":
            d.line([(x + 2, y + 2), (x + 6, y + 6)], fill=ink)
            d.line([(x + 6, y + 2), (x + 2, y + 6)], fill=ink)
        else:
            d.rectangle((x + 2, y + 2, x + 6, y + (6 if icon == "max" else 3)), outline=ink)
    return img


def pledit_bmp(t: Theme) -> Image.Image:
    img = sheet(280, 186, t)
    d = ImageDraw.Draw(img)

    def top(x: int, y: int, w: int, selected: bool, label: str | None = None, buttons: bool = False) -> None:
        box = (x, y, x + w - 1, y + 19)
        if t.flat:
            d.rectangle(box, fill=(0, 0, 0))
            d.line([(x, y + 19), (x + w - 1, y + 19)], fill=t.accent if selected else t.light)
        else:
            gradient(img, box, mix(t.face_top, t.light, 0.35 if selected else 0.0), t.face_top if selected else t.face_bottom)
            d.line([(x, y + 19), (x + w - 1, y + 19)], fill=t.shadow)
        ink = t.title if selected else t.title_dim
        if label:
            text(img, x + (w - text_width(label, 2)) // 2, y + 7, label, ink, spacing=2)
        else:
            d.line([(x, y + 9), (x + w - 1, y + 9)], fill=mix(t.accent if selected else t.title_dim, t.face_top, 0.5))
        if buttons:
            for bx in (x + w - 21, x + w - 11):
                d.rectangle((bx, y + 3, bx + 8, y + 11), outline=ink)

    for y, selected in ((0, True), (21, False)):
        top(0, y, 25, selected)
        top(26, y, 100, selected, "PLAYLIST")
        top(127, y, 25, selected)
        top(153, y, 25, selected, buttons=True)

    # Sides: the left edge and the right one with the scroll groove.
    face(img, t, (0, 42, 11, 70))
    raised(img, t, (0, 42, 11, 70))
    face(img, t, (31, 42, 50, 70))
    sunken(img, t, (36, 42, 44, 70))
    for x, selected in ((52, False), (61, True)):
        if t.flat:
            d.rectangle((x, 53, x + 7, 70), fill=(0, 0, 0), outline=t.ink_bright if selected else t.accent)
        else:
            button(img, t, (x, 53, x + 7, 70), selected)
    # The close, collapse and expand buttons, pressed.
    for x, icon in ((52, "close"), (62, "collapse"), (150, "expand")):
        button(img, t, (x, 42, x + 8, 50), True)
        if icon == "close":
            d.line([(x + 2, 44), (x + 6, 48)], fill=t.ink_bright)
            d.line([(x + 6, 44), (x + 2, 48)], fill=t.ink_bright)
        else:
            d.rectangle((x + 2, 44, x + 6, 44 + (1 if icon == "collapse" else 4)), outline=t.ink_bright)

    # The shade view.
    for x, y, w in ((72, 57, 25), (72, 42, 25), (99, 57, 50), (99, 42, 50)):
        box = (x, y, x + w - 1, y + 13)
        if t.flat:
            d.rectangle(box, fill=(0, 0, 0))
            d.line([(x, y + 13), (x + w - 1, y + 13)], fill=t.light)
        else:
            gradient(img, box, t.face_top, t.face_bottom)

    # Bottom: the tile, the visualizer box and the two corners.
    face(img, t, (179, 0, 203, 37))
    raised(img, t, (179, 0, 203, 37)) if not t.flat else d.line([(179, 0), (203, 0)], fill=t.light)
    face(img, t, (205, 0, 279, 37))
    sunken(img, t, (207, 10, 277, 33))

    face(img, t, (0, 72, 124, 109))
    d.line([(0, 72), (124, 72)], fill=t.light)
    for x, label in ((14, "ADD"), (43, "REM"), (72, "SEL"), (101, "MISC")):
        button(img, t, (x, 80, x + 21, 97), False)
        text(img, x + (22 - text_width(label)) // 2, 87, label, t.title)
    bolt(img, 3, 82, t.gold)

    face(img, t, (126, 72, 275, 109))
    d.line([(126, 72), (275, 72)], fill=t.light)
    sunken(img, t, (126 + 5, 72 + 8, 126 + 66, 72 + 19))
    # Arcanist's playlists: new, save and load.
    button(img, t, (126 + 106, 80, 126 + 127, 97), False)
    text(img, 126 + 106 + (22 - text_width("LISTS")) // 2, 87, "LISTS", t.title)
    for i, kind in enumerate(("previous", "play", "pause", "stop", "next")):
        x = 126 + 3 + i * 10
        mini = Image.new("RGB", (20, 20), t.face_bottom)
        transport_icon(mini, 10, 10, kind, t.title)
        small = mini.resize((10, 10), Image.NEAREST)
        img.paste(small, (x, 72 + 22))
    # The mini eject opens the library too: books on a shelf, like the Library icon.
    books = 126 + 3 + 5 * 10
    d.line([(books + 2, 72 + 24), (books + 2, 72 + 30)], fill=t.gold)
    d.line([(books + 4, 72 + 24), (books + 4, 72 + 30)], fill=t.gold)
    d.line([(books + 6, 72 + 25), (books + 8, 72 + 30)], fill=t.gold)
    sunken(img, t, (126 + 64, 72 + 21, 126 + 92, 72 + 30))

    # The menus: each button, normal and pressed, and the bars beside them.
    menus = {
        # ADD URL opens Arcanist's library; DIR and FILE add files from this computer.
        (0, 111): "LIB", (0, 130): "DIR", (0, 149): "FILE",
        (54, 111): "ALL", (54, 130): "CROP", (54, 149): "SEL", (54, 168): "MISC",
        (104, 111): "INV", (104, 130): "NONE", (104, 149): "ALL",
        (154, 111): "SORT", (154, 130): "INFO", (154, 149): "OPTS",
        (204, 111): "NEW", (204, 130): "SAVE", (204, 149): "LOAD",
    }
    for (x, y), label in menus.items():
        for dx, pressed in ((0, False), (23, True)):
            button(img, t, (x + dx, y, x + dx + 21, y + 17), pressed)
            text(img, x + dx + (22 - text_width(label)) // 2, y + 7, label, t.ink_bright if pressed else t.title)
    for x, h in ((48, 54), (100, 72), (150, 54), (200, 54), (250, 54)):
        d.rectangle((x, 111, x + 2, 111 + h - 1), fill=t.accent)
    return img


def gen_bmp(t: Theme) -> Image.Image:
    img = sheet(194, 109, t)
    d = ImageDraw.Draw(img)
    title_fill = {True: mix(t.face_top, t.light, 0.25), False: t.face_top}
    if t.flat:
        title_fill = {True: (0, 0, 0), False: (0, 0, 0)}

    def top(x: int, y: int, selected: bool, kind: str) -> None:
        box = (x, y, x + 24, y + 19)
        d.rectangle(box, fill=title_fill[selected])
        line = t.accent if selected else t.title_dim
        d.line([(x, y + 19), (x + 24, y + 19)], fill=line if t.flat else t.shadow)
        if kind in ("left", "right"):
            d.line([(x, y + 9), (x + 24, y + 9)], fill=mix(line, title_fill[selected], 0.5))
        if kind == "right":
            d.rectangle((x + 14, y + 3, x + 22, y + 11), outline=line)
        if kind == "fill":
            d.line([(x, y + 9), (x + 24, y + 9)], fill=mix(line, title_fill[selected], 0.5))

    for y, selected in ((0, True), (21, False)):
        for x, kind in ((0, "left"), (26, "left_end"), (52, "center"), (78, "right_end"), (104, "fill"), (130, "right")):
            top(x, y, selected, kind)

    for box in ((0, 42, 124, 55), (0, 57, 124, 70), (127, 72, 151, 85)):
        face(img, t, box)
        d.line([(box[0], box[3]), (box[2], box[3])], fill=t.edge)
    for box in ((127, 42, 137, 70), (139, 42, 146, 70), (158, 42, 168, 65), (170, 42, 177, 65)):
        face(img, t, box)
    button(img, t, (148, 42, 156, 50), True)
    d.line([(150, 44), (154, 48)], fill=t.ink_bright)
    d.line([(154, 44), (150, 48)], fill=t.ink_bright)

    # The title letters: cells on the title's color, separated by the color at x = 0.
    separator = (255, 0, 255)
    for y, selected in ((88, True), (96, False)):
        d.rectangle((0, y, 193, y + 6), fill=separator)
        x = 1
        for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            d.rectangle((x, y, x + 3, y + 6), fill=title_fill[selected])
            glyph(img, x, y + 1, letter, t.title if selected else t.title_dim)
            x += 5
    return img


def viscolor(t: Theme) -> str:
    colors = [t.lcd, t.lcd_edge]
    for i in range(16):
        colors.append(mix(t.ink_bright, t.gold if not t.flat else t.accent, i / 15) if i < 8 else mix(t.accent, t.gold, (i - 8) / 7))
    for i in range(5):
        colors.append(mix(t.ink_bright, t.accent, i / 4))
    colors.append(t.gold)
    return "\n".join(f"{r},{g},{b}" for r, g, b in colors) + "\n"


def pledit_txt(t: Theme) -> str:
    def h(c: Color) -> str:
        return "#%02X%02X%02X" % c

    return (
        "[Text]\n"
        f"Normal={h(t.ink)}\nCurrent={h(t.ink_bright)}\nNormalBG={h(t.lcd)}\nSelectedBG={h(mix(t.lcd, t.accent, 0.35))}\nFont=Arial\n"
    )


def screenshot(sheets: dict[str, Image.Image], t: Theme) -> Image.Image:
    """The main window as Webamp draws it, for the skin's card."""
    shot = sheets["MAIN"].copy()

    def put(name: str, box: tuple[int, int, int, int], at: tuple[int, int]) -> None:
        shot.paste(sheets[name].crop((box[0], box[1], box[0] + box[2], box[1] + box[3])), at)

    put("TITLEBAR", (27, 0, 275, 14), (0, 0))
    put("TITLEBAR", (0, 0, 9, 9), (6, 3))
    put("TITLEBAR", (9, 0, 9, 9), (244, 3))
    put("TITLEBAR", (0, 18, 9, 9), (254, 3))
    put("TITLEBAR", (18, 0, 9, 9), (264, 3))
    put("TITLEBAR", (304, 0, 8, 43), (10, 22))
    put("PLAYPAUS", (0, 0, 9, 9), (26, 28))
    for x, n in ((48, 0), (60, 3), (78, 1), (90, 4)):
        put("NUMBERS", (n * 9, 0, 9, 13), (x, 26))
    for i, char in enumerate("ARCANIST - MUSIC FOR EVERYONE"):
        match = next(((r, c) for ch, r, c in TEXT_LAYOUT if ch == char), (0, 30))
        put("TEXT", (match[1] * 5, match[0] * 6, 5, 6), (111 + i * 5, 24))
    for i, char in enumerate("320"):
        put("TEXT", (int(char) * 5, 6, 5, 6), (111 + i * 5, 43))
    for i, char in enumerate("44"):
        put("TEXT", (int(char) * 5, 6, 5, 6), (156 + i * 5, 43))
    put("MONOSTER", (29, 12, 27, 12), (212, 41))
    put("MONOSTER", (0, 0, 29, 12), (239, 41))
    put("VOLUME", (0, 20 * 15, 68, 13), (107, 57))
    put("VOLUME", (15, 422, 14, 11), (107 + 46, 58))
    put("BALANCE", (9, 0, 38, 13), (177, 57))
    put("BALANCE", (15, 422, 14, 11), (177 + 12, 58))
    put("SHUFREP", (0, 73, 23, 12), (219, 58))
    put("SHUFREP", (23, 73, 23, 12), (242, 58))
    put("POSBAR", (0, 0, 248, 10), (16, 72))
    put("POSBAR", (248, 0, 29, 10), (16 + 70, 72))
    for i in range(5):
        put("CBUTTONS", (i * 23, 0, 23 if i < 4 else 22, 18), (16 + i * 23, 88))
    put("CBUTTONS", (114, 0, 22, 16), (136, 89))
    put("SHUFREP", (28, 0, 47, 15), (164, 89))
    put("SHUFREP", (0, 30, 28, 15), (211, 89))
    # A few visualizer bars.
    d = ImageDraw.Draw(shot)
    colors = [tuple(int(v) for v in line.split(",")) for line in viscolor(t).splitlines()]
    for i, h in enumerate((9, 13, 15, 12, 10, 14, 8, 11, 6, 9, 12, 7, 5, 8, 4, 6, 3, 5, 2)):
        x = 24 + i * 4
        for k in range(h):
            d.line([(x, 58 - k), (x + 2, 58 - k)], fill=colors[2 + (16 - h + k) % 16])
    return shot


def build(t: Theme) -> None:
    sheets = {
        "MAIN": main_bmp(t),
        "TITLEBAR": titlebar_bmp(t),
        "CBUTTONS": cbuttons_bmp(t),
        "POSBAR": posbar_bmp(t),
        "VOLUME": volume_bmp(t),
        "BALANCE": balance_bmp(t),
        "SHUFREP": shufrep_bmp(t),
        "MONOSTER": monoster_bmp(t),
        "PLAYPAUS": playpaus_bmp(t),
        "NUMBERS": numbers_bmp(t),
        "TEXT": text_bmp(t),
        "EQMAIN": eqmain_bmp(t),
        "EQ_EX": eq_ex_bmp(t),
        "PLEDIT": pledit_bmp(t),
        "GEN": gen_bmp(t),
    }
    name = f"Arcanist_{t.name}"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as wsz:
        def add(file: str, data: bytes) -> None:
            info = zipfile.ZipInfo(file, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            wsz.writestr(info, data)

        for sheet_name, image in sorted(sheets.items()):
            out = io.BytesIO()
            image.save(out, format="BMP")
            add(f"{sheet_name.lower()}.bmp", out.getvalue())
        add("viscolor.txt", viscolor(t).encode())
        add("pledit.txt", pledit_txt(t).encode())
        add(
            "readme.txt",
            f"Arcanist {t.name} - a Winamp skin for Arcanist's Webamp, drawn from scratch.\r\n"
            "(c) LinkFast S.A. and Arcanist contributors. AGPL-3.0-or-later, like the player.\r\n".encode(),
        )
    with open(os.path.join(OUT, f"{name}.wsz"), "wb") as f:
        f.write(buffer.getvalue())
    screenshot(sheets, t).save(os.path.join(OUT, f"{name}.png"), optimize=True)
    if os.environ.get("ARCANIST_SKIN_PREVIEW"):
        preview = os.environ["ARCANIST_SKIN_PREVIEW"]
        os.makedirs(preview, exist_ok=True)
        for sheet_name, image in sheets.items():
            image.resize((image.width * 3, image.height * 3), Image.NEAREST).save(os.path.join(preview, f"{name}-{sheet_name}.png"))


def write_metadata() -> None:
    """skins/skins.json: these skins' names, first in the list, and OLED's effects; other entries are kept."""
    import json

    path = os.path.join(OUT, "skins.json")
    current = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            current = json.load(f)
    ours = {
        "Arcanist_Light.wsz": {"name": "Arcanist Light"},
        "Arcanist_Dark.wsz": {"name": "Arcanist Dark"},
        "Arcanist_OLED.wsz": {"name": "Arcanist OLED", "effects": ["oled"]},
    }
    merged = {**ours, **{k: v for k, v in current.items() if k not in ours}}
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for theme in (LIGHT, DARK, OLED):
        build(theme)
        print(f"skins/Arcanist_{theme.name}.wsz")
    write_metadata()
