/* Scheda "Live": risultati in tempo reale (da ESPN) delle partite dei tuoi sistemi, scalate e partite seguite.
   Ogni giocata si colora: verde/rosso pieno quando è decisa, solo bordo quando è "per ora" (partita in corso). */
(function () {
  "use strict";
  const MG = window.MG;
  if (!MG || !MG.D || !MG.sis) return;
  const { D, esc, eur, q2, lgName, fdate, ko, hm } = MG;
  const { MK, hit, elem, findResult } = MG.sis;

  // campionati dell'app -> codice ESPN (la Svizzera su ESPN non c'è)
  const SLUG = { I1: "ita.1", I2: "ita.2", E0: "eng.1", E1: "eng.2", E2: "eng.3", E3: "eng.4", D1: "ger.1", D2: "ger.2",
    SP1: "esp.1", SP2: "esp.2", F1: "fra.1", F2: "fra.2", N1: "ned.1", B1: "bel.1", P1: "por.1", G1: "gre.1", T1: "tur.1",
    AUT: "aut.1", DNK: "den.1", SWZ: "sui.1" };
  const TEMPI = new Set(["BAT", "RAD", "GGGG", "GGNG", "NGGG"]);
  const REFRESH = 60 * 1000;

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* memoria piena */ } };
  const KEY_FOLLOW = "mg_live_seguite";

  const pad = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoOf(new Date());
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoOf(d); };
  const keyOf = (p) => `${p.lg}|${p.date}|${p.home}|${p.away}`;

  // orario della partita: se manca (sistemi salvati), lo prendo dal calendario
  const FXN = {};
  D.partite.forEach((f) => (FXN[keyOf(f)] = f));
  const timeOf = (p) => p.time || (FXN[keyOf(p)] || {}).time || null;

  // ---------- abbinamento nomi squadre (football-data <-> ESPN) ----------
  const STOP = new Set(["fc", "cf", "ac", "as", "sc", "sv", "afc", "cd", "ud", "rc", "sd", "kv", "kvc", "kaa", "krc", "rsc", "fk", "bk", "if",
    "club", "de", "us", "ssc", "spvgg", "vfl", "vfb", "tsg", "ksv", "sk", "b", "ii", "united", "city", "town", "rovers", "athletic",
    "wanderers", "county", "albion", "sfk", "bb", "calcio", "the", "royal"]);
  function toks(s) {
    const all = String(s).toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss")
      .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t && !/^\d+$/.test(t));
    const t = all.filter((x) => !STOP.has(x) && x.length > 1);
    return t.length ? t : all;
  }
  function tri(s) { const g = new Set(); const x = ` ${s} `; for (let i = 0; i < x.length - 2; i++) g.add(x.slice(i, i + 3)); return g; }
  function sim(a, b) {
    const A = toks(a), B = toks(b);
    if (!A.length || !B.length) return 0;
    const pre = (x, y) => x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)));
    const [S, L] = A.length <= B.length ? [A, B] : [B, A];
    const tok = S.filter((x) => L.some((y) => pre(x, y))).length / S.length;
    const ga = tri(A.join("")), gb = tri(B.join(""));
    let inter = 0; ga.forEach((g) => gb.has(g) && inter++);
    return Math.max(tok, (2 * inter) / (ga.size + gb.size));
  }

  // ---------- dati ESPN ----------
  const cache = {};   // "slug|aaaammgg" -> { t, events, err }
  let loading = false, lastFetch = 0, fetchErr = false;

  function parseEvent(e) {
    const c = e.competitions[0], st = e.status || {}, ty = st.type || {};
    const H = c.competitors.find((t) => t.homeAway === "home"), A = c.competitors.find((t) => t.homeAway === "away");
    const hs = +H.score || 0, as = +A.score || 0;
    let s = ty.state;
    if (ty.name === "STATUS_HALFTIME") s = "ht";
    else if (s === "post" && !ty.completed) s = "rinv";
    // risultato del primo tempo dai minuti dei gol (l'autogol è già assegnato alla squadra che ne beneficia)
    let h1 = 0, a1 = 0, hT = 0, aT = 0;
    (c.details || []).forEach((x) => {
      if (!x.scoringPlay) return;
      const first = parseInt((x.clock && x.clock.displayValue) || "99", 10) <= 45;
      if (x.team && x.team.id === H.team.id) { hT++; if (first) h1++; }
      else if (x.team && x.team.id === A.team.id) { aT++; if (first) a1++; }
    });
    const period = st.period || 0;
    let hh = null, ha = null;
    if (s === "in" && period === 1) { hh = hs; ha = as; }
    else if (hT === hs && aT === as && s !== "pre") { hh = h1; ha = a1; }
    return { home: H.team.displayName, homeS: H.team.shortDisplayName, away: A.team.displayName, awayS: A.team.shortDisplayName,
      start: Date.parse(e.date), st: s, period, clock: st.displayClock || ty.shortDetail || "", fh: hs, fa: as, hh, ha };
  }

  async function fetchOne(slug, date) {
    const k = `${slug}|${date.replace(/-/g, "")}`;
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${date.replace(/-/g, "")}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      cache[k] = { t: Date.now(), events: (j.events || []).map(parseEvent) };
    } catch (e) { fetchErr = true; if (!cache[k]) cache[k] = { t: Date.now(), events: [], err: true }; }
  }

  // abbina una partita dell'app a una partita ESPN dello stesso campionato e giorno
  const matchCache = {};
  function espnFor(p) {
    const slug = SLUG[p.lg]; if (!slug) return null;
    const c = cache[`${slug}|${p.date.replace(/-/g, "")}`]; if (!c) return null;
    const k = keyOf(p);
    if (k in matchCache && matchCache[k].t === c.t) return matchCache[k].ev;
    const t = timeOf(p), ts = t ? ko(p.date, t) : null;
    let best = null;
    for (const ev of c.events) {
      const ns = Math.max(sim(p.home, ev.home), sim(p.home, ev.homeS)) + Math.max(sim(p.away, ev.away), sim(p.away, ev.awayS));
      const dt = ts == null ? null : Math.abs(ev.start - ts) / 60000;
      const ok = dt != null && dt <= 75 ? ns >= 0.8 : ns >= 1.3;
      const sc = ns + (dt != null && dt <= 15 ? 1 : dt != null && dt <= 75 ? 0.5 : 0);
      if (ok && (!best || sc > best.sc)) best = { sc, ev };
    }
    matchCache[k] = { t: c.t, ev: best && best.ev };
    return best && best.ev;
  }

  // stato di una partita: prima ESPN, poi i risultati già scaricati dall'app
  function liveOf(p) {
    const ev = espnFor(p);
    if (ev && ev.st !== "post") {
      if (ev.st === "pre") {
        const r = findResult(p);  // a volte ESPN è in ritardo ma il risultato c'è già
        return r ? fromRes(r) : ev;
      }
      return ev;
    }
    const r = findResult(p);
    if (r) return fromRes(r, ev);
    return ev || null;
  }
  const fromRes = (r, ev) => ({ st: "post", fh: r.fh, fa: r.fa, hh: r.hh ?? (ev ? ev.hh : null), ha: r.ha ?? (ev ? ev.ha : null), clock: "Finale" });

  // ---------- esito di una giocata: W/L = deciso, w/l = "se finisse adesso", n = non ancora ----------
  function judge(mk, L) {
    if (!L || L.st === "pre" || L.st === "rinv") return "n";
    const T = TEMPI.has(mk);
    if (L.st === "post") { if (T && L.hh == null) return "n"; return hit(mk, [L.fh, L.fa, L.hh, L.ha]) ? "W" : "L"; }
    const first = L.st === "in" && L.period === 1;
    if (T && !first && L.hh == null) return "n";
    const outs = new Set(), R1 = first ? 3 : 0;
    for (let a = 0; a <= R1 && outs.size < 2; a++) for (let b = 0; b <= R1 && outs.size < 2; b++)
      for (let c = 0; c <= 4 && outs.size < 2; c++) for (let d = 0; d <= 4 && outs.size < 2; d++) {
        const hh = first ? L.fh + a : L.hh, ha = first ? L.fa + b : L.ha;
        outs.add(hit(mk, [L.fh + a + c, L.fa + b + d, hh, ha]));
      }
    if (outs.size === 1) return [...outs][0] ? "W" : "L";
    return hit(mk, [L.fh, L.fa, first ? L.fh : L.hh, first ? L.fa : L.ha]) ? "w" : "l";
  }
  // esito della partita con più giocate (es. Batistuta 3 combinazioni): basta che ne vinca una
  function rowJ(js) {
    if (js.includes("W")) return "W";
    if (js.length && js.every((j) => j === "L")) return "L";
    if (js.includes("w")) return "w";
    if (js.some((j) => j === "l")) return "l";
    return "n";
  }

  // ---------- disegno ----------
  const ICON = { W: "✔", L: "✘", w: "✔", l: "✘", n: "" };

  // ---------- bollino risultato per le altre schede (Bollette, Storico, Sistema, Scalata, Bomba) ----------
  // mks = giocate alternative sulla stessa partita (basta che ne esca una). Vuoto se la partita non è iniziata.
  MG.liveJ = (p, mks) => { const L = liveOf(p); return L && L.st !== "pre" ? rowJ(mks.map((m) => judge(m, L))) : null; };
  MG.liveTag = (p, mks) => {
    const L = liveOf(p);
    if (!L || L.st === "pre") return "";
    if (L.st === "rinv") return ` <span class="lvtag">rinviata</span>`;
    const j = rowJ(mks.map((m) => judge(m, L))), live = L.st === "in" || L.st === "ht";
    const when = L.st === "ht" ? "int." : live ? esc(L.clock) : "fin.";
    const ht = L.hh != null && !(L.st === "in" && L.period === 1) ? ` <span class="q">(${L.hh}-${L.ha})</span>` : "";
    return ` <span class="lvtag pk-${j}" title="${j === "w" || j === "l" ? "se finisse adesso" : ""}">${live ? `<i class="dot"></i>` : ""}${L.fh}-${L.fa}${ht} <span class="q">${when}</span>${ICON[j] ? " " + ICON[j] : ""}</span>`;
  };
  function scoreHtml(L, p) {
    if (!L) {
      const t = timeOf(p);
      return `<div class="lvsc"><div class="lvst muted">${!SLUG[p.lg] || p.lg === "SWZ" ? "live n.d." : t ? hm(ko(p.date, t)) : "–"}</div></div>`;
    }
    if (L.st === "pre") return `<div class="lvsc"><div class="lvst muted">${hm(L.start)}</div></div>`;
    if (L.st === "rinv") return `<div class="lvsc"><div class="lvst muted">rinviata</div></div>`;
    const live = L.st === "in" || L.st === "ht";
    const lab = L.st === "ht" ? "Intervallo" : L.st === "post" ? "Finale" : esc(L.clock);
    return `<div class="lvsc"><div class="lvnum">${L.fh} - ${L.fa}</div>
      <div class="lvst ${live ? "lvon" : "muted"}">${live ? `<i class="dot"></i>` : ""}${lab}${L.hh != null && !(L.st === "in" && L.period === 1) ? ` · 1°T ${L.hh}-${L.ha}` : ""}</div></div>`;
  }
  // o = { mk, odds } oppure { mks: [...] } (più esiti della stessa giocata, es. RE casa / RE pareggio: basta uno)
  function pickChip(o, L) {
    const mks = o.mks || [o.mk], j = rowJ(mks.map((m) => judge(m, L)));
    const name = mks.map((m) => MK[m] || m).join(" / ");
    return { j, html: `<span class="lvpk pk-${j}">${esc(name)}${o.odds ? ` <span class="q">@${q2(o.odds)}</span>` : ""}${ICON[j] ? " " + ICON[j] : ""}${j === "w" || j === "l" ? ` <span class="q">per ora</span>` : ""}</span>` };
  }
  // pronostici diversi sulla stessa partita: la riga si colora solo se vanno tutti allo stesso modo
  function allJ(js) {
    if (!js.length) return "n";
    if (js.every((j) => j === "W")) return "W";
    if (js.every((j) => j === "L")) return "L";
    if (js.every((j) => j === "W" || j === "w")) return "w";
    if (js.every((j) => j === "L" || j === "l")) return "l";
    return "n";
  }
  // all = false: le giocate sono alternative (sistema), basta che ne vinca una; true: sono pronostici separati
  function rowHtml(p, opts, extra, all) {
    const L = liveOf(p);
    const chips = opts.map((o) => pickChip(o, L)), j = (all ? allJ : rowJ)(chips.map((c) => c.j));
    return { j, L, html: `<div class="lvrow row-${j}">
      <div class="lvmain"><div><b>${esc(p.home)}</b><br><b>${esc(p.away)}</b>
        <div class="small muted">${esc(lgName(p.lg))} · ${fdate(p.date, timeOf(p))}${extra || ""}</div></div>${scoreHtml(L, p)}</div>
      ${opts.length ? `<div class="lvpks">${chips.map((c) => c.html).join("")}</div>` : ""}</div>` };
  }

  // sistemi salvati con partite da ieri in avanti
  function systemsHtml() {
    const from = addDays(today(), -1);
    const list = load("mg_sistemi_salvati", []).filter((sv) => sv.items.some((it) => it.date >= from)).reverse();
    if (!list.length) return "";
    return `<h2>I miei sistemi</h2>` + list.map((sv) => {
      const rows = sv.items.map((it) => rowHtml(it, it.opts));
      const n = sv.items.length, minK = Math.min(...sv.sizes);
      const vals = sv.items.map((it, i) => { const L = rows[i].L; return it.opts.reduce((s, o) => s + (/^[Ww]$/.test(judge(o.mk, L)) ? o.odds : 0), 0); });
      const e = elem(vals), payNow = sv.sizes.reduce((s, k) => s + e[k] * (sv.perK ? sv.perK[k] : sv.per), 0);
      const done = rows.every((r) => r.j === "W" || r.j === "L"), dead = rows.filter((r) => r.j === "L").length;
      const ok = rows.filter((r) => r.j === "W").length, okNow = rows.filter((r) => r.j === "W" || r.j === "w").length;
      let head;
      if (n - dead < minK) head = `<span class="badge b-PERSA">PERSO</span> troppe partite sbagliate (ne servono almeno ${minK} giuste su ${n})`;
      else if (done) head = `${payNow > 0 ? `<span class="badge b-VINTA">VINTO</span> vincita <b>${eur(payNow)}</b>` : `<span class="badge b-PERSA">PERSO</span>`} · utile <b class="${payNow - sv.total >= 0 ? "esito-W" : "esito-L"}">${eur(payNow - sv.total)}</b>`;
      else head = `<span class="badge b-INCORSO">IN CORSO</span> giuste ${ok} (per ora ${okNow}) su ${n} · ne servono ${minK}${okNow ? ` · se finisse adesso: <b>${eur(payNow)}</b>` : ""}`;
      return `<div class="card"><div class="small"><b>${n} partite · ${sv.cols} colonne · ${eur(sv.total)}</b> <span class="muted">(${sv.sizes.map((k) => k === n ? "integrale" : `${k} su ${n}`).join(" + ")})</span></div>
        <div class="small" style="margin:4px 0 2px">${head}</div>${rows.map((r) => r.html).join("")}</div>`;
    }).join("");
  }

  function scalateHtml() {
    const from = addDays(today(), -1);
    const list = load("mg_scalate", []).filter((sc) => (sc.steps || []).some((s) => s.picks.some((o) => o.date >= from))).reverse();
    if (!list.length) return "";
    return `<h2>Le mie scalate</h2>` + list.map((sc) => {
      let broken = false;
      const steps = sc.steps.map((s, i) => {
        const rows = s.picks.map((o) => rowHtml(o, [o]));
        const j = rows.some((r) => r.j === "L") ? "L" : rows.every((r) => r.j === "W") ? "W" : "n";
        const h = `<div class="small" style="margin-top:6px"><b>Gradino ${i + 1}</b> ${broken ? `<span class="muted">(non si gioca: scalata interrotta)</span>` : j === "W" ? `<span class="esito-W">superato ✔</span>` : j === "L" ? `<span class="esito-L">perso ✘</span>` : ""}</div>${rows.map((r) => r.html).join("")}`;
        if (j === "L") broken = true;
        return h;
      });
      return `<div class="card"><div class="small"><b>Scalata da ${eur(sc.importo)} · ${sc.steps.length} gradini</b></div>${steps.join("")}</div>`;
    }).join("");
  }

  // pronostici dell'app per una partita: consiglio Multigol + giocate delle bollette
  function tipsFor(fx) {
    const set = new Map();
    D.consigli.filter((t) => t.fx === fx.id).forEach((t) => set.set(t.markets[0], { mks: [t.markets[0]] }));
    D.bollette.forEach((b) => b.picks.forEach((pk) => { if (pk.fx === fx.id) set.set(pk.markets.join("+"), { mks: pk.markets, bol: true }); }));
    return [...set.values()];
  }

  let follow = load(KEY_FOLLOW, []).filter((p) => p.date >= addDays(today(), -2));
  const isFollowed = (p) => follow.some((x) => keyOf(x) === keyOf(p));
  let soloTip = load("mg_live_solotip", true);

  function followedHtml() {
    if (!follow.length) return "";
    return `<h2>Partite che segui</h2>` + follow.slice().sort((a, b) => ko(a.date, a.time) - ko(b.date, b.time)).map((p) => {
      const fx = FXN[keyOf(p)];
      return rowHtml(p, fx ? tipsFor(fx) : [], ` · <button class="lvstar on" data-follow="${esc(keyOf(p))}" title="Smetti di seguire">★</button>`, true).html;
    }).join("");
  }

  function todayHtml() {
    const t = today();
    let list = D.partite.filter((f) => f.date === t).sort((a, b) => ko(a.date, a.time) - ko(b.date, b.time));
    if (!list.length) return `<h2>Partite di oggi</h2><div class="empty">Nessuna partita in calendario oggi.</div>`;
    const withTip = list.map((f) => ({ f, tips: tipsFor(f) }));
    const inBol = withTip.filter((x) => x.tips.some((o) => o.bol)), shown = soloTip ? inBol : withTip;
    return `<h2>Partite di oggi</h2>
      <div class="chips"><button class="chip ${soloTip ? "on" : ""}" data-lvtip="1">Solo partite delle bollette (${inBol.length})</button>
      <button class="chip ${soloTip ? "" : "on"}" data-lvtip="0">Tutte (${list.length})</button></div>
      <div class="small muted" style="margin:-4px 4px 8px">Tocca ☆ per seguire una partita: la trovi in alto.</div>
      ${shown.map(({ f, tips }) => rowHtml(f, tips, ` · <button class="lvstar ${isFollowed(f) ? "on" : ""}" data-follow="${esc(keyOf(f))}">${isFollowed(f) ? "★" : "☆"}</button>`, true).html).join("") || `<div class="empty">Nessuna partita delle bollette oggi.</div>`}`;
  }

  // ---------- quali campionati/giorni scaricare ----------
  function needed() {
    const from = addDays(today(), -1), to = addDays(today(), 1), need = new Set();
    const add = (p) => { if (p.date >= from && p.date <= to && SLUG[p.lg] && p.lg !== "SWZ") need.add(`${SLUG[p.lg]}|${p.date}`); };
    D.partite.filter((f) => f.date === today()).forEach(add);
    load("mg_sistemi_salvati", []).forEach((sv) => sv.items.forEach(add));
    load("mg_scalate", []).forEach((sc) => (sc.steps || []).forEach((s) => s.picks.forEach(add)));
    D.storico.forEach((s) => s.status === "IN CORSO" && s.picks.forEach(add));
    follow.forEach(add);
    return [...need];
  }
  async function refreshData(force) {
    if (loading) return;
    if (!force && Date.now() - lastFetch < REFRESH - 2000) return;
    loading = true; fetchErr = false;
    const list = needed().filter((k) => k.split("|")[1] <= today());   // domani non serve ancora
    await Promise.all(list.map((k) => { const [slug, date] = k.split("|"); return fetchOne(slug, date); }));
    lastFetch = Date.now(); loading = false;
    const changed = useFinals();
    const sig = Object.values(cache).map((c) => c.events.map((e) => `${e.st}${e.fh}${e.fa}${e.clock}`).join()).join("|");
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (MG.state.tab === "live") MG.render();
    else if ((changed || sig !== lastSig) && SHOWN.has(MG.state.tab) && !typing) MG.render();
    lastSig = sig;
  }
  let lastSig = "";
  const SHOWN = new Set(["bollette", "storico", "sistema", "scalata", "bomba", "rendimento"]);

  // ---------- risultati finali dal live, finché non arriva quello ufficiale ----------
  // Così storico, rendimento, sistemi e scalate si chiudono appena finisce la partita invece di aspettare il lunedì.
  const FKEY = "mg_live_finali", AFTER = new Set(["storico", "rendimento", "sistema", "scalata", "bollette"]);
  let FIN = load(FKEY, {});
  for (const k of Object.keys(FIN)) if (FIN[k].date < addDays(today(), -30)) delete FIN[k];
  MG.liveFinal = (p) => {
    const f = FIN[keyOf(p)];
    return f ? { lg: p.lg, date: p.date, home: p.home, away: p.away, fh: f.fh, fa: f.fa, hh: f.hh, ha: f.ha, live: true } : null;
  };
  const official = (p) => (D.risultati || []).some((m) => m.lg === p.lg && m.home === p.home && m.away === p.away && Math.abs(new Date(m.date) - new Date(p.date)) <= 4 * 864e5);
  // partite giocate (fino a 5 giorni fa) senza risultato ufficiale, in bollette dell'app, sistemi e scalate
  function pending() {
    const from = addDays(today(), -5), t = today(), out = [];
    const add = (p) => { if (p.date >= from && p.date <= t && SLUG[p.lg] && p.lg !== "SWZ" && !FIN[keyOf(p)] && !official(p)) out.push(p); };
    D.storico.forEach((s) => s.status === "IN CORSO" && s.picks.forEach((pk) => !pk.esito && add(pk)));
    load("mg_sistemi_salvati", []).forEach((sv) => sv.items.forEach(add));
    load("mg_scalate", []).forEach((sc) => (sc.steps || []).forEach((st) => st.picks.forEach(add)));
    follow.forEach(add);
    return out;
  }
  // salvo i risultati finali trovati (solo se si conosce anche il primo tempo, che serve per GG/NG nei tempi)
  function saveFinals(list) {
    let n = 0;
    list.forEach((p) => {
      const ev = espnFor(p);
      if (ev && ev.st === "post" && ev.hh != null) { FIN[keyOf(p)] = { fh: ev.fh, fa: ev.fa, hh: ev.hh, ha: ev.ha, date: p.date }; n++; }
    });
    if (n) store(FKEY, FIN);
    return n;
  }
  // chiude le bollette dell'app con i risultati live (stesse regole dell'aggiornamento)
  function settleStorico() {
    let changed = false;
    const stake = D.config.bollette.puntata, R = D.storico_riepilogo;
    D.storico.forEach((s) => {
      if (s.status !== "IN CORSO") return;
      s.picks.forEach((pk) => {
        if (pk.esito) return;
        const r = MG.liveFinal(pk);
        if (!r) return;
        pk.esito = pk.markets.some((m) => hit(m, [r.fh, r.fa, r.hh, r.ha])) ? "W" : "L";
        pk.score = `${r.fh}-${r.fa} (${r.hh}-${r.ha})`;
        pk.live = true; changed = true;
      });
      const lost = s.picks.some((pk) => pk.esito === "L"), done = s.picks.every((pk) => pk.esito === "W" || pk.esito === "ANN");
      if (!lost && !(done && s.picks.some((pk) => pk.esito === "W"))) return;
      s.status = lost ? "PERSA" : "VINTA"; s.settled = today(); s.live = true;
      if (s.real) { s.stake = stake; s.profit = Math.round((s.status === "VINTA" ? stake * s.real - stake : -stake) * 100) / 100; }
      // aggiorno anche il riepilogo per metodo della scheda Storico
      const key = `${s.method} – ${s.kind}`, x = (R[key] = R[key] || { n: 0, vinte: 0, p_attesa: 0, n_quote: 0, utile: 0, giocato: 0 });
      x.p_attesa = (x.p_attesa * x.n + s.prob) / (x.n + 1);
      x.n++; x.vinte += s.status === "VINTA"; x.perc = x.vinte / x.n;
      if (s.real) { x.n_quote++; x.utile += s.profit; x.giocato += stake; }
    });
    return changed;
  }
  function useFinals() { saveFinals(pending()); return settleStorico(); }
  async function checkFinals() {
    const list = pending();
    if (!list.length) return;
    const pairs = [...new Set(list.map((p) => `${SLUG[p.lg]}|${p.date}`))];
    await Promise.all(pairs.map((k) => { const [slug, date] = k.split("|"), c = cache[`${slug}|${date.replace(/-/g, "")}`];
      return c && Date.now() - c.t < 50000 ? null : fetchOne(slug, date); }));
    const n = saveFinals(list), ch = settleStorico();
    // ridisegno solo se è cambiato qualcosa e non stai scrivendo in una casella
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((n || ch) && AFTER.has(MG.state.tab) && !typing) MG.render();
  }
  settleStorico();   // risultati live salvati le volte prima
  checkFinals();
  setInterval(() => { if (document.visibilityState === "visible") checkFinals(); }, 5 * 60 * 1000);

  function view() {
    if (!lastFetch && !loading) refreshData(true);
    const sections = systemsHtml() + scalateHtml() + followedHtml();
    return `<div class="note">Risultati in tempo reale delle tue giocate. <b>Verde/rosso pieno</b> = giocata già decisa, <b>solo bordo</b> = "se finisse adesso".
      Si aggiorna da solo ogni minuto mentre la scheda è aperta.</div>
      <div class="row"><button class="btn" data-lvref="1">${loading ? "Aggiorno…" : "🔄 Aggiorna ora"}</button>
      <span class="small muted">${lastFetch ? `ultimo controllo ${hm(lastFetch)}` : "carico i risultati…"}${fetchErr ? " · ⚠ alcuni risultati non sono arrivati (connessione?)" : ""}</span></div>
      ${sections || `<div class="small muted" style="margin:0 4px 8px">Non hai sistemi o scalate salvati con partite di oggi: salvali dalle schede Sistema, Bomba IA o Scalata, oppure segui le partite qui sotto con ☆.</div>`}
      ${todayHtml()}
      <div class="small muted" style="margin:12px 4px">Risultati live da ESPN (per la Svizzera non disponibili: si vedono dopo l'aggiornamento dell'app). I risultati ufficiali e lo storico restano quelli di football-data.</div>`;
  }

  MG.views.live = view;
  const main = document.getElementById("main");
  main.addEventListener("click", (ev) => {
    if (MG.state.tab !== "live") return;
    const t = ev.target.closest("[data-follow],[data-lvref],[data-lvtip]"); if (!t) return;
    const d = t.dataset;
    if (d.lvref) { refreshData(true); MG.render(); return; }
    if (d.lvtip) { soloTip = d.lvtip === "1"; store("mg_live_solotip", soloTip); }
    if (d.follow) {
      if (follow.some((x) => keyOf(x) === d.follow)) follow = follow.filter((x) => keyOf(x) !== d.follow);
      else { const f = FXN[d.follow]; if (f) follow.push({ lg: f.lg, date: f.date, time: f.time, home: f.home, away: f.away }); refreshData(true); }
      store(KEY_FOLLOW, follow);
    }
    MG.render();
  });
  const showsLive = () => MG.state.tab === "live" || SHOWN.has(MG.state.tab);
  setInterval(() => { if (showsLive() && document.visibilityState === "visible") refreshData(); }, 15000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && showsLive()) refreshData(); });
  refreshData(true);   // risultati subito, anche se apri l'app su Bollette
})();
