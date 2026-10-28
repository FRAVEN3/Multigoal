"""Storico delle bollette: salva quelle nuove e controlla da solo se sono vinte o perse."""
import json
import os
from datetime import date, timedelta

from .markets import outcome

STATE = os.path.join(os.path.dirname(__file__), "..", "state", "history.json")


def load():
    if os.path.exists(STATE):
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    return {"slips": []}


def save(hist):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, indent=1)


def add_new(hist, slips, today: date):
    known = {s["id"] for s in hist["slips"]}
    added = 0
    for s in slips:
        if s["id"] not in known:
            hist["slips"].append({**s, "created": today.isoformat(), "status": "IN CORSO"})
            added += 1
    return added


def _find(results, pick):
    key = (pick["lg"], pick["home"], pick["away"])
    d0 = date.fromisoformat(pick["date"])
    best = None
    for m in results.get(key, []):
        delta = abs((date.fromisoformat(m["date"]) - d0).days)
        if delta <= 4 and (best is None or delta < best[0]):
            best = (delta, m)
    return best[1] if best else None


def settle(hist, matches, today: date, stake: float):
    results = {}
    for m in matches:
        results.setdefault((m["lg"], m["home"], m["away"]), []).append(m)
    for s in hist["slips"]:
        if s["status"] != "IN CORSO":
            continue
        any_lost, all_done = False, True
        for pk in s["picks"]:
            if pk.get("esito") in ("W", "L"):
                any_lost |= pk["esito"] == "L"
                continue
            m = _find(results, pk)
            if m is None:
                all_done = False
                if date.fromisoformat(pk["date"]) < today - timedelta(days=10):
                    pk["esito"] = "ANN"
                continue
            res = [outcome(mid, m) for mid in pk["markets"]]
            if any(r is None for r in res):
                pk["esito"] = "ANN"
                continue
            pk["esito"] = "W" if any(res) else "L"
            pk["score"] = f'{m["fh"]}-{m["fa"]}' + (f' ({m["hh"]}-{m["ha"]})' if m.get("hh") is not None else "")
            any_lost |= pk["esito"] == "L"
        if any_lost:
            s["status"] = "PERSA"
        elif all_done or all(pk.get("esito") in ("W", "ANN") for pk in s["picks"]):
            if all(pk.get("esito") == "ANN" for pk in s["picks"]):
                s["status"] = "ANNULLATA"
            elif all(pk.get("esito") in ("W", "ANN") for pk in s["picks"]):
                s["status"] = "VINTA"
        if s["status"] in ("VINTA", "PERSA"):
            s["settled"] = today.isoformat()
            if s.get("real"):
                s["stake"] = stake
                s["profit"] = round(stake * s["real"] - stake, 2) if s["status"] == "VINTA" else -stake


def summary(hist):
    """Percentuale di bollette vinte per metodo, rispetto alla probabilità stimata."""
    out = {}
    for s in hist["slips"]:
        if s["status"] not in ("VINTA", "PERSA"):
            continue
        k = f'{s["method"]} – {s["kind"]}'
        r = out.setdefault(k, {"n": 0, "vinte": 0, "p_attesa": 0.0, "n_quote": 0, "utile": 0.0, "giocato": 0.0})
        r["n"] += 1
        r["vinte"] += s["status"] == "VINTA"
        r["p_attesa"] += s["prob"]
        if "profit" in s:
            r["n_quote"] += 1
            r["utile"] += s["profit"]
            r["giocato"] += s["stake"]
    for r in out.values():
        r["perc"] = round(r["vinte"] / r["n"], 4)
        r["p_attesa"] = round(r["p_attesa"] / r["n"], 4)
        r["utile"] = round(r["utile"], 2)
    return out
