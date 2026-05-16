#!/usr/bin/env python3
"""Generate the extension's PNG icons (no third-party libraries required).

Draws a white magnifying glass on a rounded blue tile. Run from the repo
root: `python3 gen_icons.py`
"""
import math
import os
import struct
import zlib

BRAND = (26, 115, 232)   # #1a73e8
WHITE = (255, 255, 255)
SS = 4                   # supersampling factor for anti-aliasing


def dist_point_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def sample(fx, fy):
    """Return RGBA for a point in the unit square [0,1]^2."""
    # Rounded-rectangle mask.
    r = 0.18
    cx = min(max(fx, r), 1 - r)
    cy = min(max(fy, r), 1 - r)
    if math.hypot(fx - cx, fy - cy) > r:
        return (0, 0, 0, 0)

    # Magnifying glass geometry.
    lens_x, lens_y = 0.42, 0.42
    outer, thickness = 0.27, 0.085
    inner = outer - thickness
    d = math.hypot(fx - lens_x, fy - lens_y)

    handle_start = (lens_x + outer * 0.707, lens_y + outer * 0.707)
    handle_end = (0.82, 0.82)
    hd = dist_point_segment(fx, fy, *handle_start, *handle_end)

    if (inner <= d <= outer) or hd <= 0.065:
        return WHITE + (255,)
    return BRAND + (255,)


def render(size):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    fx = (x + (sx + 0.5) / SS) / size
                    fy = (y + (sy + 0.5) / SS) / size
                    pr, pg, pb, pa = sample(fx, fy)
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa
            n = SS * SS
            if a == 0:
                row += b"\x00\x00\x00\x00"
            else:
                row += bytes((round(r / a), round(g / a), round(b / a), round(a / n)))
        rows.append(b"\x00" + bytes(row))
    return b"".join(rows)


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(
        ">I", zlib.crc32(tag + data) & 0xFFFFFFFF
    )


def write_png(path, size):
    raw = render(size)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
    os.makedirs(out, exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(os.path.join(out, f"icon{size}.png"), size)
        print(f"wrote icons/icon{size}.png")


if __name__ == "__main__":
    main()
