"""Costruzione delle bollette della settimana a partire dalle stime sulle partite in programma."""
import hashlib

from .markets import MARKET_NAMES, MULTIGOL_ORDER


def _odds(p):
    return round(1 / p, 2) if p else None


def make_pick(fx, markets, p, real=None, cfg=None):
    if isinstance(markets, str):
        markets = [markets]
    margin = cfg["bollette"]["margine_valore"] if cfg else 1.0
    return {
        "fx": fx["id"], "lg": fx["lg"], "date": fx["date"], "time": fx.get("time", ""),
        "home": fx["home"], "away": fx["away"],
        "markets": markets,
        "name": " oppure ".join(MARKET_NAMES[m] for m in markets),
        "p": round(p, 4),
        "fair": _odds(p),
        "min_odds": round(margin / p, 2) if p else None,
        "real": real,
    }


def make_slip(kind, method, title, picks, descr="", combos=None):
    prob = 1.0
    for pk in picks:
        prob *= pk["p"]
    real = None
    if all(pk["real"] for pk in picks):
        real = 1.0
        for pk in picks:
            real *= pk["real"]
        real = round(real, 2)
    key = kind + method + "|".join(f'{p["fx"]}:{",".join(p["markets"])}' for p in picks)
    return {
        "id": hashlib.md5(key.encode()).hexdigest()[:10],
        "kind": kind, "method": method, "title": title, "descr": descr,
        "picks": picks, "prob": round(prob, 4), "fair": _odds(prob), "real": real,
        "combos": combos,
    }


def multigol_tip(fx, cfg):
    """Fascia Multigol più stretta che supera la soglia (es. 1-3 al 78%)."""
    probs = fx["est"]["probs"]
    soglia = cfg["bollette"]["soglia_consiglio"]
    for mid in MULTIGOL_ORDER:
        p = probs.get(mid)
        if p is not None and p >= soglia:
            return mid, p
    return None


def _raddoppio(cands, target, max_n):
    """Aggiunge gli eventi più probabili finché la quota supera il target (es. 2.00)."""
    chosen, odds = [], 1.0
    for pk in cands:
        if any(c["fx"] == pk["fx"] for c in chosen):
            continue
        chosen.append(pk)
        odds *= pk["real"] or pk["fair"]
        if odds >= target or len(chosen) >= max_n:
            break
    return chosen if odds >= target * 0.95 and len(chosen) >= 2 else []


def build_slips(fixtures, cfg):
    b = cfg["bollette"]
    ok = [f for f in fixtures if f["ok"]]
    slips = []

    # --- MULTIGOL -----------------------------------------------------------
    tips = []
    for fx in ok:
        t = multigol_tip(fx, cfg)
        if t:
            tips.append(make_pick(fx, t[0], t[1], cfg=cfg))
    tips.sort(key=lambda p: -p["p"])
    used = set()
    for i in (1, 2):
        sel = _raddoppio([t for t in tips if t["fx"] not in used], b["quota_raddoppio"], b["max_eventi_multipla"])
        if sel:
            used |= {p["fx"] for p in sel}
            slips.append(make_slip("multipla", "MULTIGOL", f"Multigol a raddoppio #{i}", sel,
                                   "Le fasce Multigol più sicure fino a quota ~2"))
    for t in tips[:5]:
        slips.append(make_slip("singola", "MULTIGOL", "Singola Multigol", [t]))

    # --- BATISTUTA (GG nei tempi / Over) -----------------------------------
    bat = sorted([f for f in ok if f["est"]["metodo"] == "BATISTUTA"], key=lambda f: -f["est"]["M"])
    for fx in bat[:5]:
        p = fx["est"]["probs"].get("BAT")
        if p:
            slips.append(make_slip("singola", "BATISTUTA", "Batistuta: GG-GG / GG-NG / NG-GG",
                                   [make_pick(fx, "BAT", p, cfg=cfg)],
                                   "Si giocano le 3 combinazioni divise (calcolatore 'Contabilizzatore')"))
    if len(bat) >= 2:
        picks = [make_pick(fx, "BAT", fx["est"]["probs"]["BAT"], cfg=cfg) for fx in bat[:2]]
        slips.append(make_slip("sistema", "BATISTUTA", "Sistema Batistuta 2 partite × 3 combinazioni",
                               picks, "9 colonne: GG-GG / GG-NG / NG-GG per ogni partita", combos=9))
    if len(bat) >= 3:
        picks = [make_pick(fx, "BAT", fx["est"]["probs"]["BAT"], cfg=cfg) for fx in bat[:3]]
        slips.append(make_slip("sistema", "BATISTUTA", "Sistema Batistuta 3 partite × 3 combinazioni",
                               picks, "27 colonne: GG-GG / GG-NG / NG-GG per ogni partita", combos=27))

    # --- RADUCIOIU (Under / NoGoal / risultati bassi) -----------------------
    rad = sorted([f for f in ok if f["est"]["metodo"] == "RADUCIOIU"], key=lambda f: f["est"]["M"])
    under = []
    for fx in rad:
        p = fx["est"]["probs"].get("U25")
        if p:
            under.append(make_pick(fx, "U25", p, real=fx.get("u25"), cfg=cfg))
    under.sort(key=lambda p: -p["p"])
    sel = _raddoppio(under, b["quota_raddoppio"], b["max_eventi_multipla"])
    if sel:
        slips.append(make_slip("multipla", "RADUCIOIU", "Raducioiu multipla Under 2.5", sel,
                               "Partite con media Batistuta bassa, quota ~2"))
    for fx in rad[:5]:
        p = fx["est"]["probs"].get("RAD")
        if p:
            slips.append(make_slip("singola", "RADUCIOIU", "Raducioiu: NG 1°T + NG 2°T",
                                   [make_pick(fx, "RAD", p, cfg=cfg)]))
    if len(rad) >= 2:
        picks = []
        for fx in rad[:2]:
            pr = fx["est"]["probs"]
            groups = sorted(["RE_C", "RE_O", "RE_X"], key=lambda g: -pr.get(g, 0))[:2]
            picks.append(make_pick(fx, groups, min(1.0, pr[groups[0]] + pr[groups[1]]), cfg=cfg))
        slips.append(make_slip("sistema", "RADUCIOIU", "Sistema Risultato Esatto 2 partite × 2 gruppi",
                               picks, "4 colonne, come il foglio 'Contab Sistema RE'", combos=4))

    return slips, tips
