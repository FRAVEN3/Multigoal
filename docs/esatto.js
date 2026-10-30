/* Scheda "Risultato esatto": per le partite Raducioiu (poche reti attese) mostra la probabilità
   di ogni risultato da 0-0 a 3-3. Scegli i risultati da coprire, scrivi le quote del bookmaker:
   su una partita calcola come dividere l'importo per vincere uguale con ognuno,
   su più partite apre il sistema già pronto. */
(function () {
  "use strict";
  const MG = window.MG;
  if (!MG || !MG.D || !MG.sis) return;
  const { D, esc, pct, q2, eur, lgName, fdate, badge, started } = MG;
  const margin = D.config.bollette.margine_valore;
  const G = 3; // risultati da 0-0 a 3-3
  const code = (h, a) => `RS${h}${a}`;
  const label = (mk) => `${mk[2]}-${mk[3]}`;

  const KEY = "mg_esatto";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  let st = Object.assign({ filtro: "RAD", importo: 10, sel: {}, selSizes: [], auto: { k: 2, on: null, sizes: [] } }, load());
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* memoria piena */ } };

  const FX = Object.fromEntries(D.partite.map((f) => [f.id, f]));
  // tolgo le partite non più in calendario o già iniziate
  for (const id of Object.keys(st.sel)) if (!FX[id] || started(FX[id])) delete st.sel[id];

  const pr = (fx, mk) => fx.est.probs[mk];
  const { compute, columns, elem } = MG.sis;
  const MAXP = 8; // partite proposte dall'app
  const minOdds = (fx, mk) => Math.round((margin / pr(fx, mk)) * 100) / 100;
  // i risultati della partita dal più probabile
  const ranked = (fx) => {
    const out = [];
    for (let h = 0; h <= G; h++) for (let a = 0; a <= G; a++) if (pr(fx, code(h, a)) != null) out.push(code(h, a));
    return out.sort((x, y) => pr(fx, y) - pr(fx, x));
  };

  function list() {
    return D.partite.filter((f) => f.ok && f.re && !started(f) && (st.filtro === "ALL" || f.est.metodo === "RADUCIOIU"))
      .map((f) => ({ f, top3: ranked(f).slice(0, 3).reduce((s, m) => s + pr(f, m), 0) }))
      .sort((a, b) => b.top3 - a.top3);
  }

  // ---------- sistema (integrale o a correzione) su più partite ----------
  const sizesOf = (sizes, n) => { const s = (sizes || []).filter((k) => k >= 1 && k <= n); return s.length ? s.sort((a, b) => a - b) : [n]; };
  function sysBox(its, sizesSel, key) {
    const n = its.length, sizes = sizesOf(sizesSel, n), T = Number(st.importo) || 0;
    const eC = elem(its.map((it) => it.opts.length));
    const chips = Array.from({ length: n }, (_, i) => i + 1).map((k) =>
      `<button class="chip ${sizes.includes(k) ? "on" : ""}" data-re-sz="${key}|${k}">${k === n ? `${k} su ${k} integrale` : `${k} su ${n}`} · ${eC[k]} col.</button>`).join("");
    const r = compute(its, sizes, T, 8000);
    const cols = columns(its, sizes, r.per, 150);
    const errs = n - Math.min(...sizes);
    const k = (v, l) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`;
    return `<div class="small muted" style="margin-top:8px">Tipo di sistema (puoi sceglierne più di uno, es. 2 su 3 + 3 su 3)</div>
      <div class="chips" style="margin-top:4px">${chips}</div>
      <div class="grid2">${k(r.cols, `colonne da ${eur(r.per)}`)}${k(eur(r.minCol), "vincita minima")}${k(eur(r.maxAll), "vincita massima")}
        ${k(pct(r.pAny, 1), "probabilità di vincere qualcosa")}${k(pct(r.pProf, 1), "probabilità di rientrare o guadagnare")}
        ${k(`<span class="${r.ev >= 0 ? "esito-W" : "esito-L"}">${r.ev >= 0 ? "+" : ""}${pct(r.ev, 1)}</span>`, "resa media stimata")}</div>
      <div class="small muted" style="margin-top:6px">${errs ? `Puoi sbagliare fino a ${errs} partit${errs === 1 ? "a" : "e"} e vincere comunque qualcosa.` : "Devono uscire tutte le partite."}
        ${r.per > 0 && r.per < 0.1 ? ` <span class="esito-L">Colonne sotto 0,10 €: molti bookmaker non le accettano.</span>` : ""}</div>
      <details style="margin-top:6px"><summary class="small"><b>Vedi le colonne</b>${r.cols > cols.length ? ` (prime ${cols.length} di ${r.cols})` : ""}</summary>
        <div class="tw" style="margin-top:6px"><table><tr><th>#</th><th>Risultati</th><th>Quota</th><th>Vincita</th></tr>
        ${cols.map((c, i) => `<tr><td>${i + 1}</td><td style="text-align:left;white-space:normal">${c.c.map(([it, o]) => `${esc(it.fx.home)}: <b>${label(o.mk)}</b>`).join("<br>")}</td><td>${q2(c.q)}</td><td>${eur(c.win)}</td></tr>`).join("")}
        </table></div></details>
      <div class="row" style="margin-top:10px">
        <button class="btn" data-re-act="save-${key}">Salva sistema</button>
        <button class="btn" data-re-act="sis-${key}">Apri nel Sistema</button>
        ${key === "auto" ? `<button class="btn" style="background:var(--nob)" data-re-act="copy">Modifica risultati e quote</button>` : ""}</div>`;
  }
  const itsOf = (sel) => Object.entries(sel).filter(([id, o]) => FX[id] && Object.keys(o).length)
    .map(([id, o]) => ({ fx: FX[id], opts: Object.entries(o).map(([mk, odds]) => ({ mk, odds: Number(odds) || 1 })) }));

  // ---------- partite scelte dall'app ----------
  const topK = (f) => ranked(f).slice(0, st.auto.k);
  function proposal() {
    return list().map(({ f }) => ({ f, p: topK(f).reduce((s, m) => s + pr(f, m), 0) })).sort((a, b) => b.p - a.p).slice(0, MAXP);
  }
  function autoOn(P) {
    const ids = P.map((x) => x.f.id);
    if (!st.auto.on) return ids.slice(0, 3);   // all'inizio: le 3 migliori
    return st.auto.on.filter((id) => ids.includes(id));
  }
  const autoIts = () => autoOn(proposal()).map((id) => ({ fx: FX[id], opts: topK(FX[id]).map((mk) => ({ mk, odds: minOdds(FX[id], mk) })) }));
  function autoHtml() {
    const P = proposal();
    if (P.length < 2) return "";
    const on = autoOn(P), its = autoIts();
    const kChips = [1, 2, 3].map((k) => `<button class="chip ${st.auto.k === k ? "on" : ""}" data-re-k="${k}">${k} risultat${k === 1 ? "o" : "i"} per partita</button>`).join("");
    return `<div class="card bomba">
      <h3>🤖 Sistema con le partite scelte dall'app</h3>
      <div class="small muted">L'app propone le ${P.length} partite più "chiuse" con i loro risultati più probabili. Scegli quanti risultati coprire e quali partite mettere nel sistema.</div>
      <div class="chips" style="margin:8px 0 4px">${kChips}</div>
      ${P.map(({ f, p }) => { const sel = on.includes(f.id); return `<div class="pick" style="grid-template-columns:auto minmax(0,1fr) auto;align-items:center">
        <button class="chip ${sel ? "on" : ""}" data-re-on="${f.id}" style="min-width:34px">${sel ? "✓" : "+"}</button>
        <div><span class="m">${esc(f.home)} – ${esc(f.away)}</span><div class="small muted">${esc(lgName(f.lg))} · ${fdate(f.date, f.time)}</div></div>
        <div class="r"><div class="w">${topK(f).map(label).join(" / ")}</div><div class="small muted">copre ${pct(p)}</div></div></div>`; }).join("")}
      <div class="row" style="margin:8px 0 0"><label class="small muted">Importo totale (€)</label><input id="reTotA" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(st.importo)}"></div>
      ${its.length >= 2 ? sysBox(its, st.auto.sizes, "auto") : `<div class="small muted" style="margin-top:8px">Scegli almeno 2 partite per fare il sistema.</div>`}
      <div class="small muted" style="margin-top:6px">Le quote usate sono quelle <b>minime</b> per avere valore: con "Modifica risultati e quote" puoi scrivere quelle vere del tuo bookmaker.</div>
    </div>`;
  }

  // ---------- giocata su una partita: stessa vincita con ogni risultato scelto ----------
  function dutch(fx, picks, total) {
    const inv = picks.reduce((s, [mk, q]) => s + 1 / q, 0);
    const win = total / inv, p = picks.reduce((s, [mk]) => s + pr(fx, mk), 0);
    return { stakes: picks.map(([mk, q]) => [mk, q, total / q / inv]), win, p, q: 1 / inv, ev: p * win - total };
  }

  function chosenHtml() {
    const ids = Object.keys(st.sel).filter((id) => Object.keys(st.sel[id]).length);
    if (!ids.length) return `<div class="note">Tocca i risultati nelle tabelle qui sotto per sceglierli (anche più di uno per partita), oppure premi <b>"i 3 più probabili"</b>.</div>`;
    const T = Number(st.importo) || 0;
    const blocks = ids.map((id) => {
      const fx = FX[id], picks = Object.entries(st.sel[id]).map(([mk, q]) => [mk, Number(q) || 1]);
      const d = dutch(fx, picks, ids.length === 1 ? T : 1);
      return `<div class="pick" style="grid-template-columns:minmax(0,1fr)">
        <div><span class="m">${esc(fx.home)} – ${esc(fx.away)}</span> <span class="small muted">${fdate(fx.date, fx.time)}</span></div>
        ${d.stakes.map(([mk, q, s]) => `<div class="optrow"><span><b>${label(mk)}</b> <span class="small muted">${pct(pr(fx, mk), 1)}</span>${ids.length === 1 ? ` · gioca <b>${eur(s)}</b>` : ""}</span>
          <span><input class="odds" type="number" step="0.01" min="1.01" inputmode="decimal" value="${q}" data-re-odds="${id}|${mk}">
          <button class="x" data-re="${id}|${mk}" title="Togli">✕</button></span></div>`).join("")}
        <div class="small muted" style="padding-left:10px">Copri il ${pct(d.p)} dei casi · quota complessiva ${q2(d.q)} ${d.p * d.q >= 1 ? `<span class="esito-W">conviene</span>` : `<span class="esito-L">sotto il valore equo</span>`}</div>
      </div>`;
    }).join("");
    let foot;
    if (ids.length === 1) {
      const fx = FX[ids[0]], d = dutch(fx, Object.entries(st.sel[ids[0]]).map(([mk, q]) => [mk, Number(q) || 1]), T);
      foot = `<div class="tot"><span>Se esce uno dei risultati vinci <b>${eur(d.win)}</b></span>
        <span>Utile <b class="${d.win - T >= 0 ? "esito-W" : "esito-L"}">${eur(d.win - T)}</b></span>
        <span>Probabilità <b>${pct(d.p)}</b></span>
        <span>Resa attesa <b class="${d.ev >= 0 ? "esito-W" : "esito-L"}">${d.ev >= 0 ? "+" : ""}${eur(d.ev)}</b></span></div>
        ${d.win < T ? `<div class="gonenote">Con queste quote anche vincendo prendi meno di quanto giochi: togli un risultato.</div>` : ""}`;
    } else foot = sysBox(itsOf(st.sel), st.selSizes, "sel");
    return `<div class="card" style="border:2px solid var(--brand2)">
      <h3>🎯 La tua giocata · ${ids.length} partit${ids.length === 1 ? "a" : "e"}</h3>
      ${blocks}
      <div class="small muted" style="margin:6px 0">Le caselle gialle partono dalla quota minima che serve per avere valore: <b>scrivi la quota vera del tuo bookmaker</b>.</div>
      <div class="row"><label class="small muted">Importo totale (€)</label><input id="reTot" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(st.importo)}"></div>
      ${foot}
      <div class="row" style="margin-top:10px">
        ${ids.length === 1 ? `<button class="btn" data-re-act="sis-sel">Apri nel Sistema</button>` : ""}
        <button class="btn" style="background:var(--nob)" data-re-act="clear">Svuota</button></div>
    </div>`;
  }

  function gridHtml(fx) {
    const s = st.sel[fx.id] || {}, top = new Set(ranked(fx).slice(0, 3));
    let h = `<tr><th>casa \\ ospite</th>${[0, 1, 2, 3].map((a) => `<th style="text-align:center">${a}</th>`).join("")}</tr>`;
    for (let hg = 0; hg <= G; hg++) {
      h += `<tr><td><b>${hg}</b></td>${[0, 1, 2, 3].map((ag) => {
        const mk = code(hg, ag), p = pr(fx, mk);
        return `<td class="recell ${mk in s ? "on" : ""} ${top.has(mk) ? "top" : ""}" data-re="${fx.id}|${mk}"><b>${hg}-${ag}</b><br>${pct(p, 1)}</td>`;
      }).join("")}</tr>`;
    }
    const inside = ranked(fx).reduce((t, m) => t + pr(fx, m), 0);
    return `<div class="tw"><table class="regrid">${h}</table></div>
      <div class="small muted" style="margin-top:4px">Altri risultati (4 o più gol di una squadra): ~${pct(Math.max(0, 1 - inside))}</div>`;
  }

  function view() {
    const L = list(), B = D.backtest.risultato_esatto;
    const trust = B && B.n ? `Nel test sulle stagioni passate (${B.n} partite Raducioiu) il risultato più probabile è uscito il <b>${pct(B.h1)}</b> delle volte, i 3 più probabili il <b>${pct(B.h3)}</b> (il modello prevedeva ${pct(B.p1)} e ${pct(B.p3)}).` : "";
    return `<div class="note">Per ogni partita calcolo i gol attesi di casa e ospite (attacco e difesa rispetto alla media del campionato) e da questi la probabilità di ogni risultato, con le percentuali corrette sui risultati veri delle stagioni passate.
      Le partite <b>Raducioiu</b> sono quelle con poche reti attese, dove i risultati bassi sono più probabili. ${trust}
      Il risultato esatto resta una giocata ad alto rischio: conviene solo se le quote del bookmaker sono più alte della quota minima.</div>
      ${autoHtml()}
      <h2>La tua giocata</h2>
      ${chosenHtml()}
      <h2>Partite <span class="small muted">(le più "chiuse" prima: conta la probabilità dei 3 risultati più probabili)</span></h2>
      <div class="chips"><button class="chip ${st.filtro === "RAD" ? "on" : ""}" data-re-f="RAD">Solo Raducioiu</button><button class="chip ${st.filtro === "ALL" ? "on" : ""}" data-re-f="ALL">Tutte le partite</button></div>
      ${L.length ? L.map(({ f, top3 }) => `<div class="card ${st.sel[f.id] && Object.keys(st.sel[f.id]).length ? "selcard" : ""}">
        <div class="row" style="margin:0 0 2px"><b>${esc(f.home)} – ${esc(f.away)}</b> ${badge(f.est.metodo, f)}</div>
        <div class="small muted" style="margin-bottom:6px">${esc(lgName(f.lg))} · ${fdate(f.date, f.time)} · gol attesi ${q2(f.re.lh)} – ${q2(f.re.la)} · i 3 più probabili ${pct(top3)}</div>
        ${gridHtml(f)}
        <div class="row" style="margin:8px 0 0"><button class="btn small" style="margin-left:0" data-re-top="${f.id}">i 3 più probabili</button>
          <span class="small muted">I risultati con il bordo sono i 3 più probabili.</span></div>
      </div>`).join("") : `<div class="empty">Nessuna partita ${st.filtro === "RAD" ? "Raducioiu " : ""}ancora da giocare nei prossimi 7 giorni.</div>`}`;
  }

  function toggle(id, mk) {
    const fx = FX[id]; if (!fx) return;
    const s = (st.sel[id] = st.sel[id] || {});
    if (mk in s) delete s[mk]; else s[mk] = minOdds(fx, mk);
    if (!Object.keys(s).length) delete st.sel[id];
  }

  MG.views.esatto = view;
  const main = document.getElementById("main");
  main.addEventListener("click", (ev) => {
    if (MG.state.tab !== "esatto") return;
    const t = ev.target.closest("[data-re],[data-re-top],[data-re-f],[data-re-act],[data-re-sz],[data-re-k],[data-re-on]");
    if (!t) return;
    const d = t.dataset;
    if (d.re) { const [id, mk] = d.re.split("|"); toggle(id, mk); }
    else if (d.reTop) { const fx = FX[d.reTop]; st.sel[d.reTop] = Object.fromEntries(ranked(fx).slice(0, 3).map((mk) => [mk, minOdds(fx, mk)])); }
    else if (d.reF) st.filtro = d.reF;
    else if (d.reSz) {
      const [key, k] = d.reSz.split("|"), auto = key === "auto";
      const n = auto ? autoIts().length : itsOf(st.sel).length;
      let cur = sizesOf(auto ? st.auto.sizes : st.selSizes, n);
      cur = cur.includes(+k) ? cur.filter((x) => x !== +k) : [...cur, +k];
      if (auto) st.auto.sizes = cur; else st.selSizes = cur;
    }
    else if (d.reK) st.auto.k = +d.reK;
    else if (d.reOn) {
      const on = autoOn(proposal());
      st.auto.on = on.includes(d.reOn) ? on.filter((x) => x !== d.reOn) : [...on, d.reOn];
    }
    else if (d.reAct === "clear") { st.sel = {}; st.selSizes = []; }
    else if (d.reAct === "copy") {
      // porta la proposta nella "tua giocata", dove si possono cambiare risultati e quote
      st.sel = Object.fromEntries(autoIts().map((it) => [it.fx.id, Object.fromEntries(it.opts.map((o) => [o.mk, o.odds]))]));
      st.selSizes = st.auto.sizes.slice();
      save(); MG.render();
      const h = [...document.querySelectorAll("#main h2")].find((x) => x.textContent === "La tua giocata");
      if (h) h.scrollIntoView();
      return;
    }
    else if (d.reAct) {
      const [act, key] = d.reAct.split("-");
      const its = key === "auto" ? autoIts() : itsOf(st.sel);
      if (!its.length) return;
      const sizes = sizesOf(key === "auto" ? st.auto.sizes : st.selSizes, its.length);
      if (act === "sis") { MG.sis.openInBuilder(its, sizes, Number(st.importo) || 10); return; }
      if (act === "save") {
        MG.sis.saveSystem(its, compute(its, sizes, Number(st.importo) || 0, 2000));
        alert("Sistema salvato: lo trovi in Sistema → I miei sistemi.");
      }
      return;
    }
    save(); MG.render();
  });
  main.addEventListener("change", (ev) => {
    if (MG.state.tab !== "esatto") return;
    const t = ev.target;
    if (t.id === "reTot" || t.id === "reTotA") st.importo = Math.max(0, parseFloat(String(t.value).replace(",", ".")) || 0);
    else if (t.dataset.reOdds) { const [id, mk] = t.dataset.reOdds.split("|"); const v = parseFloat(String(t.value).replace(",", ".")); if (v > 1 && st.sel[id]) st.sel[id][mk] = v; }
    else return;
    save(); MG.render();
  });
})();
