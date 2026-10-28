"""Mercati giocabili e codici usati nei fogli Excel originali."""


def tot(m):
    return m["fh"] + m["fa"]


def has_ht(m):
    return m.get("hh") is not None and m.get("ha") is not None


def second_half(m):
    return m["fh"] - m["hh"], m["fa"] - m["ha"]


def code_multigol(m):
    """Codice del file 'Wincere MULTIGOL': 0=0-0, 1=1-2 gol, 3=3 gol, 2=4-5 gol, 4=6+ gol."""
    g = tot(m)
    if g == 0:
        return 0
    if g <= 2:
        return 1
    if g == 3:
        return 3
    if g <= 5:
        return 2
    return 4


MULTIGOL_BANDS = [(0, "0-0"), (1, "1-2"), (3, "3"), (2, "4-5"), (4, "6+")]


def code_top(m):
    """Codice del file 'WINCERE TOP': 0=nessun tempo con GG, 1=GG 1°T, 2=GG 2°T, 3=GG in entrambi."""
    if not has_ht(m):
        return None
    s1 = m["hh"] > 0 and m["ha"] > 0
    h2, a2 = second_half(m)
    s2 = h2 > 0 and a2 > 0
    return int(s1) + 2 * int(s2)


def _score_in(m, scores):
    return (m["fh"], m["fa"]) in scores


# id, nome, gruppo, serve primo tempo?, funzione esito
MARKETS = [
    ("MG12", "Multigol 1-2", "multigol", False, lambda m: 1 <= tot(m) <= 2),
    ("MG13", "Multigol 1-3", "multigol", False, lambda m: 1 <= tot(m) <= 3),
    ("MG14", "Multigol 1-4", "multigol", False, lambda m: 1 <= tot(m) <= 4),
    ("MG23", "Multigol 2-3", "multigol", False, lambda m: 2 <= tot(m) <= 3),
    ("MG24", "Multigol 2-4", "multigol", False, lambda m: 2 <= tot(m) <= 4),
    ("MG25", "Multigol 2-5", "multigol", False, lambda m: 2 <= tot(m) <= 5),
    ("MG35", "Multigol 3-5", "multigol", False, lambda m: 3 <= tot(m) <= 5),
    ("MG45", "Multigol 4-5", "multigol", False, lambda m: 4 <= tot(m) <= 5),
    ("O15", "Over 1.5", "underover", False, lambda m: tot(m) >= 2),
    ("O25", "Over 2.5", "underover", False, lambda m: tot(m) >= 3),
    ("U25", "Under 2.5", "underover", False, lambda m: tot(m) <= 2),
    ("U35", "Under 3.5", "underover", False, lambda m: tot(m) <= 3),
    ("GG", "Goal", "goal", False, lambda m: m["fh"] > 0 and m["fa"] > 0),
    ("NG", "No Goal", "goal", False, lambda m: not (m["fh"] > 0 and m["fa"] > 0)),
    ("BAT", "GG in almeno un tempo (Batistuta)", "tempi", True, lambda m: code_top(m) >= 1),
    ("RAD", "NG-NG nei due tempi (Raducioiu)", "tempi", True, lambda m: code_top(m) == 0),
    ("GGGG", "GG 1°T + GG 2°T", "tempi", True, lambda m: code_top(m) == 3),
    ("GGNG", "GG 1°T + NG 2°T", "tempi", True, lambda m: code_top(m) == 1),
    ("NGGG", "NG 1°T + GG 2°T", "tempi", True, lambda m: code_top(m) == 2),
    ("RE_C", "Ris. esatto 1-0 / 2-0 / 2-1", "esatto", False,
     lambda m: _score_in(m, {(1, 0), (2, 0), (2, 1)})),
    ("RE_O", "Ris. esatto 0-1 / 0-2 / 1-2", "esatto", False,
     lambda m: _score_in(m, {(0, 1), (0, 2), (1, 2)})),
    ("RE_X", "Ris. esatto 0-0 / 1-1 / 2-2", "esatto", False,
     lambda m: _score_in(m, {(0, 0), (1, 1), (2, 2)})),
]

MARKET_BY_ID = {m[0]: m for m in MARKETS}
MARKET_NAMES = {m[0]: m[1] for m in MARKETS}

# Dal più stretto al più largo: per i consigli scelgo la fascia più stretta che supera la soglia.
MULTIGOL_ORDER = ["MG12", "MG23", "MG45", "MG35", "MG13", "MG24", "MG14", "MG25"]


def outcome(market_id, m):
    """True/False se la partita m soddisfa il mercato, None se mancano i dati."""
    _, _, _, needs_ht, fn = MARKET_BY_ID[market_id]
    if needs_ht and not has_ht(m):
        return None
    return bool(fn(m))
