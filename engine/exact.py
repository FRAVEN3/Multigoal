"""Probabilità dei singoli risultati esatti (0-0, 1-0, 1-1, ...).

Metodo: per ogni squadra calcolo quanto segna e quanto subisce rispetto alla media del campionato
(tenendo conto di casa/fuori), ricavo i gol attesi della partita e li distribuisco con la formula
di Poisson. Una piccola correzione (Dixon-Coles) aggiusta i risultati bassi 0-0, 1-0, 0-1, 1-1,
che nel calcio escono più spesso di quanto dice Poisson puro."""
import math

MAX_G = 5          # risultati da 0-0 a 5-5; il resto finisce in "altro"
SHOW_G = 3         # nelle giocate uso i risultati da 0-0 a 3-3
RHO = -0.05        # correzione risultati bassi (scelta col test sulle stagioni passate)
PRIOR = 15         # partite "di media campionato" aggiunte a ogni squadra: evita stime estreme a inizio stagione
LEAGUE_MIN = 60    # partite minime per la media del campionato


def code(h, a):
    return f"RS{h}{a}"


def league_avgs(ms):
    """Media gol in casa e fuori del campionato."""
    if len(ms) < 20:
        return 1.5, 1.2
    n = len(ms)
    return sum(m["fh"] for m in ms) / n, sum(m["fa"] for m in ms) / n


def _strength(team, games, H, A):
    gf = ga = egf = ega = 0.0
    for m in games:
        home = m["home"] == team
        gf += m["fh"] if home else m["fa"]
        ga += m["fa"] if home else m["fh"]
        egf += H if home else A
        ega += A if home else H
    k = PRIOR * (H + A) / 2
    return (gf + k) / (egf + k), (ga + k) / (ega + k)


def _pois(k, lam):
    return math.exp(-lam) * lam ** k / math.factorial(k)


def _tau(h, a, lh, la):
    if h == 0 and a == 0:
        return 1 - lh * la * RHO
    if h == 0 and a == 1:
        return 1 + lh * RHO
    if h == 1 and a == 0:
        return 1 + la * RHO
    if h == 1 and a == 1:
        return 1 - RHO
    return 1.0


def matrix(home, away, games_h, games_a, H, A):
    """Gol attesi e probabilità di ogni risultato fino a MAX_G-MAX_G."""
    att_h, def_h = _strength(home, games_h, H, A)
    att_a, def_a = _strength(away, games_a, H, A)
    lh, la = H * att_h * def_a, A * att_a * def_h
    cells = {}
    for h in range(MAX_G + 1):
        for a in range(MAX_G + 1):
            cells[(h, a)] = max(0.0, _pois(h, lh) * _pois(a, la) * _tau(h, a, lh, la))
    tot = sum(cells.values())
    # normalizzo solo per la correzione Dixon-Coles; quello che manca oltre 5-5 resta in "altro"
    inside = sum(_pois(h, lh) for h in range(MAX_G + 1)) * sum(_pois(a, la) for a in range(MAX_G + 1))
    f = inside / tot
    return lh, la, {k: v * f for k, v in cells.items()}


def league_pool(lg_played, season):
    """Partite del campionato per la media: stagione in corso, completata con la precedente se sono poche."""
    cur = [m for m in lg_played if m["season"] == season]
    if len(cur) < LEAGUE_MIN:
        old = sorted((m for m in lg_played if m["season"] != season), key=lambda m: m["date"])
        cur = old[-(LEAGUE_MIN - len(cur)):] + cur
    return cur


def top(cells, n):
    return sorted(cells.items(), key=lambda kv: -kv[1])[:n]


def estimate(fx_home, fx_away, season, index, lg_matches, cfg):
    H, A = league_avgs(lg_matches)
    gh = index.sample(fx_home, season, cfg)
    ga = index.sample(fx_away, season, cfg)
    if not gh or not ga:
        return None
    return matrix(fx_home, fx_away, gh, ga, H, A)
