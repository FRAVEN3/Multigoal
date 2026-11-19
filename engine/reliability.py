"""Campionati affidabili: per ogni campionato e tipo di giocata confronta, sulle stagioni passate,
quante volte la giocata è uscita con quante l'app se ne aspettava.
Se è uscita chiaramente meno del previsto (scarto oltre 1,5 volte quello dovuto al caso, su abbastanza partite)
il campionato viene tolto dalle bollette per quel tipo di giocata.
Nei test su 4 stagioni i campionati esclusi così sono andati peggio del previsto anche la stagione dopo."""
import math
from collections import defaultdict

from . import calibration
from .markets import outcome
from .slips import multigol_tip
from .stats import TeamIndex, estimate

# tipo di giocata -> mercato giocato (Multigol: la fascia consigliata partita per partita)
TIPI = {"MULTIGOL": None, "NGNG": "RAD", "UNDER": "U25", "BATISTUTA": "BAT"}
NOMI = {"MULTIGOL": "Multigol", "NGNG": "NG-NG nei tempi", "UNDER": "Under 2.5", "BATISTUTA": "Batistuta"}


def _picks(est, cfg):
    out = []
    t = multigol_tip({"est": est}, cfg)
    if t:
        out.append(("MULTIGOL", t[0], t[1]))
    pr = est["probs"]
    if est["metodo"] == "RADUCIOIU":
        for tipo in ("NGNG", "UNDER"):
            mk = TIPI[tipo]
            if pr.get(mk):
                out.append((tipo, mk, pr[mk]))
    if est["metodo"] == "BATISTUTA" and pr.get("BAT"):
        out.append(("BATISTUTA", "BAT", pr["BAT"]))
    return out


def _count(matches, seasons, cfg, curves):
    """res[season][(lg, tipo)] = [partite, uscite, attese]"""
    min_g = cfg["statistiche"]["partite_minime"]
    res = {s: defaultdict(lambda: [0, 0, 0.0]) for s in seasons}
    for season in seasons:
        by_lg = defaultdict(list)
        for m in matches:
            if m["season"] == season:
                by_lg[m["lg"]].append(m)
        for lg, lm in by_lg.items():
            idx = TeamIndex()
            for m in sorted(lm, key=lambda x: x["date"]):
                if idx.season_games(m["home"], season) >= min_g and idx.season_games(m["away"], season) >= min_g:
                    est = estimate(m["home"], m["away"], season, idx, cfg)
                    est["probs"] = {k: calibration.apply(curves, k, v) for k, v in est["probs"].items()}
                    for tipo, mk, p in _picks(est, cfg):
                        r = outcome(mk, m)
                        if r is None:
                            continue
                        x = res[season][(lg, tipo)]
                        x[0] += 1
                        x[1] += r
                        x[2] += p
                idx.add(m)
    return res


def _z(n, h, e):
    if not n:
        return 0.0
    p = e / n
    sd = math.sqrt(max(n * p * (1 - p), 1e-9))
    return (h - e) / sd


def _status(n, h, e, rc, tipo):
    if tipo == "BATISTUTA" or n < rc["min_partite"]:
        return "pochi"          # troppe poche partite per giudicare: resta nelle bollette
    z = _z(n, h, e)
    if z <= rc["z_escludi"]:
        return "escluso"
    if z <= rc["z_attenzione"]:
        return "attenzione"
    return "ok"


def run(matches, seasons, cfg, curves):
    """seasons = stagioni passate, dalla più recente. Restituisce la tabella e la prova sulla stagione più recente."""
    rc = cfg["affidabilita"]
    res = _count(matches, seasons, cfg, curves)
    keys = set()
    for s in seasons:
        keys |= set(res[s].keys())
    table = []
    for lg, tipo in sorted(keys):
        n = sum(res[s][(lg, tipo)][0] for s in seasons)
        h = sum(res[s][(lg, tipo)][1] for s in seasons)
        e = sum(res[s][(lg, tipo)][2] for s in seasons)
        table.append({"lg": lg, "tipo": tipo, "n": n, "uscita": round(h / n, 4) if n else None,
                      "attesa": round(e / n, 4) if n else None, "z": round(_z(n, h, e), 2),
                      "stato": _status(n, h, e, rc, tipo)})
    # prova: decido con le stagioni più vecchie e guardo come è andata la più recente
    prova = None
    if len(seasons) >= 2:
        last, prev = seasons[0], seasons[1:]
        g = {"esclusi": [0, 0, 0.0], "tenuti": [0, 0, 0.0]}
        for lg, tipo in keys:
            n0 = sum(res[s][(lg, tipo)][0] for s in prev)
            h0 = sum(res[s][(lg, tipo)][1] for s in prev)
            e0 = sum(res[s][(lg, tipo)][2] for s in prev)
            n1, h1, e1 = res[last][(lg, tipo)]
            if not n1:
                continue
            x = g["esclusi" if _status(n0, h0, e0, rc, tipo) == "escluso" else "tenuti"]
            x[0] += n1
            x[1] += h1
            x[2] += e1
        prova = {"stagione": last, **{k: {"n": v[0], "uscita": round(v[1] / v[0], 4) if v[0] else None,
                                          "attesa": round(v[2] / v[0], 4) if v[0] else None} for k, v in g.items()}}
    return {"tabella": table, "prova": prova, "nomi": NOMI}


def excluded(rel):
    """{(campionato, tipo)} da togliere dalle bollette."""
    return {(r["lg"], r["tipo"]) for r in (rel or {}).get("tabella", []) if r["stato"] == "escluso"}
