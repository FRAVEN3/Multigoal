"""Corregge le percentuali del metodo con quanto è uscito davvero nelle stagioni passate.
Esempio: se le partite stimate all'80% di Multigol 1-3 sono uscite solo il 70% delle volte,
una nuova stima dell'80% viene mostrata come 70%."""


def _isotonic(points):
    """Rende la curva crescente (stima più alta => percentuale reale non più bassa)."""
    blocks = [[x, y, n] for x, y, n in points]
    i = 0
    while i < len(blocks) - 1:
        if blocks[i][1] > blocks[i + 1][1]:
            a, b = blocks[i], blocks[i + 1]
            n = a[2] + b[2]
            blocks[i] = [(a[0] * a[2] + b[0] * b[2]) / n, (a[1] * a[2] + b[1] * b[2]) / n, n]
            del blocks[i + 1]
            i = max(i - 1, 0)
        else:
            i += 1
    return blocks


def build(calib, min_n=50):
    curves = {}
    for mid, bins in calib.items():
        pts = []
        for b in bins:
            if b["n"] < min_n:
                continue
            lo, hi = b["fascia"].rstrip("%").split("-")
            pts.append(((int(lo) + int(hi) + 1) / 200, b["perc"], b["n"]))
        if len(pts) >= 2:
            curves[mid] = [(x, y) for x, y, _ in _isotonic(sorted(pts))]
    return curves


def apply(curves, mid, p):
    c = curves.get(mid)
    if not c or p is None:
        return p
    if p <= c[0][0]:
        return round(c[0][1], 4)
    if p >= c[-1][0]:
        return round(c[-1][1], 4)
    for (x0, y0), (x1, y1) in zip(c, c[1:]):
        if x0 <= p <= x1:
            t = (p - x0) / (x1 - x0) if x1 > x0 else 0
            return round(y0 + t * (y1 - y0), 4)
    return p
