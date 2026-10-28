"""Scarica e legge i dati da football-data.co.uk (risultati, primo tempo, quote, calendario)."""
import csv
import io
import os
import time
import urllib.request
from datetime import date, datetime

BASE = "https://football-data.co.uk"
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")


def season_code(d: date) -> str:
    """Stagione che contiene la data d, es. 2026-10-28 -> '2627'."""
    start = d.year if d.month >= 7 else d.year - 1
    return f"{start % 100:02d}{(start + 1) % 100:02d}"


def previous_season(code: str) -> str:
    a = int(code[:2]) - 1
    return f"{a % 100:02d}{(a + 1) % 100:02d}"


def season_label(code: str) -> str:
    return f"20{code[:2]}/20{code[2:]}"


def _download(url: str, path: str, max_age_hours: float) -> str:
    """Scarica url in path, riusando la copia locale se è abbastanza recente."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        age = (time.time() - os.path.getmtime(path)) / 3600
        if max_age_hours is None or age < max_age_hours:
            with open(path, "rb") as f:
                return f.read().decode("utf-8-sig", errors="replace")
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            raw = r.read()
        with open(path, "wb") as f:
            f.write(raw)
        return raw.decode("utf-8-sig", errors="replace")
    except Exception as e:  # rete assente: usa la copia vecchia se c'è
        if os.path.exists(path):
            print(f"  ! download fallito ({e}), uso copia locale di {os.path.basename(path)}")
            with open(path, "rb") as f:
                return f.read().decode("utf-8-sig", errors="replace")
        print(f"  ! impossibile scaricare {url}: {e}")
        return ""


def _int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _float(v):
    try:
        x = float(v)
        return x if x > 1 else None
    except (TypeError, ValueError):
        return None


def _date(s):
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except (ValueError, AttributeError):
            pass
    return None


def _first(row, *keys):
    for k in keys:
        v = row.get(k)
        if v not in (None, ""):
            return v
    return None


def _rows(text):
    return [r for r in csv.DictReader(io.StringIO(text)) if any(r.values())]


def load_main(league: str, season: str, current: str):
    """Partite di un campionato 'principale' (con primo tempo e quote O/U 2.5)."""
    url = f"{BASE}/mmz4281/{season}/{league}.csv"
    path = os.path.join(RAW_DIR, f"{league}_{season}.csv")
    text = _download(url, path, 6 if season == current else None)
    out = []
    for r in _rows(text):
        d = _date(r.get("Date", ""))
        fh, fa = _int(r.get("FTHG")), _int(r.get("FTAG"))
        if d is None or fh is None or fa is None:
            continue
        out.append({
            "lg": league, "season": season, "date": d.isoformat(),
            "home": r["HomeTeam"].strip(), "away": r["AwayTeam"].strip(),
            "fh": fh, "fa": fa,
            "hh": _int(r.get("HTHG")), "ha": _int(r.get("HTAG")),
            "o25": _float(_first(r, "Avg>2.5", "BbAv>2.5", "B365>2.5")),
            "u25": _float(_first(r, "Avg<2.5", "BbAv<2.5", "B365<2.5")),
        })
    return out


def load_extra(league: str, country: str, seasons):
    """Campionati 'extra' (Austria, Danimarca, Svizzera): solo risultato finale."""
    url = f"{BASE}/new/{league}.csv"
    path = os.path.join(RAW_DIR, f"{league}_all.csv")
    text = _download(url, path, 6)
    wanted = {season_label(s): s for s in seasons}
    out = []
    for r in _rows(text):
        s = wanted.get((r.get("Season") or "").strip())
        if not s:
            continue
        d = _date(r.get("Date", ""))
        fh, fa = _int(r.get("HG")), _int(r.get("AG"))
        if d is None or fh is None or fa is None:
            continue
        out.append({
            "lg": league, "season": s, "date": d.isoformat(),
            "home": r["Home"].strip(), "away": r["Away"].strip(),
            "fh": fh, "fa": fa, "hh": None, "ha": None, "o25": None, "u25": None,
        })
    return out


def load_fixtures(leagues: dict):
    """Partite in programma (calendario dei prossimi giorni)."""
    out = []
    text = _download(f"{BASE}/fixtures.csv", os.path.join(RAW_DIR, "fixtures.csv"), 3)
    for r in _rows(text):
        lg = (r.get("Div") or "").strip()
        if lg not in leagues or "extra" in leagues[lg]:
            continue
        d = _date(r.get("Date", ""))
        if d is None:
            continue
        out.append({
            "lg": lg, "date": d.isoformat(), "time": (r.get("Time") or "").strip(),
            "home": r["HomeTeam"].strip(), "away": r["AwayTeam"].strip(),
            "o25": _float(_first(r, "Avg>2.5", "B365>2.5")),
            "u25": _float(_first(r, "Avg<2.5", "B365<2.5")),
        })
    extra = {tuple(v["extra"]): k for k, v in leagues.items() if "extra" in v}
    text = _download(f"{BASE}/new_league_fixtures.csv",
                     os.path.join(RAW_DIR, "new_league_fixtures.csv"), 3)
    for r in _rows(text):
        lg = extra.get(((r.get("Country") or "").strip(), (r.get("League") or "").strip()))
        d = _date(r.get("Date", ""))
        if not lg or d is None:
            continue
        out.append({
            "lg": lg, "date": d.isoformat(), "time": (r.get("Time") or "").strip(),
            "home": r["Home"].strip(), "away": r["Away"].strip(),
            "o25": None, "u25": None,
        })
    return out


def load_all(leagues: dict, seasons):
    """Tutte le partite delle stagioni richieste (la prima è quella in corso)."""
    current = seasons[0]
    matches = []
    for lg, info in leagues.items():
        if "extra" in info:
            matches += load_extra(lg, info["extra"][0], seasons)
        else:
            for s in seasons:
                matches += load_main(lg, s, current)
    matches.sort(key=lambda m: m["date"])
    return matches
