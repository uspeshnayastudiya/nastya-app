# Иконка приложения: рубленые шевроны «Путь» Огоньком на Ночи + штриховка в углу.
import os, sys
from PIL import Image, ImageDraw

NOCH = (10, 10, 10)
OGONEK = (255, 42, 0)
PUT = [
    [(12, 34), (48, 10), (84, 34), (84, 46), (48, 22), (12, 46)],
    [(12, 56), (48, 32), (84, 56), (84, 68), (48, 44), (12, 68)],
    [(12, 78), (48, 54), (84, 78), (84, 90), (48, 66), (12, 90)],
]

def icon(size, scale, shtrih=True):
    s = 4 * size
    im = Image.new('RGB', (s, s), NOCH)
    d = ImageDraw.Draw(im)
    if shtrih:
        w = s * 0.34
        h = s * 0.2
        step = s * 0.035
        band = s * 0.012
        x = s - w - h
        while x < s:
            d.polygon([(x, 0), (x + band, 0), (x + band + h, h), (x + h, h)], fill=OGONEK)
            x += step
        d.rectangle([0, h, s, s], fill=None)
        # срезать штриховку по прямоугольнику угла
        mask = Image.new('L', (s, s), 0)
        ImageDraw.Draw(mask).rectangle([s - w, 0, s, h], fill=255)
        base = Image.new('RGB', (s, s), NOCH)
        im = Image.composite(im, base, mask)
        d = ImageDraw.Draw(im)
    g = s * scale / 96
    ox = (s - 96 * g) / 2
    oy = (s - 96 * g) / 2 + s * 0.02
    for poly in PUT:
        d.polygon([(ox + x * g, oy + y * g) for x, y in poly], fill=OGONEK)
    return im.resize((size, size), Image.LANCZOS)

out = sys.argv[1]
icon(192, 0.62).save(os.path.join(out, 'icon-192.png'))
icon(512, 0.62).save(os.path.join(out, 'icon-512.png'))
icon(512, 0.5, shtrih=False).save(os.path.join(out, 'icon-maskable-512.png'))
icon(180, 0.62).save(os.path.join(out, 'apple-touch-icon.png'))
print('ok')
