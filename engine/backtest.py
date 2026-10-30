"""Test sulle stagioni passate: rifà le stime giornata per giornata usando solo le partite già giocate,
così si vede quanto il metodo avrebbe funzionato davvero (come il foglio 'Sviluppo' / 'Riepilogo')."""
from collections import defaultdict

from . import exact
from .markets import MARKETS, outcome
from .stats import TeamIndex, estimate, classify
from .slips import multigol_tip


def _bin(p, step=0.05):
    lo = int(p / step) * step
    return f"{round(lo * 100)}-{round((lo + step) * 100) - 1}%"


def run(matches, seasons, cfg):
    min_g = cfg["statistiche"]["partite_minime"]
    margin = cfg["bollette"]["margine_valore"]
    calib = defaultdict(lambda: defaultdict(lambda: [0, 0]))     # mercato -> fascia p -> [n, vinte]
    fasce_M = defaultdict(lambda: defaultdict(int))               # fascia M -> contatori
    strat = defaultdict(lambda: {"n": 0, "vinte": 0, "utile": 0.0})
    tips = {"n": 0, "vinte": 0, "p": 0.0}
    rex = defaultdict(float)                                       # risultato esatto sulle partite Raducioiu

    for season in seasons:
        ms = [m for m in matches if m["season"] == season]
        by_lg = defaultdict(list)
        for m in ms:
            by_lg[m["lg"]].append(m)
        for lg, lm in by_lg.items():
            idx = TeamIndex()
            done = []
            for m in sorted(lm, key=lambda x: x["date"]):
                if idx.season_games(m["home"], season) >= min_g and idx.season_games(m["away"], season) >= min_g:
                    est = estimate(m["home"], m["away"], season, idx, cfg)
                    for mid, *_ in MARKETS:
                        p = est["probs"].get(mid)
                        r = outcome(mid, m)
                        if p is None or r is None:
                            continue
                        c = calib[mid][_bin(p)]
                        c[0] += 1
                        c[1] += r
                    # tabella fasce come 'Sviluppo'
                    M = est["M"]
                    if M is not None:
                        f = fasce_M[_bin(M)]
                        f["n"] += 1
                        for mid in ("RAD", "BAT", "U25", "O25", "NG", "GG", "O15", "MG13"):
                            f[mid] += bool(outcome(mid, m))
                        metodo = classify(M, cfg)
                        if metodo == "RADUCIOIU" and m["u25"]:
                            _bet(strat["Raducioiu → Under 2.5"], outcome("U25", m), m["u25"])
                        if metodo == "BATISTUTA" and m["o25"]:
                            _bet(strat["Batistuta → Over 2.5"], outcome("O25", m), m["o25"])
                    for mid, key in (("O25", "o25"), ("U25", "u25")):
                        p, q = est["probs"].get(mid), m.get(key)
                        if p and q and p * q >= margin:
                            _bet(strat["Value bet O/U 2.5"], outcome(mid, m), q)
                    # risultati esatti: ogni casella da 0-0 a 3-3 è un punto per la taratura "RS"
                    lh, la, cells = exact.estimate(m["home"], m["away"], season, idx, done, cfg)
                    act = (m["fh"], m["fa"])
                    for k, v in cells.items():
                        if k[0] <= exact.SHOW_G and k[1] <= exact.SHOW_G:
                            c = calib["RS"][_bin(v, 0.02)]
                            c[0] += 1
                            c[1] += k == act
                    if est["metodo"] == "RADUCIOIU":
                        tp = exact.top(cells, 3)
                        rex["n"] += 1
                        for t_n in (1, 3):
                            rex[f"p{t_n}"] += sum(v for _, v in tp[:t_n])
                            rex[f"h{t_n}"] += act in [k for k, _ in tp[:t_n]]
                    t = multigol_tip({"est": est}, cfg)
                    if t:
                        tips["n"] += 1
                        tips["vinte"] += outcome(t[0], m)
                        tips["p"] += t[1]
                idx.add(m)
                done.append(m)

    def order(k):
        return int(k.split("-")[0])

    out_calib = {
        mid: [{"fascia": k, "n": v[0], "perc": round(v[1] / v[0], 4)}
              for k, v in sorted(d.items(), key=lambda kv: order(kv[0])) if v[0] >= 20]
        for mid, d in calib.items()
    }
    out_fasce = []
    for k, f in sorted(fasce_M.items(), key=lambda kv: order(kv[0])):
        n = f["n"]
        if n < 10:
            continue
        out_fasce.append({"fascia": k, "n": n, **{mid: round(f[mid] / n, 4) for mid in
                          ("RAD", "BAT", "U25", "O25", "NG", "GG", "O15", "MG13")}})
    out_strat = {k: {**v, "perc": round(v["vinte"] / v["n"], 4) if v["n"] else None,
                     "roi": round(v["utile"] / v["n"], 4) if v["n"] else None,
                     "utile": round(v["utile"], 2)} for k, v in strat.items()}
    out_tips = {"n": tips["n"], "perc": round(tips["vinte"] / tips["n"], 4) if tips["n"] else None,
                "p_attesa": round(tips["p"] / tips["n"], 4) if tips["n"] else None}
    n = rex["n"]
    out_rex = {"n": int(n), **({k: round(rex[k] / n, 4) for k in ("p1", "h1", "p3", "h3")} if n else {})}
    return {"stagioni": seasons, "calibrazione": out_calib, "fasce_M": out_fasce,
            "strategie": out_strat, "consigli_multigol": out_tips, "risultato_esatto": out_rex}


def _bet(s, won, q):
    s["n"] += 1
    s["vinte"] += bool(won)
    s["utile"] += (q - 1) if won else -1
