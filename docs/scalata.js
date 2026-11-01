/* Scheda "Scalata": una catena di bollette a raddoppio. La vincita di un gradino diventa
   la puntata del gradino dopo. I gradini vanno in ordine di orario (anche più nello stesso giorno):
   un gradino comincia solo quando le partite del precedente sono finite. */
(function () {
  "use strict";
  const MG = window.MG;
  if (!MG || !MG.D || !MG.sis) return;
  const { D, esc, pct, q2, eur, lgName, fdate, badge, ko, hm, startedTag } = MG;
  const { FX, MK, defOdds, hit, findResult } = MG.sis;

  const MIN = 60000;
  const GAP = 135 * MIN;   // durata di una partita con margine: il gradino dopo parte almeno 2h15 dopo
  const WIN = 180 * MIN;   // le partite di un gradino iniziano tutte entro 3 ore
  const MAX_EV = D.config.bollette.max_eventi_multipla || 5;
  const SAFE = ["MG14", "MG13", "MG24", "MG25", "MG12", "MG23", "MG35", "U35", "O15", "U25", "O25", "GG", "NG"];
  const tipOf = Object.fromEntries(D.consigli.map((t) => [t.fx, t.markets[0]]));

  const num = (v) => parseFloat(String(v).replace(",", "."));

  // ---------- stato (salvato sul dispositivo) ----------
  const KEY = "mg_scalata_bozza", KEY_SAVED = "mg_scalate";
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* memoria piena o disattivata */ } };
  let draft = Object.assign({ importo: 10, n: 3, target: 2, incasso: 0, steps: null }, load(KEY, {}));
  let saved = load(KEY_SAVED, []);
  let info = "";
  const saveDraft = () => store(KEY, draft);
  const saveAll = () => store(KEY_SAVED, saved);

  // ---------- giocate candidate di una partita ----------
  function options(fx) {
    const pr = fx.est.probs, out = [];
    const add = (mk) => { if (pr[mk] != null && !out.some((o) => o.mk === mk)) out.push({ mk, p: pr[mk], odds: defOdds(fx, mk) }); };
    if (tipOf[fx.id]) add(tipOf[fx.id]);
    SAFE.filter((m) => pr[m] >= 0.72).sort((a, b) => pr[b] - pr[a]).slice(0, 2).forEach(add);
    // Under/Over 2.5 solo se la quota vera del bookmaker è conveniente
    [["O25", "o25"], ["U25", "u25"]].forEach(([m, k]) => { if (fx[k] && pr[m] && pr[m] * fx[k] >= 1.02) add(m); });
    return out.filter((o) => o.odds >= 1.05);
  }
  const mkPick = (fx, o) => ({ fx: fx.id, lg: fx.lg, date: fx.date, time: fx.time || "", home: fx.home, away: fx.away, mk: o.mk, odds: o.odds, p: o.p });

  // La combinazione più probabile che arriva alla quota obiettivo (una giocata per partita).
  function bestCombo(cands, target) {
    const eff = (o) => -Math.log(o.p) / Math.log(o.odds);   // quanta probabilità "costa" ogni punto di quota
    const c = cands.slice().sort((a, b) => eff(a) - eff(b)).slice(0, 12);
    const lo = target * 0.97, hi = target * 1.4;
    let best = null;
    const sel = [];
    const rec = (i, p, q) => {
      if (q >= lo) { if (q <= hi && (!best || p > best.p)) best = { picks: sel.slice(), p, q }; return; }
      if (sel.length >= MAX_EV || (best && p <= best.p)) return;
      for (let j = i; j < c.length; j++) {
        if (sel.some((s) => s.fx === c[j].fx)) continue;
        sel.push(c[j]); rec(j + 1, p * c[j].p, q * c[j].odds); sel.pop();
      }
    };
    rec(0, 1, 1);
    return best;
  }

  // Costruisce fino a n gradini in ordine di orario, scegliendo la catena con la probabilità più alta.
  function plan(n, target, from, exclude) {
    const pool = [];
    D.partite.forEach((fx) => {
      if (!fx.ok || exclude.has(fx.id)) return;
      const t = ko(fx.date, fx.time);
      if (t < from) return;
      options(fx).forEach((o) => pool.push(Object.assign({ fx: fx.id, f: fx, t }, o)));
    });
    const starts = [...new Set(pool.map((o) => o.t))].sort((a, b) => a - b);
    const wins = [];
    for (const s of starts) {
      const cb = bestCombo(pool.filter((o) => o.t >= s && o.t <= s + WIN), target);
      if (!cb) continue;
      const ts = cb.picks.map((o) => o.t);
      wins.push({ start: Math.min(...ts), end: Math.max(...ts) + GAP, lp: Math.log(cb.p), cb });
    }
    wins.sort((a, b) => a.start - b.start);
    // dp[i][k] = catena migliore di k gradini che finisce con il gradino i
    const dp = wins.map(() => []);
    wins.forEach((w, i) => {
      dp[i][1] = { lp: w.lp, prev: -1 };
      for (let j = 0; j < i; j++) {
        if (wins[j].end > w.start) continue;
        for (let k = 1; k < n; k++) {
          const a = dp[j][k];
          if (a && (!dp[i][k + 1] || a.lp + w.lp > dp[i][k + 1].lp)) dp[i][k + 1] = { lp: a.lp + w.lp, prev: j };
        }
      }
    });
    for (let k = n; k >= 1; k--) {
      let bi = -1;
      dp.forEach((r, i) => { if (r[k] && (bi < 0 || r[k].lp > dp[bi][k].lp)) bi = i; });
      if (bi < 0) continue;
      const chain = [];
      for (let i = bi, kk = k; i >= 0; i = dp[i][kk].prev, kk--) chain.unshift(wins[i]);
      return chain.map((w) => ({ picks: w.cb.picks.sort((a, b) => a.t - b.t).map((o) => mkPick(o.f, o)) }));
    }
    return [];
  }

  function regenerate() {
    draft.steps = plan(draft.n, draft.target, Date.now() + 10 * MIN, new Set());
    info = draft.steps.length < draft.n && draft.steps.length
      ? `Con le partite in calendario adesso ci stanno solo ${draft.steps.length} gradini. Dopo il prossimo aggiornamento puoi aggiungere gli altri con "Ricalcola i gradini non iniziati".` : "";
    saveDraft();
  }

  // ---------- conti ----------
  const stepTimes = (st) => {
    const ts = st.picks.map((o) => ko(o.date, o.time));
    return ts.length ? { start: Math.min(...ts), end: Math.max(...ts) + GAP } : null;
  };
  function money(sc) {
    let stake = sc.importo, kept = 0, reach = 1, ev = 0;
    const rows = sc.steps.map((st, i) => {
      const q = st.picks.reduce((a, o) => a * o.odds, 1), p = st.picks.reduce((a, o) => a * o.p, 1);
      const last = i === sc.steps.length - 1;
      const win = stake * q, keep = last ? win : (win * sc.incasso) / 100;
      ev += reach * (1 - p) * kept;          // perdo a questo gradino: mi resta quanto messo da parte
      reach *= p;
      const r = { stake, q, p, win, keep, kept: kept + keep, reach };
      kept += keep; stake = win - keep;
      return r;
    });
    const final = kept;
    ev += reach * final;
    return { rows, final, reach, ev: sc.importo ? ev / sc.importo - 1 : 0 };
  }

  // ---------- esiti per le scalate avviate ----------
  function settle(sc) {
    const now = Date.now();
    let broken = false;
    const st = sc.steps.map((step) => {
      if (broken) return "ANNULLATA";
      let all = true, lost = false, started = false;
      step.picks.forEach((o) => {
        const m = findResult(o);
        if (ko(o.date, o.time) <= now) started = true;
        if (!m) { o.ok = null; all = false; return; }
        o.score = `${m.fh}-${m.fa}` + (m.hh != null ? ` (${m.hh}-${m.ha})` : "");
        o.ok = hit(o.mk, [m.fh, m.fa, m.hh, m.ha]);
        if (!o.ok) lost = true;
      });
      if (lost) { broken = true; return "PERSA"; }
      if (all && step.picks.length) return "VINTA";
      return started ? "IN CORSO" : "DA GIOCARE";
    });
    const lostAt = st.indexOf("PERSA");
    const m = money(sc);
    let label, pay = null;
    if (lostAt >= 0) { label = "PERSA"; pay = lostAt > 0 ? m.rows[lostAt - 1].kept : 0; }
    else if (st.length && st.every((s) => s === "VINTA")) { label = sc.steps.length < sc.n ? "IN CORSO" : "VINTA"; pay = label === "VINTA" ? m.final : null; }
    else label = "IN CORSO";
    return { st, label, pay, m, done: pay != null };
  }

  // ---------- vista ----------
  function ownerOf(o) { return o === "d" ? draft : saved.find((s) => s.id === o); }

  function stepHead(sc, i, r) {
    const st = sc.steps[i], t = stepTimes(st);
    const last = i === sc.steps.length - 1;
    return `<div><b>Gradino ${i + 1}</b> <span class="small muted">${t ? `${fdate(st.picks[0].date, hm(t.start))} → fine verso le ${hm(t.end)}` : ""}</span></div>
      <div class="small">Punti <b>${eur(r.stake)}</b> · quota <b>${q2(r.q)}</b> · vinci <b class="esito-W">${eur(r.win)}</b>
      ${!last && sc.incasso ? ` · metti da parte ${eur(r.keep)}` : ""}</div>
      <div class="small muted">probabilità gradino ${pct(r.p)} · arrivi fin qui vincendo: ${pct(r.reach, 1)}</div>`;
  }

  function warnings(sc, i) {
    const st = sc.steps[i], w = [];
    if (!st.picks.length) return `<div class="small esito-L">⚠ Gradino vuoto: aggiungi almeno una partita.</div>`;
    const q = st.picks.reduce((a, o) => a * o.odds, 1);
    if (q < sc.target * 0.97) w.push(`quota ${q2(q)} sotto l'obiettivo ${q2(sc.target)}`);
    const prev = i > 0 && stepTimes(sc.steps[i - 1]), cur = stepTimes(st);
    if (prev && cur && cur.start < prev.end) w.push("inizia prima che finiscano le partite del gradino precedente");
    return w.length ? `<div class="small" style="color:var(--wait)">⚠ ${w.join(" · ")}</div>` : "";
  }

  function addOptions(sc, i) {
    const used = new Set(sc.steps.flatMap((s) => s.picks.map((o) => o.fx)));
    const prev = i > 0 && stepTimes(sc.steps[i - 1]), next = i < sc.steps.length - 1 && stepTimes(sc.steps[i + 1]);
    const from = Math.max(Date.now(), prev ? prev.end : 0), to = next ? next.start - GAP : Infinity;
    return D.partite.filter((fx) => fx.ok && !used.has(fx.id))
      .map((fx) => ({ fx, t: ko(fx.date, fx.time) })).filter((x) => x.t >= from && x.t <= to)
      .sort((a, b) => a.t - b.t)
      .map(({ fx }) => {
        const o = options(fx)[0];
        return `<option value="${fx.id}">${esc(fdate(fx.date, fx.time))} · ${esc(fx.home)} – ${esc(fx.away)}${o ? ` · ${esc(MK[o.mk])} ${pct(o.p)}` : ""}</option>`;
      }).join("");
  }

  function pickHtml(owner, i, j, o, editable) {
    const fx = FX[o.fx];
    const cls = o.ok === true ? "esito-W" : o.ok === false ? "esito-L" : "";
    let mkPart = `<span class="${cls}">${esc(MK[o.mk] || o.mk)}</span>`;
    if (editable && fx) {
      const mks = Object.keys(MK).filter((m) => fx.est.probs[m] != null).sort((a, b) => fx.est.probs[b] - fx.est.probs[a]);
      mkPart = `<select data-sc-mk="${owner}|${i}|${j}" style="padding:4px 6px;font-size:13px;max-width:190px">${mks.map((m) => `<option value="${m}" ${m === o.mk ? "selected" : ""}>${esc(MK[m])} ${pct(fx.est.probs[m])}${tipOf[fx.id] === m ? " ★" : ""}</option>`).join("")}</select>`;
    }
    const oddsPart = editable
      ? `<input class="odds" type="number" step="0.01" min="1.01" inputmode="decimal" value="${o.odds}" data-sc-odds="${owner}|${i}|${j}"><button class="x" data-sc-rm="${owner}|${i}|${j}" title="Togli">✕</button>`
      : `@ <b>${q2(o.odds)}</b>`;
    return `<div class="pick" style="grid-template-columns:minmax(0,1fr)">
      <div><span class="m">${esc(o.home)} – ${esc(o.away)}</span>${editable ? startedTag(o) : ""} <span class="small muted">${esc(lgName(o.lg))} · ${fdate(o.date, o.time)}${o.score ? ` · <b class="${cls}">${esc(o.score)}</b>` : MG.liveTag ? MG.liveTag(o, [o.mk]) : ""}</span></div>
      <div class="optrow"><span>${mkPart} <span class="small muted">${pct(o.p)}</span></span><span>${oddsPart}</span></div></div>`;
  }

  function stepsHtml(owner, sc, m, status) {
    return sc.steps.map((st, i) => {
      const s = status ? status[i] : null;
      const editable = !status || s === "DA GIOCARE";
      const opts = editable ? addOptions(sc, i) : "";
      return `<div class="card" style="border-left:4px solid ${s === "VINTA" ? "var(--win)" : s === "PERSA" ? "var(--lose)" : s === "ANNULLATA" ? "var(--nob)" : "var(--brand2)"}">
        ${s ? `<div style="float:right">${s === "DA GIOCARE" ? '<span class="small muted">da giocare</span>' : badge(s)}</div>` : ""}
        <div id="sc-h-${owner}-${i}">${stepHead(sc, i, m.rows[i])}</div>
        <div id="sc-w-${owner}-${i}">${editable ? warnings(sc, i) : ""}</div>
        ${st.picks.map((o, j) => pickHtml(owner, i, j, o, editable)).join("")}
        ${editable ? `<div class="row" style="margin:8px 0 0">
          ${opts ? `<select data-sc-add="${owner}|${i}" style="padding:5px 8px;font-size:13px;max-width:100%"><option value="">+ aggiungi partita…</option>${opts}</select>` : ""}
          <button class="btn" style="background:var(--nob);padding:5px 10px;font-size:13px" data-sc-rmstep="${owner}|${i}">Togli gradino</button></div>` : ""}
      </div>`;
    }).join("");
  }

  function summaryHtml(sc, m) {
    return `<div class="grid2">
      <div class="kpi"><div class="v">${eur(sc.importo)}</div><div class="l">puntata iniziale</div></div>
      <div class="kpi"><div class="v esito-W">${eur(m.final)}</div><div class="l">se vinci tutti i ${sc.steps.length} gradini</div></div>
      <div class="kpi"><div class="v">${pct(m.reach, 1)}</div><div class="l">probabilità di arrivare in cima</div></div>
      <div class="kpi"><div class="v ${m.ev >= 0 ? "esito-W" : "esito-L"}">${m.ev >= 0 ? "+" : ""}${pct(m.ev, 1)}</div><div class="l">resa media con queste quote</div></div>
    </div>`;
  }

  function view() {
    const now = Date.now();
    if (!draft.steps || draft.steps.some((st) => st.picks.some((o) => ko(o.date, o.time) < now))) regenerate();
    const m = money(draft);
    const chip = (attr, v, label, on) => `<button class="chip ${on ? "on" : ""}" data-${attr}="${v}">${label}</button>`;
    const nChips = [2, 3, 4, 5, 6, 7, 8].map((k) => chip("sc-n", k, k, k === +draft.n)).join("");
    const tChips = [1.5, 1.8, 2, 2.5, 3].map((t) => chip("sc-t", t, q2(t), t === +draft.target)).join("");
    const iChips = [[0, "No, rigioco tutto"], [25, "25%"], [50, "50%"]].map(([v, l]) => chip("sc-inc", v, l, v === +draft.incasso)).join("");

    const body = draft.steps.length
      ? `<div class="card" style="border:2px solid var(--brand2)">
          <h3>🪜 La tua scalata · ${draft.steps.length} gradini</h3>
          <div id="sc-sum-d">${summaryHtml(draft, m)}</div>
          <div class="small muted" style="margin-top:6px">Le caselle gialle hanno la quota <b>minima</b> consigliata: scrivi quella vera del tuo bookmaker. Le puntate dei gradini dopo si aggiornano da sole. La resa media con le quote minime esce sempre positiva: diventa affidabile solo dopo che scrivi le quote vere.</div>
        </div>
        ${info ? `<div class="note">${esc(info)}</div>` : ""}
        ${stepsHtml("d", draft, m, null)}
        <div class="row" style="margin-top:4px">
          <button class="btn" data-sc-act="start">▶ Avvia scalata</button>
          <button class="btn" style="background:var(--nob)" data-sc-act="regen">🔄 Rifai la proposta</button>
        </div>`
      : `<div class="empty">Non ci sono abbastanza partite in calendario per arrivare a quota ${q2(draft.target)}. Prova una quota più bassa o aspetta il prossimo aggiornamento.</div>`;

    return `<div class="note"><b>Scalata</b>: giochi una bolletta a quota ~${q2(draft.target)}, se vinci rigiochi la vincita sul gradino successivo, e così via. I gradini vanno in ordine di orario: il successivo parte solo quando le partite del precedente sono finite (anche più gradini nello stesso giorno). Se un gradino va perso la scalata finisce. È un calcolo statistico: non garantisce la vincita.</div>
      <div class="card">
        <div class="row"><label class="small muted" style="min-width:110px">Importo iniziale (€)</label><input id="scImp" type="number" min="1" step="1" inputmode="decimal" value="${esc(draft.importo)}"></div>
        <div class="small muted">Numero di gradini</div><div class="chips" style="margin-top:4px">${nChips}</div>
        <div class="small muted">Quota obiettivo per gradino</div><div class="chips" style="margin-top:4px">${tChips}</div>
        <div class="small muted">Metti da parte una parte della vincita a ogni gradino?</div><div class="chips" style="margin:4px 0 0">${iChips}</div>
      </div>
      ${body}
      ${savedHtml()}`;
  }

  function savedHtml() {
    if (!saved.length) return "";
    let giocato = 0, vinto = 0;
    const rows = saved.slice().reverse().map((sc) => {
      const s = settle(sc);
      if (s.done) { giocato += sc.importo; vinto += s.pay; }
      const won = s.st.filter((x) => x === "VINTA").length;
      const canRegen = s.label === "IN CORSO";
      return `<details class="card" ${s.label === "IN CORSO" ? "open" : ""}><summary>${badge(s.label)} <b>Scalata ${eur(sc.importo)} · ${won}/${sc.n} gradini vinti</b>
        <div class="small muted">avviata ${fdate(sc.created)} · quota ~${q2(sc.target)} a gradino${s.done ? ` · incasso ${eur(s.pay)} · utile <b class="${s.pay - sc.importo >= 0 ? "esito-W" : "esito-L"}">${eur(s.pay - sc.importo)}</b>` : ` · se arrivi in cima ${eur(s.m.final)}`}</div></summary>
        <div style="margin-top:8px">${stepsHtml(sc.id, sc, s.m, s.st)}</div>
        ${sc.steps.length < sc.n && canRegen ? `<div class="small muted">${sc.n - sc.steps.length === 1 ? "Manca 1 gradino: aggiungilo" : `Mancano ${sc.n - sc.steps.length} gradini: aggiungili`} quando ci sono nuove partite in calendario.</div>` : ""}
        <div class="row" style="margin-top:8px">
          ${canRegen ? `<button class="btn" data-sc-regen="${esc(sc.id)}">🔄 Ricalcola i gradini non iniziati</button>` : ""}
          <button class="btn" style="background:var(--lose)" data-sc-del="${esc(sc.id)}">Elimina</button></div>
      </details>`;
    }).join("");
    return `<h2>Le mie scalate</h2>
      <div class="grid2"><div class="kpi"><div class="v">${eur(giocato)}</div><div class="l">giocato (scalate concluse)</div></div>
      <div class="kpi"><div class="v">${eur(vinto)}</div><div class="l">incassato</div></div>
      <div class="kpi"><div class="v ${vinto - giocato >= 0 ? "esito-W" : "esito-L"}">${eur(vinto - giocato)}</div><div class="l">saldo</div></div></div>
      <div class="small muted" style="margin:6px 4px">Le scalate restano su questo dispositivo e si controllano da sole quando arrivano i risultati.</div>
      ${rows}`;
  }

  // Rifà i gradini non ancora iniziati di una scalata avviata, tenendo quelli già giocati.
  function regenSaved(sc) {
    const s = settle(sc);
    const keep = sc.steps.filter((_, i) => s.st[i] !== "DA GIOCARE");
    const lastEnd = keep.length ? stepTimes(keep[keep.length - 1]).end : 0;
    const used = new Set(keep.flatMap((st) => st.picks.map((o) => o.fx)));
    const more = plan(sc.n - keep.length, sc.target, Math.max(Date.now() + 10 * MIN, lastEnd), used);
    sc.steps = keep.concat(more);
    if (keep.length + more.length < sc.n) alert(`Per ora ci stanno ${keep.length + more.length} gradini su ${sc.n}.`);
  }

  // ---------- eventi ----------
  MG.views.scalata = view;
  const main = document.getElementById("main");
  const persistOwner = (o) => (o === "d" ? saveDraft() : saveAll());

  main.addEventListener("click", (ev) => {
    if (MG.state.tab !== "scalata") return;
    const t = ev.target.closest("[data-sc-n],[data-sc-t],[data-sc-inc],[data-sc-act],[data-sc-rm],[data-sc-rmstep],[data-sc-del],[data-sc-regen]");
    if (!t) return;
    const d = t.dataset;
    if (d.scN) { draft.n = +d.scN; regenerate(); }
    else if (d.scT) { draft.target = +d.scT; regenerate(); }
    else if (d.scInc != null) { draft.incasso = +d.scInc; saveDraft(); }
    else if (d.scAct === "regen") regenerate();
    else if (d.scAct === "start") {
      if (draft.steps.some((st) => !st.picks.length)) { alert("C'è un gradino vuoto: aggiungi una partita o toglilo."); return; }
      if (!confirm(`Avviare la scalata da ${eur(draft.importo)} con ${draft.steps.length} gradini?\nRicordati di scrivere prima le quote vere del tuo bookmaker.`)) return;
      saved.push({ id: Date.now().toString(36), created: D.oggi, importo: draft.importo, n: draft.n, target: draft.target, incasso: draft.incasso,
        steps: JSON.parse(JSON.stringify(draft.steps)) });
      saveAll(); draft.steps = null; saveDraft();
    } else if (d.scRm) {
      const [o, i, j] = d.scRm.split("|"), sc = ownerOf(o);
      if (sc) { sc.steps[+i].picks.splice(+j, 1); persistOwner(o); }
    } else if (d.scRmstep) {
      const [o, i] = d.scRmstep.split("|"), sc = ownerOf(o);
      if (sc) { sc.steps.splice(+i, 1); if (o !== "d") sc.n = Math.max(sc.steps.length, 1); persistOwner(o); }
    } else if (d.scDel) {
      if (!confirm("Eliminare questa scalata?")) return;
      saved = saved.filter((s) => s.id !== d.scDel); saveAll();
    } else if (d.scRegen) {
      const sc = ownerOf(d.scRegen);
      if (sc) { regenSaved(sc); saveAll(); }
    }
    MG.render();
  });

  main.addEventListener("change", (ev) => {
    if (MG.state.tab !== "scalata") return;
    const t = ev.target, d = t.dataset;
    if (t.id === "scImp") { draft.importo = Math.max(1, num(t.value) || 10); saveDraft(); MG.render(); return; }
    if (d.scAdd && t.value) {
      const [o, i] = d.scAdd.split("|"), sc = ownerOf(o), fx = FX[t.value];
      if (sc && fx) {
        const op = options(fx)[0] || (() => { const mk = Object.keys(MK).filter((m) => fx.est.probs[m] != null).sort((a, b) => fx.est.probs[b] - fx.est.probs[a])[0]; return { mk, p: fx.est.probs[mk], odds: defOdds(fx, mk) }; })();
        const st = sc.steps[+i];
        st.picks.push(mkPick(fx, op));
        st.picks.sort((a, b) => ko(a.date, a.time) - ko(b.date, b.time));
        persistOwner(o);
      }
      MG.render(); return;
    }
    if (d.scMk) {
      const [o, i, j] = d.scMk.split("|"), sc = ownerOf(o), pk = sc && sc.steps[+i].picks[+j], fx = pk && FX[pk.fx];
      if (fx) { pk.mk = t.value; pk.p = fx.est.probs[t.value]; pk.odds = defOdds(fx, t.value); persistOwner(o); }
      MG.render(); return;
    }
    if (d.scOdds) {
      const [o, i, j] = d.scOdds.split("|"), sc = ownerOf(o), v = num(t.value);
      if (sc && v > 1) { sc.steps[+i].picks[+j].odds = v; persistOwner(o); }
      refresh(o);
    }
  });

  // aggiorna solo le cifre, così il cursore resta nella casella che stai scrivendo
  function refresh(o) {
    const sc = ownerOf(o); if (!sc) return MG.render();
    const m = money(sc);
    sc.steps.forEach((_, i) => {
      const h = document.getElementById(`sc-h-${o}-${i}`), w = document.getElementById(`sc-w-${o}-${i}`);
      if (h) h.innerHTML = stepHead(sc, i, m.rows[i]);
      if (w) w.innerHTML = warnings(sc, i);
    });
    const sum = document.getElementById(`sc-sum-${o}`);
    if (sum) sum.innerHTML = summaryHtml(sc, m);
  }
})();
