#!/usr/bin/env python3
"""
Converts a PNG into font file (.ttf + .woff2).

USAGE
    python3 png_to_font.py sheet.png --family "My Pixel Font" --out myfont

Produces:
    myfont.ttf
    myfont.woff2

"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

# CONFIG

GRID_COLS = 16
GRID_ROWS = 16
NATIVE_PIXELS = 8          # each glyph cell's true resolution (8x8)
UNITS_PER_PIXEL = 128       # font design units per source pixel
UNITS_PER_EM = NATIVE_PIXELS * UNITS_PER_PIXEL   # 1024
WHITE_THRESHOLD = 200       # grayscale value above which a pixel counts as "on"

# PROPORTIONAL SPACING
SIDE_BEARING_PIXELS = 0.5   # small gap of "air" on each side of the ink
SPACE_WIDTH_PIXELS = 3.5    # width of the blank " " glyph

# CUSTOMIZING THE CHARACTER MAP
# CHARMAP is a flat list of 256 unicode characters (or None for "no glyph"),
# read left-to-right, top-to-bottom, matching the 16x16 grid in the image.
# This defaults to the standard CP437 codepage layout, which is what classic
# DOS/retro "ASCII chart" font sheets like this one normally use.

def _default_cp437_charmap():
    # Rows 0x00-0x1F: control-code glyphs 
    control = list(
        "\u0000\u263A\u263B\u2665\u2666\u2663\u2660\u2022\u25D8\u25CB\u25D9\u2642\u2640\u266A\u266B\u263C"
        "\u25BA\u25C4\u2195\u203C\u00B6\u00A7\u25AC\u21A8\u2191\u2193\u2192\u2190\u221F\u2194\u25B2\u25BC"
    )
    # Rows 0x20-0x7F: standard ASCII (space through DEL/house symbol)
    ascii_part = [chr(c) for c in range(0x20, 0x7F)] + ["\u2302"]  # 0x7F -> house glyph
    # Rows 0x80-0x9F: accented letters + currency
    hi1 = list(
        "\u00C7\u00FC\u00E9\u00E2\u00E4\u00E0\u00E5\u00E7\u00EA\u00EB\u00E8\u00EF\u00EE\u00EC\u00C4\u00C5"
        "\u00C9\u00E6\u00C6\u00F4\u00F6\u00F2\u00FB\u00F9\u00FF\u00D6\u00DC\u00A2\u00A3\u00A5\u20A7\u0192"
    )
    # Rows 0xA0-0xAF: more accented + punctuation
    hi2 = list(
        "\u00E1\u00ED\u00F3\u00FA\u00F1\u00D1\u00AA\u00BA\u00BF\u2310\u00AC\u00BD\u00BC\u00A1\u00AB\u00BB"
    )
    # Rows 0xB0-0xDF: box drawing / block shading characters
    box = list(
        "\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255D\u255C\u255B\u2510"
        "\u2514\u2534\u252C\u251C\u2500\u253C\u255E\u255F\u255A\u2554\u2569\u2566\u2560\u2550\u256C\u2567"
        "\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256B\u256A\u2518\u250C\u2588\u2584\u258C\u2590\u2580"
    )
    # Rows 0xE0-0xFF: Greek letters + math symbols
    math = list(
        "\u03B1\u00DF\u0393\u03C0\u03A3\u03C3\u00B5\u03C4\u03A6\u0398\u03A9\u03B4\u221E\u03C6\u03B5\u2229"
        "\u2261\u00B1\u2265\u2264\u2320\u2321\u00F7\u2248\u00B0\u2219\u00B7\u221A\u207F\u00B2\u25A0\u00A0"
    )
    charmap = control + ascii_part + hi1 + hi2 + box + math
    assert len(charmap) == 256, len(charmap)
    return charmap


CHARMAP = _default_cp437_charmap()

def load_glyph_bitmaps(png_path):
    img = Image.open(png_path).convert("L")
    w, h = img.size
    cell_w, cell_h = w / GRID_COLS, h / GRID_ROWS

    bitmaps = {}
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            x0, x1 = int(round(col * cell_w)), int(round((col + 1) * cell_w))
            y0, y1 = int(round(row * cell_h)), int(round((row + 1) * cell_h))
            cell = img.crop((x0, y0, x1, y1))
            cell_bin = cell.point(lambda v: 255 if v > WHITE_THRESHOLD else 0)
            small = cell_bin.resize((NATIVE_PIXELS, NATIVE_PIXELS), Image.BOX)
            arr = np.array(small) > 127

            idx = row * GRID_COLS + col
            bitmaps[idx] = arr
    return bitmaps

def bitmap_to_glyph(bitmap, pen_factory, col_shift_units=0):
    pen = pen_factory()
    h, w = bitmap.shape
    for row in range(h):
        col = 0
        while col < w:
            if not bitmap[row, col]:
                col += 1
                continue
            run_start = col
            while col < w and bitmap[row, col]:
                col += 1
            run_end = col

            x0 = run_start * UNITS_PER_PIXEL - col_shift_units
            x1 = run_end * UNITS_PER_PIXEL - col_shift_units
            y1 = (h - row) * UNITS_PER_PIXEL
            y0 = (h - row - 1) * UNITS_PER_PIXEL

            pen.moveTo((x0, y0))
            pen.lineTo((x0, y1))
            pen.lineTo((x1, y1))
            pen.lineTo((x1, y0))
            pen.closePath()
    return pen.glyph()


def build_font(png_path, family_name, style_name="Regular"):
    bitmaps = load_glyph_bitmaps(png_path)

    glyph_order = [".notdef"]
    cmap = {}
    glyphs = {}
    metrics = {}

    def _make_pen():
        return TTGlyphPen(None)

    notdef_pen = _make_pen()
    glyphs[".notdef"] = notdef_pen.glyph()
    metrics[".notdef"] = (int(SPACE_WIDTH_PIXELS * UNITS_PER_PIXEL), 0)

    used_names = set()
    for idx in range(256):
        ch = CHARMAP[idx]
        if ch is None:
            continue
        codepoint = ord(ch)
        bitmap = bitmaps[idx]

        cols_with_ink = np.where(bitmap.any(axis=0))[0]

        if codepoint == 0x20 or len(cols_with_ink) == 0:
            glyph_name = f"space_{codepoint:04x}" if codepoint != 0x20 else "space"
            if glyph_name in used_names:
                continue
            used_names.add(glyph_name)
            glyphs[glyph_name] = _make_pen().glyph()
            advance = int(round(SPACE_WIDTH_PIXELS * UNITS_PER_PIXEL))
        else:
            glyph_name = f"uni{codepoint:04X}"
            if glyph_name in used_names:
                continue
            used_names.add(glyph_name)

            left = int(cols_with_ink.min())
            right = int(cols_with_ink.max())
            ink_width_px = right - left + 1

            col_shift_units = int(round((left - SIDE_BEARING_PIXELS) * UNITS_PER_PIXEL))
            glyphs[glyph_name] = bitmap_to_glyph(bitmap, _make_pen, col_shift_units)

            advance = int(round((ink_width_px + 2 * SIDE_BEARING_PIXELS) * UNITS_PER_PIXEL))

        glyph_order.append(glyph_name)
        cmap[codepoint] = glyph_name
        metrics[glyph_name] = (advance, 0)

    fb = FontBuilder(UNITS_PER_EM, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=UNITS_PER_EM, descent=0)
    fb.setupNameTable({
        "familyName": family_name,
        "styleName": style_name,
        "uniqueFontIdentifier": f"{family_name}-{style_name}",
        "fullName": f"{family_name} {style_name}",
        "psName": f"{family_name.replace(' ', '')}-{style_name}",
        "version": "Version 1.0",
    })
    fb.setupOS2(sTypoAscender=UNITS_PER_EM, sTypoDescender=0,
                usWinAscent=UNITS_PER_EM, usWinDescent=0)
    fb.setupPost()

    return fb


def save_font(fb, out_stem):
    ttf_path = f"{out_stem}.ttf"
    woff2_path = f"{out_stem}.woff2"

    fb.save(ttf_path)

    tt = TTFont(ttf_path)
    tt.flavor = "woff2"
    tt.save(woff2_path)

    return ttf_path, woff2_path


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("png", help="Path to the font-sheet PNG")
    parser.add_argument("--family", default="Pixel Sheet Font", help="Font family name")
    parser.add_argument("--style", default="Regular", help="Font style name")
    parser.add_argument("--out", default="output_font", help="Output file stem (no extension)")
    parser.add_argument("--charmap-json", default=None,
                         help="Path to a JSON file containing a 256-entry array of "
                              "unicode chars/nulls to override the default CP437 layout")
    args = parser.parse_args()

    global CHARMAP
    if args.charmap_json:
        with open(args.charmap_json, "r", encoding="utf-8") as f:
            CHARMAP = json.load(f)
        if len(CHARMAP) != 256:
            sys.exit("charmap-json must contain exactly 256 entries")

    fb = build_font(args.png, args.family, args.style)
    ttf_path, woff2_path = save_font(fb, args.out)
    
    print(f"Wrote {ttf_path}")
    print(f"Wrote {woff2_path}")


if __name__ == "__main__":
    main()