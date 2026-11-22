"""Marcatori: probabilità che un giocatore segni nella prossima partita, dai dati ESPN
(gol, presenze, ingressi dalla panchina, tiri e tiri in porta della stagione + formazione dell'ultima partita),
e chi ha segnato nelle partite già giocate (serve a dire se una giocata "segna X" è vinta).

Modello (semplice e spiegabile):
  - gol "stimati" = metà gol veri + metà gol attesi dai tiri in porta (circa 1 su 3 diventa gol): toglie un po' di fortuna;
  - gol per partita intera = gol stimati / (titolarità + 0,35 × ingressi dalla panchina), avvicinato alla media del ruolo
    quando le partite sono poche;
  - quanto giocherà = quante volte parte titolare, corretto con l'ultima formazione (titolare / panchina / non in distinta);
  - partita: gol attesi della squadra contro quell'avversario (modello dei risultati esatti) rispetto alla sua media;
  - probabilità di segnare almeno un gol = 1 − e^(−gol attesi del giocatore)."""
import json
import math
import os
import re
import time
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer"
SLUG = {"I1": "ita.1", "I2": "ita.2", "E0": "eng.1", "E1": "eng.2", "E2": "eng.3", "E3": "eng.4", "D1": "ger.1", "D2": "ger.2",
        "SP1": "esp.1", "SP2": "esp.2", "F1": "fra.1", "F2": "fra.2", "N1": "ned.1", "B1": "bel.1", "P1": "por.1", "G1": "gre.1",
        "T1": "tur.1", "AUT": "aut.1", "DNK": "den.1", "SWZ": "sui.1"}
CACHE = os.path.join(os.path.dirname(__file__), "..", "data", "espn")
PRIOR = {"F": 0.30, "M": 0.10, "D": 0.035}      # gol per partita intera di un giocatore "medio" del ruolo
PRIOR_W = 4.0                                    # quante partite pesa la media del ruolo
SUB = 0.35                                       # un ingresso dalla panchina vale circa un terzo di partita
SOT_GOAL = 0.32                                  # gol per tiro in porta


# ---------- scaricamento con copia locale ----------
def _get(url, name, max_age_h):
    path = os.path.join(CACHE, name)
    if os.path.exists(path) and (max_age_h is None or (time.time() - os.path.getmtime(path)) / 3600 < max_age_h):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            d = json.loads(r.read().decode("utf-8"))
        os.makedirs(CACHE, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(d, f)
        return d
    except Exception:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        return None


def _many(jobs, workers=8):
    """jobs = [(url, nome_file, ore)] -> risultati nello stesso ordine."""
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(lambda j: _get(*j), jobs))


# ---------- abbinamento nomi squadre (football-data <-> ESPN), come nella scheda Live ----------
STOP = set("fc cf ac as sc sv afc cd ud rc sd kv kvc kaa krc rsc fk bk if club de us ssc spvgg vfl vfb tsg ksv sk b ii "
           "united city town rovers athletic wanderers county albion sfk bb calcio the royal".split())


def _toks(s):
    s = str(s).lower().replace("ø", "o").replace("æ", "ae").replace("ß", "ss")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    allt = [t for t in re.sub(r"[^a-z0-9 ]", " ", s).split() if t and not t.isdigit()]
    t = [x for x in allt if x not in STOP and len(x) > 1]
    return t or allt


def _tri(s):
    x = f" {s} "
    return {x[i:i + 3] for i in range(len(x) - 2)}


def sim(a, b):
    A, B = _toks(a), _toks(b)
    if not A or not B:
        return 0.0
    pre = lambda x, y: x == y or (min(len(x), len(y)) >= 3 and (x.startswith(y) or y.startswith(x)))
    S, L = (A, B) if len(A) <= len(B) else (B, A)
    tok = sum(1 for x in S if any(pre(x, y) for y in L)) / len(S)
    ga, gb = _tri("".join(A)), _tri("".join(B))
    return max(tok, 2 * len(ga & gb) / (len(ga) + len(gb)))


def _best(name, cands, thr=0.6):
    """cands = [(chiave, [nomi])] -> chiave del più simile (o None)."""
    best = None
    for k, names in cands:
        sc = max(sim(name, n) for n in names if n)
        if sc >= thr and (best is None or sc > best[0]):
            best = (sc, k)
    return best and best[1]


# ---------- partite ESPN (risultati con marcatori e formazioni) ----------
def _events(slug, d, today):
    ds = d.strftime("%Y%m%d")
    old = d < today - timedelta(days=1)            # i giorni passati non cambiano più
    j = _get(f"{ESPN}/{slug}/scoreboard?dates={ds}", f"sb_{slug}_{ds}.json", None if old else 1)
    out = []
    for e in (j or {}).get("events", []):
        c = e["competitions"][0]
        H = next(t for t in c["competitors"] if t["homeAway"] == "home")
        A = next(t for t in c["competitors"] if t["homeAway"] == "away")
        st = e.get("status", {}).get("type", {})
        sc = [a["id"] for x in c.get("details", []) if x.get("scoringPlay") and not x.get("ownGoal")
              for a in x.get("athletesInvolved", [])[:1]]
        out.append({"id": e["id"], "date": d.isoformat(), "done": bool(st.get("completed")),
                    "home": H["team"]["displayName"], "home_s": H["team"].get("shortDisplayName"), "hid": H["team"]["id"],
                    "away": A["team"]["displayName"], "away_s": A["team"].get("shortDisplayName"), "aid": A["team"]["id"], "sc": sc})
    return out


def _stats(a):
    st = {}
    for c in ((a.get("statistics") or {}).get("splits") or {}).get("categories", []):
        for s in c.get("stats", []):
            st[s["name"]] = s.get("value")
    return st


def _role(a):
    p = ((a.get("position") or {}).get("abbreviation") or "").upper()
    return "G" if p.startswith("G") else "D" if p.startswith("D") or p in ("CB", "LB", "RB") else "F" if p.startswith(("F", "S", "CF", "ST", "W")) else "M"


def run(fixtures, played, today: date, leagues):
    """Restituisce (giocatori per partita, marcatori delle partite giocate, nomi dei mercati)."""
    fx_soon = [f for f in fixtures if f["date"] <= (today + timedelta(days=4)).isoformat() and SLUG.get(f["lg"])]
    lgs = sorted({f["lg"] for f in fixtures if SLUG.get(f["lg"])} | {m["lg"] for m in played if SLUG.get(m["lg"])})
    # 1) partite ESPN degli ultimi 21 giorni: marcatori (per controllare le giocate) e ultima formazione di ogni squadra
    days = [today - timedelta(days=i) for i in range(0, 22)]
    jobs = [(lg, d) for lg in lgs for d in days]
    with ThreadPoolExecutor(8) as ex:
        evs = list(ex.map(lambda x: (x[0], _events(SLUG[x[0]], x[1], today)), jobs))
    by_lg = {}
    for lg, es in evs:
        by_lg.setdefault(lg, []).extend(es)
    # marcatori delle partite giocate, con i nomi squadra dell'app
    our = {}
    for m in played:
        if m["date"] >= days[-1].isoformat():
            our.setdefault(m["lg"], []).append(m)
    esiti = []
    for lg, es in by_lg.items():
        for e in es:
            if not e["done"]:
                continue
            for m in our.get(lg, []):
                if abs((date.fromisoformat(m["date"]) - date.fromisoformat(e["date"])).days) > 1:
                    continue
                if max(sim(m["home"], e["home"]), sim(m["home"], e["home_s"] or "")) + max(sim(m["away"], e["away"]), sim(m["away"], e["away_s"] or "")) >= 1.3:
                    esiti.append({"lg": lg, "date": m["date"], "home": m["home"], "away": m["away"], "sc": e["sc"]})
                    break
    # 2) squadre ESPN delle partite in arrivo
    teams = {}
    for lg in sorted({f["lg"] for f in fx_soon}):
        j = _get(f"{ESPN}/{SLUG[lg]}/teams", f"teams_{SLUG[lg]}.json", 24)
        for t in ((j or {}).get("sports") or [{}])[0].get("leagues", [{}])[0].get("teams", []):
            t = t["team"]
            teams.setdefault(lg, []).append((t["id"], [t.get("displayName"), t.get("shortDisplayName"), t.get("name")]))
    need = {}
    for f in fx_soon:
        for side in ("home", "away"):
            tid = _best(f[side], teams.get(f["lg"], []))
            if tid:
                need[(f["lg"], tid)] = True
                f[f"_espn_{side}"] = tid
    rosters = dict(zip(need, _many([(f"{ESPN}/{SLUG[lg]}/teams/{tid}/roster", f"roster_{SLUG[lg]}_{tid}.json", 12) for lg, tid in need])))
    # ultima partita giocata da ogni squadra -> formazione
    last = {}
    for lg, es in by_lg.items():
        for e in sorted(es, key=lambda x: x["date"]):
            if e["done"]:
                last[(lg, e["hid"])] = e["id"]
                last[(lg, e["aid"])] = e["id"]
    lineups = dict(zip(need, _many([(f"{ESPN}/{SLUG[lg]}/summary?event={last[(lg, tid)]}", f"sum_{SLUG[lg]}_{last[(lg, tid)]}.json", None)
                                     if (lg, tid) in last else ("", "_none", 0) for lg, tid in need])))

    def lineup_of(lg, tid):
        out = {}
        for r in (lineups.get((lg, tid)) or {}).get("rosters", []):
            for p in r.get("roster", []):
                out[p["athlete"]["id"]] = "titolare" if p.get("starter") else "entrato" if p.get("subbedIn") else "panchina"
        return out

    # 3) probabilità per ogni giocatore
    gf = {}
    for m in played:
        for t, g in ((m["home"], m["fh"]), (m["away"], m["fa"])):
            x = gf.setdefault((m["lg"], t), [0, 0])
            x[0] += 1
            x[1] += g
    out, names = {}, {}
    for f in fx_soon:
        if not f.get("re"):
            continue
        res = {}
        for side, lam in (("home", f["re"]["lh"]), ("away", f["re"]["la"])):
            tid = f.get(f"_espn_{side}")
            ros = rosters.get((f["lg"], tid)) if tid else None
            if not ros:
                continue
            g_n = max(1, max((_stats(a).get("appearances") or 0) for a in ros.get("athletes", [])))  # partite della squadra
            n, gtot = gf.get((f["lg"], f[side]), [0, 0])
            avg = gtot / n if n else lam
            # partita più o meno facile della media della squadra (effetto attenuato: il modello dei gol non è perfetto)
            fac = min(1.35, max(0.7, (lam / avg) ** 0.6)) if avg > 0 else 1.0
            lu = lineup_of(f["lg"], tid)
            pl = []
            for a in ros.get("athletes", []):
                role = _role(a)
                st = _stats(a)
                app, sub = st.get("appearances") or 0, st.get("subIns") or 0
                if role == "G" or app <= 0:
                    continue
                goals, sot, shots = st.get("totalGoals") or 0, st.get("shotsOnTarget") or 0, st.get("totalShots") or 0
                starts = max(0.0, app - sub)
                eq = starts + SUB * sub
                g_est = 0.5 * goals + 0.5 * SOT_GOAL * sot
                rate = (g_est + PRIOR_W * PRIOR[role]) / (eq + PRIOR_W)
                p_start = min(1.0, starts / g_n)
                p_sub = min(1.0 - p_start, sub / g_n)
                last_s = lu.get(a["id"]) if lu else None
                if lu:
                    if last_s == "titolare":
                        p_start, p_sub = max(p_start, 0.8), min(p_sub, 0.15)
                    elif last_s == "entrato":
                        p_start, p_sub = min(p_start, 0.35), max(p_sub, 0.5)
                    elif last_s == "panchina":
                        p_start, p_sub = min(p_start, 0.2), max(p_sub, 0.3)
                    else:                       # non era in distinta: infortunato, squalificato o fuori rosa
                        p_start, p_sub = p_start * 0.25, p_sub * 0.25
                mu = rate * (p_start + SUB * p_sub) * fac
                p = 1 - math.exp(-mu)
                if p < 0.08:
                    continue
                pid = a["id"]
                names[f"SC_{pid}"] = f"Segna {a.get('displayName')}"
                pl.append({"id": pid, "name": a.get("displayName"), "short": a.get("shortName") or a.get("displayName"),
                           "role": role, "p": round(p, 4), "gol": int(goals), "pres": int(app), "tit": int(starts),
                           "tiri": int(shots), "porta": int(sot), "ultima": last_s or ("?" if not lu else "fuori"), "side": side[0]})
            pl.sort(key=lambda x: -x["p"])
            res[side[0]] = pl[:8]
        if res:
            out[f["id"]] = res
    for f in fx_soon:
        f.pop("_espn_home", None)
        f.pop("_espn_away", None)
    return out, esiti, names
