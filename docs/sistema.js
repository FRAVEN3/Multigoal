/* Scheda "Sistema": scegli partite e giocate (anche di categorie diverse) e calcola il sistema. */
(function () {
  "use strict";
  const MG = window.MG;
  if (!MG || !MG.D) return;
  const { D, esc, pct, q2, eur, lgName, fdate, badge, started, startedTag } = MG;
  const MK = D.mercati;
  const margin = D.config.bollette.margine_valore;
  const FX = Object.fromEntries(D.partite.map((f) => [f.id, f]));
  const tipOf = Object.fromEntries(D.consigli.map((t) => [t.fx, t.markets[0]]));

  // ---------- esito di un mercato su un risultato [gol casa, gol ospite, casa 1°T, ospite 1°T] ----------
  const TEMPI = new Set(["BAT", "RAD", "GGGG", "GGNG", "NGGG"]);
  function hit(mk, r) {
    const [fh, fa, hh, ha] = r, t = fh + fa;
    if (/^RS\d\d$/.test(mk)) return fh === +mk[2] && fa === +mk[3];   // risultato esatto singolo, es. RS10 = 1-0
    if (TEMPI.has(mk) && (hh == null || ha == null)) return false;
    const s1 = hh > 0 && ha > 0, s2 = fh - hh > 0 && fa - ha > 0;
    switch (mk) {
      case "MG12": return t >= 1 && t <= 2;
      case "MG13": return t >= 1 && t <= 3;
      case "MG14": return t >= 1 && t <= 4;
      case "MG23": return t >= 2 && t <= 3;
      case "MG24": return t >= 2 && t <= 4;
      case "MG25": return t >= 2 && t <= 5;
      case "MG35": return t >= 3 && t <= 5;
      case "MG45": return t >= 4 && t <= 5;
      case "O15": return t >= 2;
      case "O25": return t >= 3;
      case "U25": return t <= 2;
      case "U35": return t <= 3;
      case "GG": return fh > 0 && fa > 0;
      case "NG": return !(fh > 0 && fa > 0);
      case "BAT": return s1 || s2;
      case "RAD": return !s1 && !s2;
      case "GGGG": return s1 && s2;
      case "GGNG": return s1 && !s2;
      case "NGGG": return !s1 && s2;
      case "RE_C": return [[1, 0], [2, 0], [2, 1]].some(([a, b]) => fh === a && fa === b);
      case "RE_O": return [[0, 1], [0, 2], [1, 2]].some(([a, b]) => fh === a && fa === b);
      case "RE_X": return [[0, 0], [1, 1], [2, 2]].some(([a, b]) => fh === a && fa === b);
    }
    return false;
  }

  // ---------- stato (salvato sul telefono) ----------
  const KEY = "mg_sistema_bozza", KEY_SAVED = "mg_sistemi_salvati";
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* memoria piena o disattivata */ } };
  let draft = load(KEY, { sel: {}, sizes: [], total: 10 });
  for (const id of Object.keys(draft.sel)) if (!FX[id]) delete draft.sel[id];   // partite non più in calendario
  let saved = load(KEY_SAVED, []);
  let openGroup = "Consigliate Multigol";
  const save = () => store(KEY, draft);

  const defOdds = (fx, mk) => {
    if (mk === "O25" && fx.o25) return fx.o25;
    if (mk === "U25" && fx.u25) return fx.u25;
    const p = fx.est.probs[mk];
    return p ? Math.max(1.01, Math.round((margin / p) * 100) / 100) : 2;
  };
  function toggle(fxId, mk) {
    const fx = FX[fxId]; if (!fx) return;
    const s = (draft.sel[fxId] = draft.sel[fxId] || {});
    if (mk in s) delete s[mk]; else s[mk] = defOdds(fx, mk);
    if (!Object.keys(s).length) delete draft.sel[fxId];
    draft.sizes = draft.sizes.filter((k) => k <= Object.keys(draft.sel).length);
    save();
  }

  // ---------- matematica del sistema ----------
  // e_k(v) = somma, su tutti i gruppi di k partite, del prodotto dei valori: dà colonne e vincite di un sistema a correzione.
  function elem(v) {
    const e = new Array(v.length + 1).fill(0); e[0] = 1;
    for (const x of v) for (let k = e.length - 1; k >= 1; k--) e[k] += e[k - 1] * x;
    return e;
  }
  function items() {
    return Object.entries(draft.sel).map(([id, opts]) => ({ fx: FX[id], opts: Object.entries(opts).map(([mk, odds]) => ({ mk, odds: Number(odds) || 1 })) }));
  }
  const sizesOf = (n) => (draft.sizes.length ? draft.sizes : [n]);

  // Risultati possibili di una partita (dalle partite delle due squadre, metà peso ciascuna),
  // ripesati in modo che ogni giocata abbia la percentuale corretta e non quella ottimista dell'Excel.
  function pool(it) {
    const h = it.fx.sample_h || [], a = it.fx.sample_a || [];
    const rows = [];
    const add = (list, w) => list.forEach((r) => rows.push({ hits: it.opts.map((o) => hit(o.mk, r)), w }));
    // con i risultati esatti le poche partite di riferimento non bastano (un 3-1 potrebbe non esserci mai):
    // uso la tabella dei risultati del modello, se non ci sono giocate sui tempi
    const re = it.fx.re && it.opts.some((o) => /^RS/.test(o.mk)) && !it.opts.some((o) => TEMPI.has(o.mk));
    if (re) {
      it.fx.re.m.forEach((row, hg) => row.forEach((p, ag) => rows.push({ hits: it.opts.map((o) => hit(o.mk, [hg, ag, null, null])), w: p })));
      const rest = 1 - rows.reduce((s, r) => s + r.w, 0);
      if (rest > 0) rows.push({ hits: it.opts.map(() => false), w: rest });   // risultati oltre 5-5
    } else if (h.length && a.length) { add(h, 0.5 / h.length); add(a, 0.5 / a.length); }
    else add(h.length ? h : a, 1 / Math.max(1, h.length + a.length));
    for (let iter = 0; iter < 20; iter++) {
      it.opts.forEach((o, j) => {
        const target = it.fx.est.probs[o.mk];
        if (target == null) return;
        const tot = rows.reduce((s, r) => s + r.w, 0);
        const cur = rows.reduce((s, r) => s + (r.hits[j] ? r.w : 0), 0) / tot;
        if (cur <= 0 || cur >= 1) return;
        rows.forEach((r) => (r.w *= r.hits[j] ? target / cur : (1 - target) / (1 - cur)));
      });
    }
    const tot = rows.reduce((s, r) => s + r.w, 0);
    let c = 0;
    return rows.map((r) => ({ v: it.opts.reduce((s, o, j) => s + (r.hits[j] ? o.odds : 0), 0), c: (c += r.w / tot) }));
  }
  function draw(p) {
    if (!p.length) return 0;
    const x = Math.random();
    for (const r of p) if (x <= r.c) return r.v;
    return p[p.length - 1].v;
  }

  function compute(its, sizesArg, totalArg, nSim) {
    const n = its.length, sizes = sizesArg || sizesOf(n);
    const eC = elem(its.map((it) => it.opts.length));
    const cols = sizes.reduce((a, k) => a + eC[k], 0);
    const total = Number(totalArg ?? draft.total) || 0, per = cols ? total / cols : 0;
    // vincita della colonna più bassa e di quella più alta (se esce solo quella)
    let minCol = Infinity, maxAll;
    const kmin = Math.min(...sizes);
    const sortedMin = its.map((it) => Math.min(...it.opts.map((o) => o.odds))).sort((a, b) => a - b);
    minCol = sortedMin.slice(0, kmin).reduce((a, b) => a * b, 1) * per;
    maxAll = sizes.reduce((a, k) => a + elem(its.map((it) => it.opts.reduce((s, o) => s + o.odds, 0)))[k], 0) * per;
    // simulazione: per ogni partita estraggo un risultato dalle partite di riferimento delle due squadre
    const N = nSim || 20000;
    const pools = its.map(pool);
    let any = 0, prof = 0, sum = 0, best = 0, sumProf = 0;
    for (let i = 0; i < N; i++) {
      const v = pools.map(draw);
      const e = elem(v);
      const pay = sizes.reduce((s, k) => s + e[k], 0) * per;
      if (pay > 0) any++;
      if (pay >= total) { prof++; sumProf += pay; }
      if (pay > best) best = pay;
      sum += pay;
    }
    return { n, sizes, cols, per, total, minCol, maxAll, pAny: any / N, pProf: prof / N, ev: total ? sum / N / total - 1 : 0, best,
      avgProf: prof ? sumProf / prof : 0 };
  }

  function columns(its, sizes, per, limit) {
    const out = [];
    const rec = (i, chosen, k) => {
      if (out.length >= limit) return;
      if (chosen.length === k) { out.push(chosen.slice()); return; }
      if (i >= its.length || its.length - i < k - chosen.length) return;
      for (const o of its[i].opts) { chosen.push([its[i], o]); rec(i + 1, chosen, k); chosen.pop(); }
      rec(i + 1, chosen, k);
    };
    for (const k of sizes) rec(0, [], k);
    return out.map((c) => { const q = c.reduce((a, [, o]) => a * o.odds, 1); return { c, q, win: q * per }; });
  }

  // ---------- scelta partite ----------
  const SUGG = {
    MULTIGOL: ["MG12", "MG13", "MG14", "MG23", "MG24", "MG25", "MG35", "U35", "O15"],
    BATISTUTA: ["GGGG", "GGNG", "NGGG", "GG", "O25", "O15", "MG24", "MG25"],
    RADUCIOIU: ["U25", "U35", "RAD", "NG", "RE_X", "RE_C", "RE_O", "MG13", "MG12"],
    "NO BET": ["MG13", "MG14", "MG24", "U35", "O15", "GG", "NG"],
  };
  function groupOf(fx) {
    if (fx.est.metodo === "BATISTUTA") return "Batistuta";
    if (fx.est.metodo === "RADUCIOIU") return "Raducioiu";
    if (tipOf[fx.id]) return "Consigliate Multigol";
    return "Altre partite";
  }
  function fxCard(fx) {
    const e = fx.est, s = draft.sel[fx.id] || {};
    const base = [...new Set([tipOf[fx.id], ...(SUGG[e.metodo] || SUGG["NO BET"])].filter((m) => m && e.probs[m] != null))];
    const extra = Object.keys(MK).filter((m) => e.probs[m] != null && !base.includes(m));
    const chip = (m) => `<button class="chip ${m in s ? "on" : ""}" data-tg="${fx.id}|${m}">${esc(MK[m].replace(/ \((Batistuta|Raducioiu)\)/, ""))} <b>${pct(e.probs[m])}</b>${tipOf[fx.id] === m ? " ★" : ""}</button>`;
    const batAll = ["GGGG", "GGNG", "NGGG"].every((m) => e.probs[m] != null)
      ? `<button class="chip" data-bat="${fx.id}">+ Batistuta: tutte e 3 le combinazioni</button>` : "";
    const added = extra.filter((m) => m in s);
    return `<div class="card ${Object.keys(s).length ? "selcard" : ""}${started(fx) ? " gone" : ""}">
      <div><b>${esc(fx.home)} – ${esc(fx.away)}</b>${startedTag(fx)}</div>
      <div class="small muted" style="margin-bottom:6px">${esc(lgName(fx.lg))} · ${fdate(fx.date, fx.time)} · ${badge(e.metodo, fx)}${e.M != null ? " " + pct(e.M) : ""}</div>
      <div class="chips" style="margin:0">${base.map(chip).join("")}${added.map(chip).join("")}${batAll}
        <select data-add="${fx.id}" style="padding:5px 8px;font-size:13px"><option value="">+ altro mercato…</option>${extra.filter((m) => !(m in s)).map((m) => `<option value="${m}">${esc(MK[m])} ${pct(e.probs[m])}</option>`).join("")}</select>
      </div></div>`;
  }

  // ---------- vista ----------
  function view() {
    const its = items();
    const groups = {};
    // le partite già iniziate vanno in fondo
    D.partite.filter((f) => f.ok).sort((a, b) => started(a) - started(b)).forEach((f) => (groups[groupOf(f)] = groups[groupOf(f)] || []).push(f));
    const order = ["Consigliate Multigol", "Batistuta", "Raducioiu", "Altre partite"].filter((g) => groups[g]);
    return `${builder(its)}
      <h2>Scegli le partite</h2>
      <div class="small muted" style="margin:-4px 4px 8px">Tocca una giocata per aggiungerla. Puoi metterne più di una sulla stessa partita (diventano combinazioni del sistema) e mescolare le categorie. ★ = consiglio Multigol.</div>
      <div class="chips">${order.map((g) => `<button class="chip ${g === openGroup ? "on" : ""}" data-grp="${esc(g)}">${esc(g)} (${groups[g].length})</button>`).join("")}</div>
      ${(groups[openGroup] || []).map(fxCard).join("") || `<div class="empty">Nessuna partita in questa categoria.</div>`}
      ${savedHtml()}`;
  }

  function builder(its) {
    if (!its.length) return `<div class="note">Il tuo sistema è vuoto: scegli le giocate qui sotto, oppure in <b>Bollette</b> premi "Apri come sistema".</div>`;
    const n = its.length, eC = elem(its.map((it) => it.opts.length));
    const sizeChips = Array.from({ length: n }, (_, i) => i + 1).map((k) => {
      const on = draft.sizes.length ? draft.sizes.includes(k) : k === n;
      return `<button class="chip ${on ? "on" : ""}" data-size="${k}">${k === n ? `Integrale (${k} su ${n})` : `${k} su ${n}`} · ${eC[k]} col.</button>`;
    }).join("");
    return `<div class="card" style="border:2px solid var(--brand2)">
      <h3>Il tuo sistema · ${n} partite</h3>
      ${its.map((it) => `<div class="pick" style="grid-template-columns:minmax(0,1fr)">
        <div><span class="m">${esc(it.fx.home)} – ${esc(it.fx.away)}</span>${startedTag(it.fx)} <span class="small muted">${fdate(it.fx.date, it.fx.time)}</span></div>
        ${it.opts.map((o) => `<div class="optrow"><span>${esc(MK[o.mk])} <span class="small muted">${pct(it.fx.est.probs[o.mk])}</span></span>
          <span><input class="odds" type="number" step="0.01" min="1.01" inputmode="decimal" value="${o.odds}" data-odds="${it.fx.id}|${o.mk}">
          <button class="x" data-tg="${it.fx.id}|${o.mk}" title="Togli">✕</button></span></div>`).join("")}
      </div>`).join("")}
      <div class="small muted" style="margin:6px 0">Le caselle gialle sono già riempite con la quota minima consigliata: <b>scrivi la quota vera del tuo bookmaker</b>.</div>
      <div class="small muted">Tipo di sistema (puoi sceglierne più di uno):</div>
      <div class="chips" style="margin-top:4px">${sizeChips}</div>
      <div class="row"><label class="small muted">Importo totale (€)</label><input id="sisTot" type="number" step="0.5" min="0" inputmode="decimal" value="${draft.total}"></div>
      <div id="sisRes">${resultsHtml(its)}</div>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="save">Salva sistema</button><button class="btn" style="background:var(--nob)" data-act="clear">Svuota</button></div>
    </div>`;
  }

  function resultsHtml(its) {
    const r = compute(its);
    const cols = columns(its, r.sizes, r.per, 300);
    return `<div class="grid2">
        <div class="kpi"><div class="v">${r.cols}</div><div class="l">colonne da ${eur(r.per)}</div></div>
        <div class="kpi"><div class="v">${eur(r.minCol)}</div><div class="l">vincita minima (esce solo la colonna più bassa)</div></div>
        <div class="kpi"><div class="v">${eur(r.maxAll)}</div><div class="l">vincita massima teorica</div></div>
        <div class="kpi"><div class="v">${pct(r.pAny)}</div><div class="l">probabilità di vincere qualcosa</div></div>
        <div class="kpi"><div class="v">${pct(r.pProf)}</div><div class="l">probabilità di rientrare o guadagnare</div></div>
        <div class="kpi"><div class="v ${r.ev >= 0 ? "esito-W" : "esito-L"}">${r.ev >= 0 ? "+" : ""}${pct(r.ev, 1)}</div><div class="l">resa media stimata</div></div>
      </div>
      <div class="small muted" style="margin-top:6px">Calcolato simulando 20.000 volte le partite, con le percentuali corrette sullo storico e <b>con le quote che hai scritto</b>: se metti quote più basse di quella minima, la resa diventa negativa.
      ${r.minCol < r.total ? `<br><b>Attenzione:</b> se esce una sola colonna, la vincita (${eur(r.minCol)}) è più bassa dell'importo giocato.` : ""}</div>
      <details style="margin-top:8px"><summary class="small"><b>Vedi le colonne</b>${r.cols > cols.length ? ` (prime ${cols.length} di ${r.cols})` : ""}</summary>
        <div class="tw" style="margin-top:6px"><table><tr><th>#</th><th>Giocate</th><th>Quota</th><th>Vincita</th></tr>
        ${cols.map((c, i) => `<tr><td>${i + 1}</td><td style="text-align:left;white-space:normal">${c.c.map(([it, o]) => `${esc(it.fx.home)}: ${esc(MK[o.mk])}`).join("<br>")}</td><td>${q2(c.q)}</td><td>${eur(c.win)}</td></tr>`).join("")}
        </table></div></details>`;
  }

  // ---------- sistemi salvati: controllo automatico con i risultati ----------
  function findResult(p) {
    const d0 = new Date(p.date + "T12:00:00");
    let best = null;
    for (const m of D.risultati || []) {
      if (m.lg !== p.lg || m.home !== p.home || m.away !== p.away) continue;
      const dd = Math.abs(new Date(m.date + "T12:00:00") - d0) / 864e5;
      if (dd <= 4 && (!best || dd < best[0])) best = [dd, m];
    }
    return best && best[1];
  }
  function settle(sv) {
    let played = 0;
    const v = sv.items.map((it) => {
      const m = findResult(it);
      if (!m) return null;
      played++;
      const r = [m.fh, m.fa, m.hh, m.ha];
      it.score = `${m.fh}-${m.fa}` + (m.hh != null ? ` (${m.hh}-${m.ha})` : "");
      it.opts.forEach((o) => (o.ok = hit(o.mk, r)));
      return it.opts.reduce((s, o) => s + (o.ok ? o.odds : 0), 0);
    });
    const n = v.length;
    if (played === n) {
      const e = elem(v), pay = sv.sizes.reduce((s, k) => s + e[k], 0) * sv.per;
      return { done: true, pay, label: pay > 0 ? "VINTA" : "PERSA" };
    }
    const zeros = v.filter((x) => x === 0).length;
    if (n - zeros < Math.min(...sv.sizes)) return { done: true, pay: 0, label: "PERSA" };
    return { done: false, label: `IN CORSO (${played}/${n})` };
  }
  function savedHtml() {
    if (!saved.length) return "";
    let giocato = 0, vinto = 0;
    const rows = saved.slice().reverse().map((sv) => {
      const st = settle(sv);
      if (st.done) { giocato += sv.total; vinto += st.pay; }
      return `<details class="card"><summary>${badge(st.label.startsWith("IN") ? "IN CORSO" : st.label)} <b>${sv.items.length} partite · ${sv.cols} colonne · ${eur(sv.total)}</b>
        <div class="small muted">salvato ${fdate(sv.created)}${st.done ? ` · vincita ${eur(st.pay)} · utile <b class="${st.pay - sv.total >= 0 ? "esito-W" : "esito-L"}">${eur(st.pay - sv.total)}</b>` : " · " + esc(st.label)}</div></summary>
        ${sv.items.map((it) => `<div class="pick" style="grid-template-columns:minmax(0,1fr) auto"><div><span class="m">${esc(it.home)} – ${esc(it.away)}</span><div class="small muted">${fdate(it.date)}${it.score ? " · " + esc(it.score) : ""}</div></div>
          <div class="r">${it.opts.map((o) => `<div class="${o.ok === true ? "esito-W" : o.ok === false ? "esito-L" : ""}">${esc(MK[o.mk])} @ ${q2(o.odds)}</div>`).join("")}</div></div>`).join("")}
        <div class="small muted">Tipo: ${sv.sizes.map((k) => `${k} su ${sv.items.length}`).join(", ")} · colonne da ${eur(sv.per)}</div>
        <button class="btn" style="background:var(--lose);margin-top:8px" data-del="${esc(sv.id)}">Elimina</button></details>`;
    }).join("");
    return `<h2>I miei sistemi</h2>
      <div class="grid2"><div class="kpi"><div class="v">${eur(giocato)}</div><div class="l">giocato (sistemi conclusi)</div></div>
      <div class="kpi"><div class="v">${eur(vinto)}</div><div class="l">vinto</div></div>
      <div class="kpi"><div class="v ${vinto - giocato >= 0 ? "esito-W" : "esito-L"}">${eur(vinto - giocato)}</div><div class="l">saldo</div></div></div>
      <div class="small muted" style="margin:6px 4px">I sistemi salvati restano su questo dispositivo e si controllano da soli quando arrivano i risultati.</div>
      ${rows}`;
  }

  // ---------- eventi ----------
  MG.views.sistema = view;
  MG.sis = { FX, MK, compute, columns, elem, defOdds, hit, findResult, saveSystem: (its, r) => { saved.push(packSaved(its, r)); store(KEY_SAVED, saved); },
    openInBuilder(its, sizes, total) {
      draft = { sel: {}, sizes: sizes.length === 1 && sizes[0] === its.length ? [] : sizes, total };
      its.forEach((it) => { draft.sel[it.fx.id] = Object.fromEntries(it.opts.map((o) => [o.mk, o.odds])); });
      save(); MG.goTab("sistema");
    } };
  const main = document.getElementById("main");
  main.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-tg],[data-bat],[data-grp],[data-size],[data-act],[data-del],[data-slip]");
    if (!t) return;
    const ds = t.dataset;
    if (ds.slip) { fromSlip(ds.slip); return; }
    if (ds.tg) { const [id, mk] = ds.tg.split("|"); toggle(id, mk); }
    else if (ds.bat) { ["GGGG", "GGNG", "NGGG"].forEach((m) => { if (!(draft.sel[ds.bat] || {})[m]) toggle(ds.bat, m); }); }
    else if (ds.grp) openGroup = ds.grp;
    else if (ds.size) {
      const k = +ds.size, n = Object.keys(draft.sel).length;
      let s = draft.sizes.length ? draft.sizes.slice() : [n];
      s = s.includes(k) ? s.filter((x) => x !== k) : [...s, k].sort((a, b) => a - b);
      draft.sizes = s.length === 1 && s[0] === n ? [] : s;
      if (!s.length) draft.sizes = [];
      save();
    } else if (ds.act === "clear") { draft = { sel: {}, sizes: [], total: draft.total }; save(); }
    else if (ds.act === "save") {
      const its = items();
      saved.push(packSaved(its, compute(its, null, null, 2000)));
      store(KEY_SAVED, saved);
      draft = { sel: {}, sizes: [], total: draft.total }; save();
    } else if (ds.del) {
      if (!confirm("Eliminare questo sistema?")) return;
      saved = saved.filter((s) => s.id !== ds.del); store(KEY_SAVED, saved);
    }
    MG.render();
  });
  main.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.add && t.value) { toggle(t.dataset.add, t.value); MG.render(); }
    else if (t.dataset.odds) {
      const [id, mk] = t.dataset.odds.split("|"), v = parseFloat(String(t.value).replace(",", "."));
      if (draft.sel[id] && v > 1) { draft.sel[id][mk] = v; save(); }
      refresh();
    } else if (t.id === "sisTot") { draft.total = parseFloat(String(t.value).replace(",", ".")) || 0; save(); refresh(); }
  });

  // aggiorna solo i risultati, così il cursore resta nella casella che stai scrivendo
  function refresh() {
    const box = document.getElementById("sisRes");
    if (box) box.innerHTML = resultsHtml(items()); else MG.render();
  }

  function packSaved(its, r) {
    return {
      id: Date.now().toString(36), created: D.oggi, sizes: r.sizes, total: r.total, per: r.per, cols: r.cols,
      items: its.map((it) => ({ lg: it.fx.lg, date: it.fx.date, home: it.fx.home, away: it.fx.away, opts: it.opts.map((o) => ({ mk: o.mk, odds: o.odds })) })),
    };
  }

  function fromSlip(id) {
    const s = D.bollette.find((b) => b.id === id); if (!s) return;
    draft = { sel: {}, sizes: [], total: draft.total || 10 };
    for (const pk of s.picks) {
      const fx = FX[pk.fx]; if (!fx) continue;
      const mks = pk.markets[0] === "BAT" ? ["GGGG", "GGNG", "NGGG"] : pk.markets;
      draft.sel[fx.id] = {};
      mks.forEach((m) => { if (fx.est.probs[m] != null) draft.sel[fx.id][m] = defOdds(fx, m); });
      if (!Object.keys(draft.sel[fx.id]).length) delete draft.sel[fx.id];
    }
    save();
    MG.goTab("sistema");
  }
})();
