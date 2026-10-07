"""تجميع شرائح GM1 (tile objects) في صور مبانٍ كاملة — بيستخدم PNGs اللي في ref/gm + هيدر الـ GM1"""
import os, struct, importlib.util
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('ms', os.path.join(HERE, 'make-sprites.py'))
ms = importlib.util.module_from_spec(spec); spec.loader.exec_module(ms)
GM = ms.GM

def groups(name):
    """يرجّع قايمة (start, n) لكل مجموعة (imagePart 0..sub-1 متتالية)"""
    g = ms.GM1(name); out = []; k = 0
    while k < g.count:
        h = g.heads[k]; n = h[5] or 1
        if h[4] != 0:   # مش بداية مجموعة: تخطّى
            k += 1; continue
        out.append((k, n)); k += n
    return g, out

def compose(name, g, start, n):
    hs = [g.heads[start + i] for i in range(n)]
    ims = []
    for i in range(n):
        p = os.path.join(GM, name, '%04d.png' % (start + i))
        ims.append(Image.open(p).convert('RGBA') if os.path.exists(p) else None)
    x0 = min(h[2] for h in hs); y0 = min(h[3] for h in hs)
    x1 = max(h[2] + h[0] for h in hs); y1 = max(h[3] + max(h[1], 16) for h in hs)
    cv = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
    # الأجزاء بترتيب: الخلفي (y أصغر) الأول
    order = sorted(range(n), key=lambda i: (hs[i][3] + hs[i][1], hs[i][2]))
    for i in order:
        if ims[i] is None: continue
        h = hs[i]
        cv.alpha_composite(ims[i], (h[2] - x0, h[3] - y0 + (max(h[1], 16) - ims[i].size[1])))
    return cv

if __name__ == '__main__':
    import sys
    name = sys.argv[1]; st = int(sys.argv[2]); out = sys.argv[3]
    g, gs = groups(name)
    print(len(gs), 'groups; first', gs[:6])
    n = dict(gs).get(st, 1)
    compose(name, g, st, n).save(out)
