"""Costruzione delle bollette della settimana a partire dalle stime sulle partite in programma."""
import hashlib
import math

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


def build_slips(fixtures, cfg, excl=frozenset()):
    """excl = {(campionato, tipo)} poco affidabili da non mettere nelle bollette (vedi reliability.py)."""
    b = cfg["bollette"]
    no = lambda fx, tipo: (fx["lg"], tipo) in excl
    ok = [f for f in fixtures if f["ok"]]
    slips = []

    # --- MULTIGOL -----------------------------------------------------------
    tips = []
    for fx in ok:
        t = None if no(fx, "MULTIGOL") else multigol_tip(fx, cfg)
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
        if p and not no(fx, "UNDER"):
            under.append(make_pick(fx, "U25", p, real=fx.get("u25"), cfg=cfg))
    under.sort(key=lambda p: -p["p"])
    sel = _raddoppio(under, b["quota_raddoppio"], b["max_eventi_multipla"])
    if sel:
        slips.append(make_slip("multipla", "RADUCIOIU", "Raducioiu multipla Under 2.5", sel,
                               "Partite con media Batistuta bassa, quota ~2"))
    for fx in [f for f in rad if not no(f, "NGNG")][:5]:
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


# ---------- MARCATORI ----------
def _at_least(ps, k):
    """Probabilità che almeno k eventi su n escano (eventi indipendenti)."""
    dp = [1.0] + [0.0] * len(ps)
    for p in ps:
        for j in range(len(ps), 0, -1):
            dp[j] = dp[j] * (1 - p) + dp[j - 1] * p
        dp[0] *= 1 - p
    return sum(dp[k:])


def build_scorer_slips(fixtures, players, cfg):
    """Bollette sui marcatori più probabili: singole, doppia e sistemi a correzione (2 su 4, 3 su 6).
    Una sola giocata per partita, così gli eventi sono indipendenti."""
    margin = cfg["bollette"]["margine_valore"]
    best = []
    for fx in fixtures:
        pl = players.get(fx["id"])
        if not pl:
            continue
        top = max((x for side in pl.values() for x in side), key=lambda x: x["p"], default=None)
        if top:
            team = fx["home"] if top["side"] == "h" else fx["away"]
            best.append((fx, top, team))
    best.sort(key=lambda x: -x[1]["p"])

    def pick(fx, pl, team):
        p = pl["p"]
        return {"fx": fx["id"], "lg": fx["lg"], "date": fx["date"], "time": fx.get("time", ""), "home": fx["home"], "away": fx["away"],
                "markets": [f"SC_{pl['id']}"], "name": f"Segna {pl['name']} ({team})", "p": round(p, 4), "fair": _odds(p),
                "min_odds": round(margin / p, 2), "real": None}
    picks = [pick(*b) for b in best]
    slips = []
    for pk in picks[:5]:
        slips.append(make_slip("singola", "MARCATORI", "Singola marcatore", [pk], "Il marcatore più probabile di una partita"))
    if len(picks) >= 2:
        slips.append(make_slip("multipla", "MARCATORI", "Doppia marcatori", picks[:2], "I due marcatori più probabili, in partite diverse"))
    for k, n in ((2, 4), (3, 6)):
        if len(picks) >= n:
            sel = picks[:n]
            s = make_slip("sistema", "MARCATORI", f"Sistema marcatori {k} su {n}", sel,
                          f"Basta che segnino {k} giocatori su {n}: {math.comb(n, k)} colonne", combos=math.comb(n, k))
            s["min_ok"] = k
            s["prob"] = round(_at_least([p["p"] for p in sel], k), 4)
            s["fair"] = None
            slips.append(s)
    return slips
