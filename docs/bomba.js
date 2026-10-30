/* Scheda "Bomba IA": dato importo e numero di partite, propone un sistema pronto
   scegliendo le giocate dalle bollette della settimana e il tipo di sistema più adatto. */
(function () {
  "use strict";
  const MG = window.MG;
  if (!MG || !MG.D || !MG.sis) return;
  const { D, esc, pct, q2, eur, lgName, fdate, badge, started } = MG;
  const { FX, MK, compute, columns, defOdds, elem } = MG.sis;

  const KEY = "mg_bomba";
  let opts = Object.assign({ importo: 10, n: 4, stile: "equilibrato", sizes: [] }, JSON.parse(localStorage.getItem(KEY) || "{}"));
  let result = null, seed = 0;

  const STILI = {
    prudente: { label: "Prudente", target: 0.8, desc: "giocate molto probabili, vincite piccole" },
    equilibrato: { label: "Equilibrato", target: 0.65, desc: "via di mezzo tra sicurezza e vincita" },
    coraggioso: { label: "Coraggioso", target: 0.5, desc: "quote più alte, si vince meno spesso ma di più" },
  };
  const MIN_COL = 0.1; // puntata minima per colonna accettata di solito dai bookmaker

  // Giocate candidate: tutte quelle presenti nelle bollette e nei consigli della settimana.
  function candidates() {
    const by = {};
    const add = (fxId, mks, method) => {
      const fx = FX[fxId];
      if (!fx || !fx.ok || started(fx)) return;   // le partite già iniziate non si possono più giocare
      const list = (mks[0] === "BAT" ? ["GGGG", "GGNG", "NGGG"] : mks).filter((m) => fx.est.probs[m] != null);
      if (!list.length) return;
      const p = mks[0] === "BAT" ? fx.est.probs.BAT : Math.min(0.99, list.reduce((s, m) => s + fx.est.probs[m], 0));
      (by[fxId] = by[fxId] || {})[list.join("+")] = { fx, mks: list, p, method };
    };
    D.bollette.forEach((s) => s.picks.forEach((pk) => add(pk.fx, pk.markets, s.method)));
    D.consigli.forEach((t) => add(t.fx, t.markets, "MULTIGOL"));
    return Object.values(by).map((m) => Object.values(m));
  }

  // Sceglie una giocata per partita (la più vicina alla probabilità voluta dallo stile) e le N partite migliori.
  function pickMatches(n, stile, shift) {
    const target = STILI[stile].target;
    const per = candidates().map((cands) => {
      cands.sort((a, b) => Math.abs(a.p - target) - Math.abs(b.p - target) || b.p - a.p);
      return cands[0];
    });
    per.sort((a, b) => Math.abs(a.p - target) - Math.abs(b.p - target) || b.p - a.p);
    // "Rigenera": scambia qualche partita con le successive in classifica
    const pool = per.slice();
    for (let i = 0; i < shift && pool.length > n; i++) {
      const out = pool.splice(n - 1 - (i % n), 1)[0];
      pool.push(out);
    }
    return pool.slice(0, n);
  }

  // Tipi di sistema da provare con n partite.
  function sizeOptions(n) {
    const o = [[n]];
    if (n >= 3) o.push([n - 1, n], [n - 1]);
    if (n >= 4) o.push([n - 2, n - 1, n], [n - 2]);
    if (n >= 6) o.push([n - 3, n - 2, n - 1, n]);
    return o;
  }
  const sizeLabel = (sizes, n) => sizes.map((k) => (k === n ? `${k} su ${n} (integrale)` : `${k} su ${n}`)).join(" + ");

  function score(r, stile, importo) {
    if (r.per < MIN_COL) return -Infinity;
    if (stile === "prudente") return r.pProf;
    if (stile === "equilibrato") return r.pProf * Math.min(r.avgProf / importo, 4);
    return r.pProf >= 0.08 ? r.maxAll : r.maxAll * r.pProf;
  }

  function generate() {
    const importo = Math.max(1, Number(opts.importo) || 10);
    const chosen = pickMatches(opts.n, opts.stile, seed);
    if (chosen.length < 2) return { error: "Servono almeno 2 partite con giocate consigliate: aspetta il calendario del weekend (di solito il venerdì)." };
    const its = chosen.map((c) => ({ fx: c.fx, method: c.method, opts: c.mks.map((mk) => ({ mk, odds: defOdds(c.fx, mk) })) }));
    let best = null;
    const tried = [];
    // sistema scelto a mano (es. 2 su 3 + 3 su 3): viene confrontato insieme agli altri
    const manual = (opts.sizes || []).filter((k) => k >= 1 && k <= its.length).sort((a, b) => a - b);
    const list = sizeOptions(its.length);
    if (manual.length && !list.some((z) => z.join() === manual.join())) list.unshift(manual);
    for (const sizes of list) {
      const r = compute(its, sizes, importo, 6000);
      const sc = score(r, opts.stile, importo);
      tried.push({ sizes, r, sc });
      if (!best || sc > best.sc) best = { sizes, r, sc };
    }
    if (manual.length) best = tried.find((t) => t.sizes.join() === manual.join());
    else if (!best || best.sc === -Infinity) return { error: `Con ${eur(importo)} le colonne verrebbero sotto i ${eur(MIN_COL)}: aumenta l'importo o riduci le partite.` };
    const final = compute(its, best.sizes, importo, 20000);
    const auto = tried.reduce((a, t) => (!a || t.sc > a.sc ? t : a), null);
    return { its, sizes: best.sizes, r: final, tried, importo, manual: manual.length > 0, auto, short: chosen.length < opts.n };
  }

  function why(res) {
    const n = res.its.length, s = res.sizes;
    const errs = n - Math.min(...s);
    const cover = errs === 0 ? "devono uscire tutte le partite" : `puoi sbagliare fino a ${errs} partit${errs === 1 ? "a" : "e"} e vincere comunque qualcosa`;
    if (res.manual) {
      const low = res.r.per < MIN_COL ? ` ⚠ Le colonne sono da ${eur(res.r.per)}: molti bookmaker non accettano meno di ${eur(MIN_COL)}, aumenta l'importo o togli qualche formula.` : "";
      const tip = res.auto && res.auto.sc > -Infinity && res.auto.sizes.join() !== s.join() ? ` Per lo stile scelto io avrei proposto <b>${sizeLabel(res.auto.sizes, n)}</b>.` : "";
      return `Hai scelto tu il sistema <b>${sizeLabel(s, n)}</b>: ${cover}.${tip}${low}`;
    }
    const goal = { prudente: "dà la probabilità più alta di rientrare dell'importo", equilibrato: "bilancia meglio probabilità di rientrare e vincita", coraggioso: "punta alla vincita più alta" }[opts.stile];
    return `Ho provato ${res.tried.length} tipi di sistema: <b>${sizeLabel(s, n)}</b> ${goal}. Con questo sistema ${cover}.`;
  }

  function view() {
    const maxN = Math.max(2, candidates().length);
    if (opts.n > maxN) opts.n = maxN;
    if (!result) result = generate();
    const res = result;
    const nChips = Array.from({ length: Math.min(maxN, 10) - 1 }, (_, i) => i + 2)
      .map((k) => `<button class="chip ${k === +opts.n ? "on" : ""}" data-bn="${k}">${k}</button>`).join("");
    const stChips = Object.entries(STILI).map(([k, v]) => `<button class="chip ${k === opts.stile ? "on" : ""}" data-bs="${k}">${v.label}</button>`).join("");
    // scelta del tipo di sistema: Automatico oppure una o più formule "k su n"
    const nIts = res.its ? res.its.length : +opts.n;
    const eC = res.its ? elem(res.its.map((it) => it.opts.length)) : null;
    const sel = (opts.sizes || []).filter((k) => k <= nIts);
    const szChips = `<button class="chip ${sel.length ? "" : "on"}" data-bz="auto">🤖 Automatico</button>` +
      Array.from({ length: nIts }, (_, i) => i + 1).map((k) => `<button class="chip ${sel.includes(k) ? "on" : ""}" data-bz="${k}">${k === nIts ? `${k} su ${k} integrale` : `${k} su ${nIts}`}${eC ? ` · ${eC[k]} col.` : ""}</button>`).join("");
    let body;
    if (res.error) body = `<div class="empty">${esc(res.error)}</div>`;
    else {
      const r = res.r, n = res.its.length;
      const cols = columns(res.its, res.sizes, r.per, 200);
      body = `<div class="card bomba">
        <h3>💣 La tua Bomba · ${n} partite · ${esc(sizeLabel(res.sizes, n))}</h3>
        ${res.short ? `<div class="small muted">Ci sono solo ${n} partite con giocate consigliate in questo momento.</div>` : ""}
        ${res.its.map((it) => `<div class="pick">
          <div><div class="m">${esc(it.fx.home)} – ${esc(it.fx.away)}</div>
          <div class="small muted">${esc(lgName(it.fx.lg))} · ${fdate(it.fx.date, it.fx.time)} · ${badge(it.method, it.fx)}</div></div>
          <div class="r">${it.opts.map((o) => `<div class="w">${esc(MK[o.mk])}</div><div class="small muted">${pct(it.fx.est.probs[o.mk])} · quota min ${q2(o.odds)}</div>`).join("")}</div>
        </div>`).join("")}
        <div class="grid2" style="margin-top:10px">
          <div class="kpi"><div class="v">${r.cols}</div><div class="l">colonne da ${eur(r.per)}</div></div>
          <div class="kpi"><div class="v">${eur(r.total)}</div><div class="l">importo totale</div></div>
          <div class="kpi"><div class="v">${eur(r.minCol)}</div><div class="l">vincita minima</div></div>
          <div class="kpi"><div class="v">${eur(r.maxAll)}</div><div class="l">vincita massima</div></div>
          <div class="kpi"><div class="v">${pct(r.pAny)}</div><div class="l">probabilità di vincere qualcosa</div></div>
          <div class="kpi"><div class="v">${pct(r.pProf)}</div><div class="l">probabilità di rientrare o guadagnare</div></div>
        </div>
        <div class="note" style="margin-top:10px">🤖 ${why(res)}<br>Le quote sono quelle <b>minime</b>: se il tuo bookmaker paga meno su qualche giocata, apri la bomba nel costruttore e correggile.</div>
        <details><summary class="small"><b>Vedi le colonne</b>${r.cols > cols.length ? ` (prime ${cols.length} di ${r.cols})` : ""}</summary>
          <div class="tw" style="margin-top:6px"><table><tr><th>#</th><th>Giocate</th><th>Quota</th><th>Vincita</th></tr>
          ${cols.map((c, i) => `<tr><td>${i + 1}</td><td style="text-align:left;white-space:normal">${c.c.map(([it, o]) => `${esc(it.fx.home)}: ${esc(MK[o.mk])}`).join("<br>")}</td><td>${q2(c.q)}</td><td>${eur(c.win)}</td></tr>`).join("")}
          </table></div></details>
        <details style="margin-top:6px"><summary class="small"><b>Gli altri sistemi che ho confrontato</b></summary>
          <div class="tw" style="margin-top:6px"><table><tr><th>Sistema</th><th>Colonne</th><th>Rientro</th><th>Vincita max</th></tr>
          ${res.tried.map((t) => `<tr class="${t.sizes.join() === res.sizes.join() ? "hi" : ""}"><td>${esc(sizeLabel(t.sizes, n))}</td><td>${t.r.cols}${t.r.per < MIN_COL ? " ⚠" : ""}</td><td>${pct(t.r.pProf)}</td><td>${eur(t.r.maxAll)}</td></tr>`).join("")}
          </table></div></details>
        <div class="row" style="margin-top:10px">
          <button class="btn" data-ba="open">Modifica quote nel Sistema</button>
          <button class="btn" data-ba="save">Salva così</button>
          <button class="btn" style="background:var(--nob)" data-ba="again">🔄 Rigenera</button>
        </div></div>`;
    }
    return `<div class="note">La <b>Bomba IA</b> sceglie da sola partite e giocate tra quelle delle bollette della settimana, poi prova diversi tipi di sistema (integrale e a correzione) simulandoli migliaia di volte e ti propone il migliore per lo stile che scegli. È un calcolo statistico: non garantisce la vincita.</div>
      <div class="card">
        <div class="row"><label class="small muted" style="min-width:110px">Importo (€)</label><input id="bImp" type="number" min="1" step="1" inputmode="decimal" value="${esc(opts.importo)}"></div>
        <div class="small muted">Numero di partite</div><div class="chips" style="margin-top:4px">${nChips}</div>
        <div class="small muted">Stile</div><div class="chips" style="margin:4px 0 0">${stChips}</div>
        <div class="small muted">${esc(STILI[opts.stile].desc)}</div>
        <div class="small muted" style="margin-top:10px">Tipo di sistema (puoi sceglierne più di uno, es. 2 su 3 + 3 su 3)</div>
        <div class="chips" style="margin:4px 0 0">${szChips}</div>
      </div>
      ${body}`;
  }

  MG.views.bomba = view;
  const persist = () => localStorage.setItem(KEY, JSON.stringify(opts));
  const main = document.getElementById("main");
  main.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-bn],[data-bs],[data-ba],[data-bz]");
    if (!t || MG.state.tab !== "bomba") return;
    const d = t.dataset;
    if (d.bn) { opts.n = +d.bn; opts.sizes = []; seed = 0; result = null; }
    else if (d.bz) {
      if (d.bz === "auto") opts.sizes = [];
      else { const k = +d.bz, s = opts.sizes || []; opts.sizes = s.includes(k) ? s.filter((x) => x !== k) : [...s, k]; }
      result = null;   // stesse partite, cambia solo il sistema
    }
    else if (d.bs) { opts.stile = d.bs; seed = 0; result = null; }
    else if (d.ba === "again") { seed++; result = null; }
    else if (d.ba === "open" && result && !result.error) { MG.sis.openInBuilder(result.its, result.sizes, result.importo); return; }
    else if (d.ba === "save" && result && !result.error) {
      MG.sis.saveSystem(result.its, result.r);
      alert("Bomba salvata: la trovi in Sistema → I miei sistemi.");
      return;
    }
    persist(); MG.render();
  });
  main.addEventListener("change", (ev) => {
    if (ev.target.id !== "bImp" || MG.state.tab !== "bomba") return;
    opts.importo = Math.max(1, parseFloat(String(ev.target.value).replace(",", ".")) || 10);
    result = null; persist(); MG.render();
  });
})();
