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
  let st = Object.assign({ filtro: "RAD", importo: 10, sel: {} }, load());
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* memoria piena */ } };

  const FX = Object.fromEntries(D.partite.map((f) => [f.id, f]));
  // tolgo le partite non più in calendario o già iniziate
  for (const id of Object.keys(st.sel)) if (!FX[id] || started(FX[id])) delete st.sel[id];

  const pr = (fx, mk) => fx.est.probs[mk];
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
    } else {
      const cols = ids.reduce((c, id) => c * Object.keys(st.sel[id]).length, 1);
      const pAll = ids.reduce((p, id) => p * Object.keys(st.sel[id]).reduce((s, mk) => s + pr(FX[id], mk), 0), 1);
      foot = `<div class="tot"><span>Integrale: <b>${cols}</b> colonne da ${eur(T / cols)}</span><span>Devono uscire tutte: <b>${pct(pAll, 1)}</b></span></div>
        <div class="small muted">Nel Sistema puoi scegliere anche le correzioni (es. 2 su 3) e vedere vincite e probabilità simulate.</div>`;
    }
    return `<div class="card" style="border:2px solid var(--brand2)">
      <h3>🎯 La tua giocata · ${ids.length} partit${ids.length === 1 ? "a" : "e"}</h3>
      ${blocks}
      <div class="small muted" style="margin:6px 0">Le caselle gialle partono dalla quota minima che serve per avere valore: <b>scrivi la quota vera del tuo bookmaker</b>.</div>
      <div class="row"><label class="small muted">Importo totale (€)</label><input id="reTot" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(st.importo)}"></div>
      ${foot}
      <div class="row" style="margin-top:10px">
        <button class="btn" data-re-act="sis">Apri come sistema</button>
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
      ${chosenHtml()}
      <h2>Partite <span class="small muted">(le più "chiuse" prima: conta la probabilità dei 3 risultati più probabili)</span></h2>
      <div class="chips"><button class="chip ${st.filtro === "RAD" ? "on" : ""}" data-re-f="RAD">Solo Raducioiu</button><button class="chip ${st.filtro === "ALL" ? "on" : ""}" data-re-f="ALL">Tutte le partite</button></div>
      ${L.length ? L.map(({ f, top3 }) => `<div class="card ${st.sel[f.id] && Object.keys(st.sel[f.id]).length ? "selcard" : ""}">
        <div class="row" style="margin:0 0 2px"><b>${esc(f.home)} – ${esc(f.away)}</b> ${badge(f.est.metodo)}</div>
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
    const t = ev.target.closest("[data-re],[data-re-top],[data-re-f],[data-re-act]");
    if (!t) return;
    const d = t.dataset;
    if (d.re) { const [id, mk] = d.re.split("|"); toggle(id, mk); }
    else if (d.reTop) { const fx = FX[d.reTop]; st.sel[d.reTop] = Object.fromEntries(ranked(fx).slice(0, 3).map((mk) => [mk, minOdds(fx, mk)])); }
    else if (d.reF) st.filtro = d.reF;
    else if (d.reAct === "clear") st.sel = {};
    else if (d.reAct === "sis") {
      const its = Object.entries(st.sel).map(([id, o]) => ({ fx: FX[id], opts: Object.entries(o).map(([mk, odds]) => ({ mk, odds: Number(odds) || 1 })) }));
      if (its.length) MG.sis.openInBuilder(its, [its.length], Number(st.importo) || 10);
      return;
    }
    save(); MG.render();
  });
  main.addEventListener("change", (ev) => {
    if (MG.state.tab !== "esatto") return;
    const t = ev.target;
    if (t.id === "reTot") st.importo = Math.max(0, parseFloat(String(t.value).replace(",", ".")) || 0);
    else if (t.dataset.reOdds) { const [id, mk] = t.dataset.reOdds.split("|"); const v = parseFloat(String(t.value).replace(",", ".")); if (v > 1 && st.sel[id]) st.sel[id][mk] = v; }
    else return;
    save(); MG.render();
  });
})();
