"""Statistiche per squadra e campionato, come nei fogli 'Eventi GG-NG' / 'Statistiche'."""
from collections import defaultdict

from .markets import (MARKETS, MULTIGOL_BANDS, code_multigol, code_top, has_ht, outcome)


class TeamIndex:
    """Partite giocate da ogni squadra, in ordine di data."""

    def __init__(self, matches=()):
        self.by_team = defaultdict(list)
        for m in matches:
            self.add(m)

    def add(self, m):
        self.by_team[m["home"]].append(m)
        self.by_team[m["away"]].append(m)

    def sample(self, team, season, cfg):
        """Partite della stagione in corso; se sono poche, aggiunge le ultime della stagione prima."""
        allm = self.by_team.get(team, [])
        cur = [m for m in allm if m["season"] == season]
        want = cfg["statistiche"]["partite_campione"]
        if len(cur) < want:
            older = [m for m in allm if m["season"] != season]
            cur = older[-(want - len(cur)):] + cur if older else cur
        return cur

    def season_games(self, team, season):
        return sum(1 for m in self.by_team.get(team, []) if m["season"] == season)


def freq(sample, market_id):
    hits = n = 0
    for m in sample:
        r = outcome(market_id, m)
        if r is None:
            continue
        n += 1
        hits += r
    return (hits / n, n) if n else (None, 0)


def classify(M, cfg):
    if M is None:
        return None
    if M <= cfg["metodo"]["raducioiu_max"]:
        return "RADUCIOIU"
    if M >= cfg["metodo"]["batistuta_min"]:
        return "BATISTUTA"
    return "NO BET"


def estimate(home, away, season, index: TeamIndex, cfg):
    """Probabilità di ogni mercato = media delle frequenze delle due squadre (come nel tuo Excel)."""
    sh = index.sample(home, season, cfg)
    sa = index.sample(away, season, cfg)
    probs = {}
    for mid, *_ in MARKETS:
        ph, nh = freq(sh, mid)
        pa, na = freq(sa, mid)
        if ph is None or pa is None:
            continue
        probs[mid] = round((ph + pa) / 2, 4)
    bat_h, _ = freq(sh, "BAT")
    bat_a, _ = freq(sa, "BAT")
    M = (bat_h + bat_a) / 2 if bat_h is not None and bat_a is not None else None
    return {
        "probs": probs,
        "bat_home": bat_h, "bat_away": bat_a,
        "M": round(M, 4) if M is not None else None,
        "metodo": classify(M, cfg),
        "games_home": index.season_games(home, season),
        "games_away": index.season_games(away, season),
    }


def _pct(a, b):
    return round(a / b, 4) if b else None


def team_table(matches, season):
    """Una riga per squadra con i conteggi dei codici Multigol e TOP (stagione indicata)."""
    teams = defaultdict(lambda: {
        "g": 0, "gf": 0, "gs": 0, "mg": defaultdict(int), "top": defaultdict(int), "ht": 0,
        "seq_mg": [], "seq_top": [], "home_g": 0, "home_bat": 0, "away_g": 0, "away_bat": 0,
    })
    for m in matches:
        if m["season"] != season:
            continue
        cm, ct = code_multigol(m), code_top(m)
        for side, team, gf, gs in (("h", m["home"], m["fh"], m["fa"]), ("a", m["away"], m["fa"], m["fh"])):
            t = teams[team]
            t["g"] += 1
            t["gf"] += gf
            t["gs"] += gs
            t["mg"][cm] += 1
            t["seq_mg"].append(cm)
            t["seq_top"].append(ct)
            if ct is not None:
                t["ht"] += 1
                t["top"][ct] += 1
                if side == "h":
                    t["home_g"] += 1
                    t["home_bat"] += ct >= 1
                else:
                    t["away_g"] += 1
                    t["away_bat"] += ct >= 1
    rows = []
    for name, t in teams.items():
        g, ht = t["g"], t["ht"]
        row = {
            "team": name, "g": g,
            "gf": round(t["gf"] / g, 2), "gs": round(t["gs"] / g, 2),
            "mg": {lbl: _pct(t["mg"][c], g) for c, lbl in MULTIGOL_BANDS},
            "mg13": _pct(t["mg"][1] + t["mg"][3], g),
            "seq_mg": t["seq_mg"], "seq_top": t["seq_top"],
        }
        if ht:
            row.update({
                "bat": _pct(ht - t["top"][0], ht),
                "top": {str(c): _pct(t["top"][c], ht) for c in range(4)},
                "bat_casa": _pct(t["home_bat"], t["home_g"]),
                "bat_fuori": _pct(t["away_bat"], t["away_g"]),
            })
        rows.append(row)
    rows.sort(key=lambda r: r["team"])
    return rows


def league_summary(matches, season):
    """Riepilogo campionato, come il foglio 'Statistiche Generali'."""
    ms = [m for m in matches if m["season"] == season]
    if not ms:
        return None
    n = len(ms)
    goals = sum(m["fh"] + m["fa"] for m in ms)
    mg = defaultdict(int)
    for m in ms:
        mg[code_multigol(m)] += 1
    out = {
        "partite": n,
        "media_gol": round(goals / n, 2),
        "mg": {lbl: _pct(mg[c], n) for c, lbl in MULTIGOL_BANDS},
        "mg13": _pct(mg[1] + mg[3], n),
        "o25": _pct(sum(1 for m in ms if m["fh"] + m["fa"] >= 3), n),
        "gg": _pct(sum(1 for m in ms if m["fh"] > 0 and m["fa"] > 0), n),
    }
    ht = [m for m in ms if has_ht(m)]
    if ht:
        top = defaultdict(int)
        g1 = sum(m["hh"] + m["ha"] for m in ht)
        g_all = sum(m["fh"] + m["fa"] for m in ht)
        for m in ht:
            top[code_top(m)] += 1
        out.update({
            "raducioiu": _pct(top[0], len(ht)),
            "bat_1t": _pct(top[1], len(ht)),
            "bat_2t": _pct(top[2], len(ht)),
            "bat_entrambi": _pct(top[3], len(ht)),
            "gol_1t": _pct(g1, g_all),
        })
    return out
