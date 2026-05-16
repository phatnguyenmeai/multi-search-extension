#!/usr/bin/env python3
"""Generate store-listing artwork for the Multi Search extension.

Produces (in this folder):
  small-tile.png      440 x 280   — small promotional tile
  large-tile.png     1400 x 560   — large promotional tile
  screenshot-1.png   1280 x 800   — "search many terms at once"
  screenshot-2.png   1280 x 800   — "a colour for every term"
  screenshot-3.png   1280 x 800   — "customise your palette"

Requires Pillow:  pip install Pillow
Run:  python3 store-assets/gen_store_images.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = "/usr/share/fonts/truetype/liberation"
SCALE = 3  # supersampling factor for crisp anti-aliasing

BRAND = "#1a73e8"
BRAND_DARK = "#1557b0"
DARK = "#1f2329"
GRAY = "#5f6368"
BORDER = "#d4d7dd"
WHITE = "#ffffff"
PAGE_BG = "#eef3fb"
ORANGE = "#ff9632"
PALETTE = ["#ffd54f", "#80d8ff", "#ff8a80", "#b9f6ca",
           "#ea80fc", "#ffab40", "#84ffff", "#f48fb1"]


class Art:
    """A supersampled drawing surface that works in logical pixels."""

    def __init__(self, w, h, bg=WHITE):
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w * SCALE, h * SCALE), self._rgba(bg))
        self.d = ImageDraw.Draw(self.img)

    @staticmethod
    def _rgba(c):
        if isinstance(c, tuple):
            return c if len(c) == 4 else c + (255,)
        c = c.lstrip("#")
        return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)

    def font(self, size, bold=False):
        name = "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf"
        return ImageFont.truetype(os.path.join(FONT_DIR, name), int(size * SCALE))

    def _refresh(self):
        self.d = ImageDraw.Draw(self.img)

    def vgradient(self, top, bottom):
        t, b = self._rgba(top), self._rgba(bottom)
        h = self.img.height
        for y in range(h):
            f = y / (h - 1)
            row = tuple(round(t[i] + (b[i] - t[i]) * f) for i in range(4))
            self.d.line([(0, y), (self.img.width, y)], fill=row)

    def rrect(self, box, r, fill=None, outline=None, width=1, corners=None):
        b = [c * SCALE for c in box]
        kw = {}
        if corners is not None:
            kw["corners"] = corners
        self.d.rounded_rectangle(
            b, radius=r * SCALE,
            fill=self._rgba(fill) if fill else None,
            outline=self._rgba(outline) if outline else None,
            width=max(1, int(width * SCALE)), **kw)

    def ellipse(self, box, fill=None, outline=None, width=1):
        self.d.ellipse([c * SCALE for c in box],
                       fill=self._rgba(fill) if fill else None,
                       outline=self._rgba(outline) if outline else None,
                       width=max(1, int(width * SCALE)))

    def line(self, pts, fill, width=1, joint=None):
        self.d.line([c * SCALE for c in pts], fill=self._rgba(fill),
                    width=max(1, int(width * SCALE)), joint=joint)

    def polygon(self, pts, fill):
        self.d.polygon([(px * SCALE, py * SCALE) for px, py in pts],
                       fill=self._rgba(fill))

    def text(self, xy, s, size, color, bold=False, anchor="la"):
        self.d.text((xy[0] * SCALE, xy[1] * SCALE), s, font=self.font(size, bold),
                    fill=self._rgba(color), anchor=anchor)

    def textlen(self, s, size, bold=False):
        return self.d.textlength(s, font=self.font(size, bold)) / SCALE

    def shadow(self, box, r, blur=18, alpha=70, offset=(0, 14)):
        layer = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        b = [(box[0] + offset[0]) * SCALE, (box[1] + offset[1]) * SCALE,
             (box[2] + offset[0]) * SCALE, (box[3] + offset[1]) * SCALE]
        ld.rounded_rectangle(b, radius=r * SCALE, fill=(0, 0, 0, alpha))
        layer = layer.filter(ImageFilter.GaussianBlur(blur * SCALE / 3))
        self.img = Image.alpha_composite(self.img, layer)
        self._refresh()

    def save(self, name):
        out = self.img.convert("RGB").resize((self.w, self.h), Image.LANCZOS)
        path = os.path.join(HERE, name)
        out.save(path)
        print("wrote", os.path.relpath(path))


def glass(art, cx, cy, size):
    """Draw the Multi Search magnifying-glass logo centred at (cx, cy)."""
    half = size / 2
    art.rrect([cx - half, cy - half, cx + half, cy + half], size * 0.2, fill=BRAND)
    lx, ly = cx - size * 0.06, cy - size * 0.06
    outer = size * 0.27
    thick = size * 0.09
    hx, hy = lx + outer * 0.707, ly + outer * 0.707
    ex, ey = cx + size * 0.33, cy + size * 0.33
    art.line([hx, hy, ex, ey], WHITE, width=thick * 1.6)
    art.ellipse([ex - thick * 0.8, ey - thick * 0.8, ex + thick * 0.8, ey + thick * 0.8],
                fill=WHITE)
    art.ellipse([lx - outer, ly - outer, lx + outer, ly + outer],
                outline=WHITE, width=thick)


def tri(art, cx, cy, s, color, down=True):
    if down:
        art.polygon([(cx - s, cy - s * 0.6), (cx + s, cy - s * 0.6), (cx, cy + s * 0.7)], color)
    else:
        art.polygon([(cx - s, cy + s * 0.6), (cx + s, cy + s * 0.6), (cx, cy - s * 0.7)], color)


def cross(art, cx, cy, s, color, width=2):
    art.line([cx - s, cy - s, cx + s, cy + s], color, width=width)
    art.line([cx - s, cy + s, cx + s, cy - s], color, width=width)


_HEADER_H, _PAD, _ROW_H, _GAP, _FOOTER_H = 38, 12, 30, 8, 46


def panel_height(n):
    return _HEADER_H + _PAD * 2 + n * _ROW_H + (n - 1) * _GAP + _FOOTER_H


def panel(art, x, y, w, terms, counter):
    """Draw the Multi Search panel. `terms` = list of (text, color, count)."""
    header_h, pad, row_h, gap, footer_h = _HEADER_H, _PAD, _ROW_H, _GAP, _FOOTER_H
    rows_h = pad * 2 + len(terms) * row_h + (len(terms) - 1) * gap
    total_h = header_h + rows_h + footer_h

    art.rrect([x, y, x + w, y + total_h], 12, fill=WHITE, outline=BORDER, width=1)

    # Header.
    art.rrect([x, y, x + w, y + header_h], 12, fill=BRAND,
              corners=(True, True, False, False))
    art.text((x + 14, y + header_h / 2), "Multi Search", 14.5, WHITE,
             bold=True, anchor="lm")
    rx = x + w - 16
    cross(art, rx, y + header_h / 2, 5, WHITE, width=2)
    rx -= 26
    tri(art, rx, y + header_h / 2, 6, WHITE, down=True)
    rx -= 22
    tri(art, rx, y + header_h / 2, 6, WHITE, down=False)
    rx -= 18
    art.text((rx, y + header_h / 2), counter, 12, WHITE, anchor="rm")

    # Rows.
    ry = y + header_h + pad
    for text, color, count in terms:
        cy = ry + row_h / 2
        # enable checkbox
        art.rrect([x + pad, cy - 7, x + pad + 14, cy + 7], 3,
                  fill=BRAND, outline=BRAND, width=1)
        art.line([x + pad + 3, cy, x + pad + 6, cy + 4], WHITE, width=2)
        art.line([x + pad + 6, cy + 4, x + pad + 11, cy - 4], WHITE, width=2)
        # text input
        ix0 = x + pad + 22
        ix1 = x + w - pad - 84
        art.rrect([ix0, cy - 12, ix1, cy + 12], 6, fill=WHITE, outline=BORDER, width=1)
        art.text((ix0 + 9, cy), text, 12.5, DARK, anchor="lm")
        # colour swatch
        sw = x + w - pad - 74
        art.rrect([sw, cy - 12, sw + 24, cy + 12], 6, fill=color,
                  outline=BORDER, width=1)
        # count
        art.text((x + w - pad - 30, cy), str(count), 12, GRAY, anchor="mm")
        # remove
        cross(art, x + w - pad - 8, cy, 4.5, GRAY, width=2)
        ry += row_h + gap

    # Footer.
    fy = y + header_h + rows_h
    art.rrect([x + pad, fy + 6, x + w - pad, fy + footer_h - 10], 7, fill="#f1f3f4")
    art.text((x + w / 2, fy + (footer_h - 4) / 2), "+ Add search term", 12.5,
             BRAND, bold=True, anchor="mm")
    return total_h


def paragraph(art, x, y, width, words, size, line_h, term_colors, active_idx=None):
    """Render wrapped text, drawing a coloured highlight behind matched words."""
    space = art.textlen(" ", size)
    cx, cy = x, y
    for i, word in enumerate(words):
        ww = art.textlen(word, size)
        if cx + ww > x + width:
            cx, cy = x, cy + line_h
        key = word.lower().strip(".,—")
        if key in term_colors:
            color = ORANGE if i == active_idx else term_colors[key]
            art.rrect([cx - 3, cy - 2, cx + ww + 3, cy + size + 4], 3, fill=color)
            if i == active_idx:
                art.rrect([cx - 3, cy - 2, cx + ww + 3, cy + size + 4], 3,
                          outline="#00000088", width=1)
        art.text((cx, cy), word, size, DARK)
        cx += ww + space
    return cy + line_h


def browser_frame(art, x, y, w, h, url):
    bar = 50
    art.rrect([x, y, x + w, y + h], 12, fill=WHITE, outline=BORDER, width=1)
    art.rrect([x, y, x + w, y + bar], 12, fill="#f1f3f4",
              corners=(True, True, False, False))
    for i in range(3):
        c = ["#ff5f57", "#febc2e", "#28c840"][i]
        art.ellipse([x + 18 + i * 22, y + bar / 2 - 6, x + 30 + i * 22, y + bar / 2 + 6],
                    fill=c)
    art.rrect([x + 96, y + bar / 2 - 13, x + w - 60, y + bar / 2 + 13], 13,
              fill=WHITE, outline=BORDER, width=1)
    art.text((x + 112, y + bar / 2), url, 12, GRAY, anchor="lm")
    glass(art, x + w - 36, y + bar / 2, 22)
    art.line([x, y + bar, x + w, y + bar], BORDER, width=1)
    return y + bar


DEMO = ("The browser search experience has not changed in years. You open the "
        "browser find bar, type one term, and step through results one by one. "
        "Multi Search replaces that browser workflow. Type every term you care "
        "about and each search term gets its own highlight color on the page. A "
        "yellow highlight for one term, a blue highlight for another — every "
        "color is yours to pick. Because each search keeps a distinct color, "
        "scanning a long page becomes effortless and the active search result "
        "uses a high contrast color so you never lose your place.").split()

TERM_COLORS = {
    "search": PALETTE[0], "browser": PALETTE[2],
    "highlight": PALETTE[1], "color": PALETTE[3],
}


# --------------------------------------------------------------------------
def small_tile():
    art = Art(440, 280)
    art.vgradient(BRAND, BRAND_DARK)
    glass(art, 220, 96, 96)
    art.text((220, 168), "Multi Search", 34, WHITE, bold=True, anchor="mm")
    art.text((220, 204), "Multi-term find & highlight", 16, "#dce8fb", anchor="mm")
    n = 8
    dot, gap = 17, 9
    total = n * dot + (n - 1) * gap
    sx = 220 - total / 2
    for i, c in enumerate(PALETTE):
        cx = sx + i * (dot + gap) + dot / 2
        art.ellipse([cx - dot / 2, 238, cx + dot / 2, 238 + dot], fill=c)
    art.save("small-tile.png")


def large_tile():
    art = Art(1400, 560)
    art.vgradient(BRAND, BRAND_DARK)
    # Left column.
    glass(art, 118, 110, 104)
    art.text((188, 92), "Multi Search", 56, WHITE, bold=True, anchor="lm")
    art.text((190, 150), "Find & highlight many terms at once", 24, "#dce8fb",
             anchor="lm")
    feats = [
        ("Search multiple terms simultaneously", PALETTE[0]),
        ("A configurable highlight colour per term", PALETTE[1]),
        ("Works across Shadow DOM and iframes", PALETTE[3]),
        ("Replaces Ctrl+F on Chrome, Edge & Firefox", PALETTE[4]),
    ]
    fy = 232
    for label, c in feats:
        art.ellipse([70, fy - 9, 88, fy + 9], fill=c)
        art.text((104, fy), label, 21, WHITE, anchor="lm")
        fy += 52
    # Right column: floating panel.
    terms = [("browser", PALETTE[2], 6), ("search", PALETTE[0], 14),
             ("highlight", PALETTE[1], 8), ("color", PALETTE[3], 5)]
    px, py, pw = 905, 150, 430
    art.shadow([px, py, px + pw, py + panel_height(len(terms))], 12,
               blur=26, alpha=90)
    panel(art, px, py, pw, terms, "3 / 33")
    art.save("large-tile.png")


def screen_header(art, title, subtitle):
    art.text((640, 64), title, 38, BRAND, bold=True, anchor="mm")
    art.text((640, 108), subtitle, 19, GRAY, anchor="mm")


def screenshot_1():
    art = Art(1280, 800, PAGE_BG)
    screen_header(art, "Search many terms at once",
                  "Every term highlighted simultaneously, each in its own colour.")
    bx, by, bw, bh = 90, 150, 1100, 600
    art.shadow([bx, by, bx + bw, by + bh], 12, blur=30, alpha=70)
    content_y = browser_frame(art, bx, by, bw, bh, "developer.example.com/guide")
    art.text((bx + 40, content_y + 34), "Improving how you search the web", 24,
             DARK, bold=True)
    end = paragraph(art, bx + 40, content_y + 84, bw - 520, DEMO, 16.5, 30,
                    TERM_COLORS, active_idx=18)
    paragraph(art, bx + 40, end + 16, bw - 520, DEMO[:34], 16.5, 30, TERM_COLORS)
    terms = [("browser", PALETTE[2], 6), ("search", PALETTE[0], 14),
             ("highlight", PALETTE[1], 8), ("color", PALETTE[3], 5)]
    px = bx + bw - 400
    art.shadow([px, content_y + 24, px + 360,
                content_y + 24 + panel_height(len(terms))], 12, blur=22, alpha=80)
    panel(art, px, content_y + 24, 360, terms, "2 / 33")
    art.save("screenshot-1.png")


def screenshot_2():
    art = Art(1280, 800, PAGE_BG)
    screen_header(art, "A colour for every term",
                  "Pick any highlight colour and watch the per-term match counts.")
    terms = [("browser", PALETTE[2], 6), ("search", PALETTE[0], 14),
             ("highlight", PALETTE[1], 8), ("color", PALETTE[3], 5),
             ("extension", PALETTE[4], 3)]
    pw = 460
    px = 150
    py = 230
    art.shadow([px, py, px + pw, py + panel_height(len(terms))], 12,
               blur=28, alpha=80)
    panel(art, px, py, pw, terms, "9 / 36")
    # Annotation callouts.
    notes = [
        (py + 65, "Enable or disable a term without deleting it"),
        (py + 103, "Type as many search terms as you need"),
        (py + 141, "Tap the swatch to recolour that term"),
        (py + 179, "Live match count, per term"),
    ]
    ax = px + pw + 60
    for ny, label in notes:
        art.line([px + pw + 8, ny, ax - 12, ny], BRAND, width=2)
        art.ellipse([px + pw + 4, ny - 5, px + pw + 14, ny + 5], fill=BRAND)
        art.text((ax, ny), label, 18, DARK, anchor="lm")
    by = py + panel_height(len(terms)) + 36
    art.text((ax, by), "The active match uses a high-contrast", 18, DARK,
             anchor="lm")
    art.text((ax, by + 26), "orange — just like native Ctrl+F.", 18, DARK,
             anchor="lm")
    art.rrect([ax, by + 48, ax + 150, by + 82], 4, fill=ORANGE,
              outline="#00000088", width=1)
    art.text((ax + 75, by + 65), "active match", 14, "#101010", anchor="mm")
    art.save("screenshot-2.png")


def screenshot_3():
    art = Art(1280, 800, PAGE_BG)
    screen_header(art, "Customise your palette",
                  "Set the eight default colours and the Ctrl+F behaviour.")
    pw, ph = 380, 470
    px = 640 - pw / 2
    py = 200
    art.shadow([px, py, px + pw, py + ph], 14, blur=30, alpha=80)
    art.rrect([px, py, px + pw, py + ph], 14, fill=WHITE, outline=BORDER, width=1)
    # popup header
    art.rrect([px, py, px + pw, py + 78], 14, fill=BRAND,
              corners=(True, True, False, False))
    art.text((px + 22, py + 30), "Multi Search", 18, WHITE, bold=True, anchor="lm")
    art.text((px + 22, py + 56), "Find multiple terms at once, each in its own colour.",
             12, "#dce8fb", anchor="lm")
    # open button
    art.rrect([px + 22, py + 100, px + pw - 22, py + 142], 8, fill=BRAND)
    art.text((px + pw / 2, py + 121), "Open search bar on this page", 14, WHITE,
             bold=True, anchor="mm")
    # behaviour
    art.text((px + 22, py + 176), "BEHAVIOUR", 11, GRAY, bold=True, anchor="lm")
    art.rrect([px + 22, py + 194, px + 38, py + 210], 3, fill=BRAND)
    art.line([px + 25, py + 202, px + 28, py + 206], WHITE, width=2)
    art.line([px + 28, py + 206, px + 34, py + 197], WHITE, width=2)
    art.text((px + 48, py + 202), "Replace the browser's Ctrl+F", 13, DARK, anchor="lm")
    art.line([px + 22, py + 232, px + pw - 22, py + 232], "#eceef1", width=1)
    # palette
    art.text((px + 22, py + 258), "HIGHLIGHT COLOUR PALETTE", 11, GRAY, bold=True,
             anchor="lm")
    cols = 4
    sw_w = (pw - 44 - 3 * 12) / 4
    sw_h = 40
    for i, c in enumerate(PALETTE):
        r, col = divmod(i, cols)
        sx = px + 22 + col * (sw_w + 12)
        sy = py + 278 + r * (sw_h + 12)
        art.rrect([sx, sy, sx + sw_w, sy + sw_h], 6, fill=c, outline=BORDER, width=1)
    art.rrect([px + 22, py + 396, px + 150, py + 426], 6, fill="#f1f3f4")
    art.text((px + 86, py + 411), "Reset to defaults", 12, DARK, anchor="mm")
    art.text((px + 22, py + 446), "New terms pick the next colour from this palette.",
             11.5, GRAY, anchor="lm")
    art.save("screenshot-3.png")


if __name__ == "__main__":
    small_tile()
    large_tile()
    screenshot_1()
    screenshot_2()
    screenshot_3()
