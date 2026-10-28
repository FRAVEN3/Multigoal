"""Aggiornamento settimanale: scarica i risultati, ricalcola le statistiche, crea le bollette
e scrive i dati per la pagina web (docs/data.js).

Uso:  python build.py            (oggi)
      python build.py 2026-10-30 (simula un altro giorno)
"""
import hashlib
import json
import os
import sys
from datetime import date, datetime, timedelta

from engine import backtest, calibration, data, tracker
from engine.markets import MARKETS
from engine.slips import build_slips
from engine.stats import TeamIndex, estimate, league_summary, team_table

ROOT = os.path.dirname(os.path.abspath(__file__))


def main():
    today = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.today()
    with open(os.path.join(ROOT, "config.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    leagues = cfg["leagues"]

    current = data.season_code(today)
    seasons = [current]
    for _ in range(cfg["backtest_stagioni"]):
        seasons.append(data.previous_season(seasons[-1]))

    print(f"Stagione {data.season_label(current)} - scarico i risultati...")
    matches = data.load_all(leagues, seasons)
    played = [m for m in matches if m["date"] < today.isoformat() or m["season"] != current]
    print(f"  {len(played)} partite caricate")

    index = TeamIndex(played)
    played_keys = {(m["lg"], m["home"], m["away"], m["season"]) for m in played}

    # --- backtest (ricalcolato solo se cambiano stagioni o impostazioni) -------
    bt_path = os.path.join(ROOT, "data", "backtest.json")
    bt_key = hashlib.md5((json.dumps(cfg, sort_keys=True) + ",".join(seasons[1:])).encode()).hexdigest()
    bt = None
    if os.path.exists(bt_path):
        with open(bt_path, encoding="utf-8") as f:
            cached = json.load(f)
        if cached.get("key") == bt_key:
            bt = cached["data"]
    if bt is None:
        print("Backtest sulle stagioni passate (una tantum)...")
        bt = backtest.run(played, seasons[1:], cfg)
        with open(bt_path, "w", encoding="utf-8") as f:
            json.dump({"key": bt_key, "data": bt}, f)

    curves = calibration.build(bt["calibrazione"])

    # --- partite in programma -------------------------------------------------
    print("Calendario e stime...")
    fixtures = []
    horizon = (today + timedelta(days=7)).isoformat()
    min_g = cfg["statistiche"]["partite_minime"]
    for fx in data.load_fixtures(leagues):
        if not (today.isoformat() <= fx["date"] <= horizon):
            continue
        if (fx["lg"], fx["home"], fx["away"], current) in played_keys:
            continue
        fx["id"] = hashlib.md5(f'{fx["lg"]}{fx["date"]}{fx["home"]}{fx["away"]}'.encode()).hexdigest()[:8]
        fx["est"] = estimate(fx["home"], fx["away"], current, index, cfg)
        fx["est"]["raw"] = dict(fx["est"]["probs"])
        fx["est"]["probs"] = {k: calibration.apply(curves, k, v) for k, v in fx["est"]["probs"].items()}
        # partite di riferimento delle due squadre: servono al costruttore di sistemi
        # per calcolare la probabilità di più giocate insieme sulla stessa partita
        sc = lambda ms: [[m["fh"], m["fa"], m["hh"], m["ha"]] for m in ms]
        fx["sample_h"] = sc(index.sample(fx["home"], current, cfg))
        fx["sample_a"] = sc(index.sample(fx["away"], current, cfg))
        fx["ok"] = fx["est"]["games_home"] >= min_g and fx["est"]["games_away"] >= min_g
        fixtures.append(fx)
    fixtures.sort(key=lambda f: (f["date"], f["time"], f["lg"]))
    print(f"  {len(fixtures)} partite nei prossimi 7 giorni")

    slips, tips = build_slips(fixtures, cfg)
    print(f"  {len(slips)} bollette create")

    # --- storico ---------------------------------------------------------------
    hist = tracker.load()
    added = tracker.add_new(hist, slips, today)
    tracker.settle(hist, played, today, cfg["bollette"]["puntata"])
    tracker.save(hist)
    print(f"  storico: {added} nuove, {len(hist['slips'])} totali")

    # --- statistiche per campionato ---------------------------------------------
    stats = {}
    for lg in leagues:
        lm = [m for m in played if m["lg"] == lg]
        summ = league_summary(lm, current)
        if summ:
            stats[lg] = {"riepilogo": summ, "squadre": team_table(lm, current)}

    out = {
        "aggiornato": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "oggi": today.isoformat(),
        "stagione": data.season_label(current),
        "config": cfg,
        "mercati": {m[0]: m[1] for m in MARKETS},
        "partite": fixtures,
        "consigli": tips,
        "bollette": slips,
        "storico": hist["slips"][-400:],
        "storico_riepilogo": tracker.summary(hist),
        "statistiche": stats,
        "backtest": bt,
        "risultati": [
            {k: m[k] for k in ("lg", "date", "home", "away", "fh", "fa", "hh", "ha")}
            for m in played if m["date"] >= (today - timedelta(days=45)).isoformat()
        ],
    }
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    with open(os.path.join(ROOT, "docs", "data.js"), "w", encoding="utf-8") as f:
        f.write("window.MG_DATA = ")
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("Fatto: docs/data.js aggiornato.")


if __name__ == "__main__":
    main()
