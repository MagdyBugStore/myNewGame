"""Extract Stronghold Crusader assets: .tgx/.gm1 -> PNG, copy wav/maps/aiv/etc.
Output goes under ref/ (gitignored). Usage: python extract_sh.py [GAME_DIR] [OUT_DIR]
"""
import os, shutil, struct, sys
from PIL import Image

GAME = sys.argv[1] if len(sys.argv) > 1 else r"D:\Games\Stronghold Crusader 1.3HD\Stronghold Crusader 1.3HD"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ref", "extracted")
OUT = os.path.abspath(OUT)


def rgb(p):  # ARGB1555 -> RGBA
    return (((p >> 10) & 31) * 255 // 31, ((p >> 5) & 31) * 255 // 31, (p & 31) * 255 // 31, 255)


def decode_tgx(data, w, h, pal=None):
    """TGX token stream. 16bit pixels, or 8bit palette indices if pal given."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    bpp = 1 if pal else 2
    i, x, y, n = 0, 0, 0, len(data)
    while i < n and y < h:
        t = data[i]; i += 1
        typ, cnt = t >> 5, (t & 31) + 1
        if typ == 0:  # stream
            for _ in range(cnt):
                if i + bpp > n: break
                if pal: c = pal[data[i]]
                else: c = rgb(data[i] | data[i + 1] << 8)
                i += bpp
                if x < w: px[x, y] = c
                x += 1
        elif typ == 1:  # transparent
            x += cnt
        elif typ == 2:  # repeat
            if i + bpp > n: break
            if pal: c = pal[data[i]]
            else: c = rgb(data[i] | data[i + 1] << 8)
            i += bpp
            for _ in range(cnt):
                if x < w: px[x, y] = c
                x += 1
        elif typ == 4:  # newline
            x = 0; y += 1
        else:
            break
    return img


def do_tgx(src, dst):
    d = open(src, "rb").read()
    w, h = struct.unpack_from("<II", d, 0)
    decode_tgx(d[8:], w, h).save(dst)


def decode_tile(data, w_h=(30, 16)):
    """Isometric 30x16 diamond tile: 16 rows, widths 2,6,...,30,30,...,2 (16bit px)."""
    img = Image.new("RGBA", (30, 16), (0, 0, 0, 0))
    px = img.load()
    i = 0
    for y in range(16):
        rw = 2 + 4 * y if y < 8 else 2 + 4 * (15 - y)
        x0 = 15 - rw // 2
        for k in range(rw):
            if i + 2 > len(data): return img
            px[x0 + k, y] = rgb(data[i] | data[i + 1] << 8); i += 2
    return img


def do_gm1(src, dstdir):
    d = open(src, "rb").read()
    hdr = struct.unpack_from("<22I", d, 0)
    count, dtype = hdr[3], hdr[5]
    off = 88
    pals = [[rgb(struct.unpack_from("<H", d, off + p * 512 + j * 2)[0]) for j in range(256)] for p in range(10)]
    off += 5120
    offs = struct.unpack_from(f"<{count}I", d, off); off += count * 4
    sizes = struct.unpack_from(f"<{count}I", d, off); off += count * 4
    heads = [struct.unpack_from("<HHhhBBhBBBB", d, off + k * 16) for k in range(count)]
    off += count * 16
    os.makedirs(dstdir, exist_ok=True)
    ok = 0
    for k in range(count):
        w, h, ox, oy, part, tiles, toff, direction, hoff, bw, anim = heads[k]
        chunk = d[off + offs[k]: off + offs[k] + sizes[k]]
        try:
            if dtype in (1, 6):
                img = decode_tgx(chunk, w, h)
            elif dtype == 2:
                img = decode_tgx(chunk, w, h, pals[0])
            elif dtype in (4, 5):
                img = Image.new("RGBA", (w, h))
                img.putdata([rgb(chunk[j] | chunk[j + 1] << 8) if (chunk[j] | chunk[j + 1] << 8) != 0xF81F else (0, 0, 0, 0)
                             for j in range(0, min(len(chunk), w * h * 2), 2)] + [(0, 0, 0, 0)] * max(0, w * h - len(chunk) // 2))
            elif dtype == 3:  # tile + optional tgx part above
                tile = decode_tile(chunk[:512])
                img = Image.new("RGBA", (w, max(h, 16)), (0, 0, 0, 0))
                img.paste(tile, (0, max(h, 16) - 16))
                if h > 16 and len(chunk) > 512:
                    tg = decode_tgx(chunk[512:], w, h - 16 + 0 if False else h)
                    img.alpha_composite(tg)
            else:
                continue
            img.save(os.path.join(dstdir, f"{k:04d}.png")); ok += 1
        except Exception as e:
            print("  frame fail", src, k, e)
    return ok, count, dtype


def main():
    os.makedirs(OUT, exist_ok=True)
    stats = {"tgx": 0, "gm1": 0, "frames": 0, "copied": 0}
    for root, _, files in os.walk(GAME):
        rel = os.path.relpath(root, GAME)
        for f in files:
            src = os.path.join(root, f)
            ext = f.lower().rsplit(".", 1)[-1] if "." in f else ""
            if ext in ("exe", "dll", "bik") or "Saves" in rel:
                continue  # skip binaries/videos/saves
            dst_dir = os.path.join(OUT, rel)
            os.makedirs(dst_dir, exist_ok=True)
            try:
                if ext == "tgx":
                    do_tgx(src, os.path.join(dst_dir, f[:-4] + ".png")); stats["tgx"] += 1
                elif ext == "gm1":
                    ok, cnt, dt = do_gm1(src, os.path.join(dst_dir, f[:-4]))
                    stats["gm1"] += 1; stats["frames"] += ok
                    print(f"{rel}\\{f}: type {dt}, {ok}/{cnt} frames")
                else:
                    shutil.copy2(src, os.path.join(dst_dir, f)); stats["copied"] += 1
            except Exception as e:
                print("FAIL", src, e)
    print(stats)


main()
