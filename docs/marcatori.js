/* Scheda "Marcatori": chi può segnare nelle prossime partite (dati ESPN della stagione + ultima formazione),
   scelta dei giocatori e creazione di singole, multiple o sistemi (si apre il costruttore della scheda Sistema). */
(function () {
  "use strict";
  const MG = window.MG;
  if (!MG || !MG.D || !MG.sis) return;
  const { D, esc, pct, q2, lgName, fdate, started } = MG;
  const PL = D.marcatori || {};
  const FX = Object.fromEntries(D.partite.map((f) => [f.id, f]));
  const margin = D.config.bollette.margine_valore;

  const KEY = "mg_marcatori";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const ui = Object.assign({ lg: "", vista: "top", sel: [], piu: false }, load());
  ui.sel = (ui.sel || []).filter((x) => FX[x.fx] && !started(FX[x.fx]));   // tolgo le partite già iniziate o passate
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch (e) { /* memoria piena */ } };

  // tutti i giocatori delle partite ancora da giocare
  const all = () => Object.entries(PL).flatMap(([fx, sides]) => {
    const f = FX[fx];
    if (!f || started(f)) return [];
    return Object.values(sides).flatMap((list) => list.map((p) => ({ ...p, fx, f, team: p.side === "h" ? f.home : f.away, opp: p.side === "h" ? f.away : f.home })));
  }).filter((p) => !ui.lg || p.f.lg === ui.lg);
  const isSel = (p) => ui.sel.some((x) => x.fx === p.fx && x.id === p.id);
  const minOdds = (p) => Math.max(1.01, Math.round((margin / p) * 100) / 100);
  const ULTIMA = { titolare: ["titolare nell'ultima", ""], entrato: ["entrato nell'ultima", ""], panchina: ["in panchina nell'ultima", "warn"], fuori: ["non in distinta nell'ultima ⚠", "warn"], "?": ["formazione non disponibile", ""] };
  const RUOLO = { F: "attaccante", M: "centrocampista", D: "difensore" };

  function row(p, withMatch) {
    const u = ULTIMA[p.ultima] || ULTIMA["?"];
    return `<div class="scrow">
      <div><b>${esc(p.name)}</b> <span class="small muted">${esc(p.team)} · ${RUOLO[p.role] || ""}</span>
        ${withMatch ? `<div class="small muted">contro ${esc(p.opp)} · ${esc(lgName(p.f.lg))} · ${fdate(p.f.date, p.f.time)}</div>` : ""}
        <div class="small muted">${p.gol} gol in ${p.pres} presenze (${p.tit} da titolare) · ${p.tiri} tiri, ${p.porta} in porta</div>
        ${p.uff ? MG.formTag(p) : `<span class="tag ${u[1]}">${u[0]}</span>`}
        <div class="scbar"><i style="width:${Math.round(p.p * 100)}%"></i></div></div>
      <div class="scp">${pct(p.p)}<div class="small muted" style="font-weight:400">quota min ${q2(minOdds(p.p))}</div></div>
      <button class="add ${isSel(p) ? "on" : ""}" data-scsel="${esc(p.fx)}|${esc(p.id)}" title="${isSel(p) ? "Togli" : "Aggiungi alla schedina"}">${isSel(p) ? "✓" : "+"}</button>
    </div>`;
  }

  // probabilità che segnino almeno k dei giocatori scelti
  function atLeast(ps) {
    const dp = [1].concat(ps.map(() => 0));
    ps.forEach((p) => { for (let j = ps.length; j > 0; j--) dp[j] = dp[j] * (1 - p) + dp[j - 1] * p; dp[0] *= 1 - p; });
    return ps.map((_, i) => dp.slice(i + 1).reduce((a, b) => a + b, 0));
  }

  function selHtml() {
    const sel = ui.sel.map((x) => { const f = FX[x.fx], pl = Object.values(PL[x.fx] || {}).flat().find((p) => p.id === x.id); return pl && { ...pl, fx: x.fx, f, team: pl.side === "h" ? f.home : f.away }; }).filter(Boolean);
    if (!sel.length) return `<div class="note">Tocca <b>+</b> accanto ai giocatori per metterli nella tua schedina marcatori: poi scegli singole, multipla o sistema (es. 2 su 4: vinci anche se ne segnano solo 2).</div>`;
    const al = atLeast(sel.map((p) => p.p)), n = sel.length;
    return `<div class="card" style="border:2px solid #0e7490">
      <h3>La tua schedina marcatori · ${n} giocator${n === 1 ? "e" : "i"}</h3>
      ${sel.map((p) => `<div class="optrow"><span><b>${esc(p.name)}</b> <span class="small muted">${esc(p.team)} · ${fdate(p.f.date, p.f.time)}</span></span>
        <span><b>${pct(p.p)}</b> <button class="x" data-scsel="${esc(p.fx)}|${esc(p.id)}" title="Togli">✕</button></span></div>`).join("")}
      <div class="small" style="margin:8px 0 4px">Probabilità che segnino almeno:</div>
      <div class="chips" style="margin:0 0 6px">${al.map((v, i) => `<span class="chip">${i + 1} su ${n}: <b>${pct(v)}</b></span>`).join("")}</div>
      <div class="small muted">Apri il sistema per scrivere le quote del tuo bookmaker e vedere colonne, vincite e resa:</div>
      <div class="row" style="margin:6px 0 0">${n > 1 ? `<button class="btn" data-scopen="${n}">Multipla (${n} su ${n})</button>` : `<button class="btn" data-scopen="1">Singola</button>`}
        ${n > 1 ? Array.from({ length: n - 1 }, (_, i) => i + 1).filter((k) => k >= Math.max(1, n - 3)).map((k) => `<button class="btn" style="background:#0e7490" data-scopen="${k}">Sistema ${k} su ${n}</button>`).join("") : ""}
        <button class="btn" style="background:var(--nob)" data-scclear="1">Svuota</button></div>
      <div class="small muted" style="margin-top:6px">Due giocatori della stessa partita vanno nello stesso "gruppo" del sistema (combinazioni), come le giocate multiple su una partita.</div>
    </div>`;
  }

  function view() {
    if (!Object.keys(PL).length) return `<div class="empty">Dati sui marcatori non ancora disponibili: arrivano con l'aggiornamento (servono le partite dei prossimi giorni).</div>`;
    const list = all();
    const lgs = [...new Set(Object.keys(PL).map((id) => FX[id] && FX[id].lg).filter(Boolean))];
    const chip = (k, v, l) => `<button class="chip ${ui[k] === v ? "on" : ""}" data-scui="${k}=${esc(v)}">${esc(l)}</button>`;
    let body;
    if (ui.vista === "top") {
      const top = list.slice().sort((a, b) => b.p - a.p), shown = top.slice(0, ui.piu ? 80 : 25);
      body = `<div class="card">${shown.map((p) => row(p, true)).join("") || `<div class="empty">Nessun giocatore.</div>`}</div>
        ${top.length > shown.length ? `<button class="btn" style="background:var(--nob)" data-scui="piu=1">Mostra altri</button>` : ""}`;
    } else {
      const fxs = [...new Set(list.map((p) => p.fx))].map((id) => FX[id]).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      body = fxs.map((f) => {
        const ps = list.filter((p) => p.fx === f.id);
        const side = (s) => ps.filter((p) => p.side === s).map((p) => row(p, false)).join("") || `<div class="small muted">nessun giocatore sopra l'8%</div>`;
        return `<details class="card"><summary><b>${esc(f.home)} – ${esc(f.away)}</b>
          <div class="small muted">${esc(lgName(f.lg))} · ${fdate(f.date, f.time)} · gol attesi ${f.re ? `${f.re.lh} – ${f.re.la}` : "–"} · più probabile: <b>${esc(ps.slice().sort((a, b) => b.p - a.p)[0].name)}</b> ${pct(Math.max(...ps.map((p) => p.p)))}</div></summary>
          <div class="small" style="margin-top:8px"><b>${esc(f.home)}</b></div>${side("h")}
          <div class="small" style="margin-top:8px"><b>${esc(f.away)}</b></div>${side("a")}</details>`;
      }).join("") || `<div class="empty">Nessuna partita.</div>`;
    }
    const nBol = D.bollette.filter((b) => b.method === "MARCATORI").length;
    return `<div class="note">Da 100 minuti prima di ogni partita l'app controlla le <b>formazioni ufficiali</b>: ✅ titolare, 🪑 panchina o ⛔ non convocato (infortunato, squalificato o fuori rosa), e ricalcola la probabilità. Tieni l'app aperta o riaprila poco prima della partita.</div>
      <div class="note">Probabilità che il giocatore <b>segni almeno un gol</b>, calcolata con: gol e tiri in porta di questa stagione, quanto gioca da titolare, se era in campo nell'ultima partita e quanti gol la sua squadra dovrebbe fare contro quell'avversario.
      Dati ESPN (non ci sono gli infortuni: "non in distinta" nell'ultima partita è il segnale più vicino). Quanto sono giuste queste percentuali lo vedrai in <b>📊 Rendimento</b> alla voce "Marcatore".</div>
      ${nBol ? `<div class="row"><button class="btn" data-scbol="1">Vedi le ${nBol} bollette marcatori dell'app</button></div>` : ""}
      ${selHtml()}
      <div class="chips">${chip("vista", "top", "I migliori della settimana")}${chip("vista", "partite", "Partita per partita")}</div>
      <div class="chips">${chip("lg", "", "Tutti i campionati")}${lgs.map((l) => chip("lg", l, lgName(l))).join("")}</div>
      ${body}`;
  }

  MG.views.marcatori = view;
  document.getElementById("main").addEventListener("click", (ev) => {
    if (MG.state.tab !== "marcatori") return;
    const t = ev.target.closest("[data-scsel],[data-scui],[data-scopen],[data-scclear],[data-scbol]");
    if (!t) return;
    const d = t.dataset;
    if (d.scsel) {
      const [fx, id] = d.scsel.split("|");
      ui.sel = isSel({ fx, id }) ? ui.sel.filter((x) => !(x.fx === fx && x.id === id)) : ui.sel.concat([{ fx, id }]);
    } else if (d.scui) {
      const [k, v] = d.scui.split("=");
      if (k === "piu") ui.piu = true; else { ui[k] = v; ui.piu = false; }
    } else if (d.scclear) ui.sel = [];
    else if (d.scbol) { MG.state.metodo = "MARCATORI"; MG.goTab("bollette"); return; }
    else if (d.scopen) {
      // un gruppo per partita, con i giocatori scelti come combinazioni
      const by = {};
      ui.sel.forEach((x) => (by[x.fx] = by[x.fx] || []).push(x.id));
      const its = Object.entries(by).map(([fx, ids]) => ({ fx: FX[fx], opts: ids.map((id) => ({ mk: `SC_${id}`, odds: MG.sis.defOdds(FX[fx], `SC_${id}`) })) }));
      const k = Math.min(+d.scopen, its.length);
      MG.sis.openInBuilder(its, [k], 10);
      return;
    }
    save();
    MG.render();
  });
})();
