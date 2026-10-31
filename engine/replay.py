"""Rifà le bollette dell'app sulle stagioni passate, una volta a settimana (il venerdì, per i 7 giorni dopo),
con le stesse regole di oggi e usando solo le partite già giocate fino a quel giorno.
Serve a confrontare le statistiche delle bollette di quest'anno con molti più casi."""
import hashlib
from datetime import date, timedelta

from . import calibration
from .markets import outcome
from .slips import build_slips
from .stats import TeamIndex, estimate


def run(matches, seasons, cfg, curves):
    min_g = cfg["statistiche"]["partite_minime"]
    played = sorted(matches, key=lambda m: m["date"])
    out = []
    for season in seasons:
        sm = [m for m in played if m["season"] == season]
        if not sm:
            continue
        index = TeamIndex(m for m in played if m["date"] < sm[0]["date"])
        d = date.fromisoformat(sm[0]["date"])
        d += timedelta(days=(4 - d.weekday()) % 7)            # primo venerdì
        end = date.fromisoformat(sm[-1]["date"])
        i = 0
        # partite della stagione prima del primo venerdì
        while i < len(sm) and sm[i]["date"] < d.isoformat():
            index.add(sm[i]); i += 1
        while d <= end:
            hi = (d + timedelta(days=7)).isoformat()
            week = []
            while i < len(sm) and sm[i]["date"] < hi:
                week.append(sm[i]); i += 1
            fixtures, by_id = [], {}
            for m in week:
                est = estimate(m["home"], m["away"], season, index, cfg)
                est["probs"] = {k: calibration.apply(curves, k, v) for k, v in est["probs"].items()}
                fid = hashlib.md5(f'{m["lg"]}{m["date"]}{m["home"]}{m["away"]}'.encode()).hexdigest()[:8]
                fx = {"id": fid, "lg": m["lg"], "date": m["date"], "time": "", "home": m["home"], "away": m["away"],
                      "o25": m.get("o25"), "u25": m.get("u25"), "est": est,
                      "ok": est["games_home"] >= min_g and est["games_away"] >= min_g}
                fixtures.append(fx)
                by_id[fid] = m
            slips, _ = build_slips(fixtures, cfg)
            for s in slips:
                pk_out, lost, ann = [], False, 0
                for pk in s["picks"]:
                    res = [outcome(mk, by_id[pk["fx"]]) for mk in pk["markets"]]
                    e = "A" if any(r is None for r in res) else "W" if any(res) else "L"
                    lost |= e == "L"
                    ann += e == "A"
                    pk_out.append([pk["lg"], "+".join(pk["markets"]), pk["p"], e])
                st = "P" if lost else "A" if ann == len(pk_out) else "V"
                out.append({"w": d.isoformat(), "m": s["method"], "k": s["kind"], "t": s["title"], "p": s["prob"],
                            "q": s["real"], "s": st, "pk": pk_out})
            for m in week:
                index.add(m)
            d += timedelta(days=7)
    return out
