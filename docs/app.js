/* Wincere Multigol – interfaccia. I dati arrivano da data.js (creato da build.py). */
(function () {
  "use strict";
  const D = window.MG_DATA;
  const main = document.getElementById("main");
  const LG = D ? D.config.leagues : {};
  const MK = D ? D.mercati : {};
  const state = { tab: "bollette", metodo: "TUTTE", lg: null, statLg: null, team: null, sort: null, calMk: "MG13",
    camp: (() => { try { return localStorage.getItem("mg_camp") || "tutti"; } catch (e) { return "tutti"; } })() };

  // ---------- utilità ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (p, d = 0) => (p == null ? "–" : (p * 100).toFixed(d) + "%");
  const q2 = (x) => (x == null ? "–" : Number(x).toFixed(2));
  const eur = (x) => (x == null || !isFinite(x) ? "–" : x.toFixed(2) + " €");
  const lgName = (c) => (LG[c] ? LG[c].name : c);
  const gg = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  // Gli orari dei dati sono in ora inglese (Londra): li converto nell'ora del telefono (Italia).
  const LON = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  const ko = (iso, t) => {
    const [y, m, d] = iso.split("-").map(Number), [h, mi] = (t || "15:00").split(":").map(Number);
    const guess = Date.UTC(y, m - 1, d, h, mi);
    const p = Object.fromEntries(LON.formatToParts(guess).map((x) => [x.type, +x.value]));
    return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess);
  };
  const hm = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const fdate = (iso, t) => {
    const d = t ? new Date(ko(iso, t)) : new Date(iso + "T12:00:00");
    return `${gg[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}${t ? " " + hm(d) : ""}`;
  };
  // Partita già iniziata = non si può più giocare
  const started = (f) => !!(f && f.date) && ko(f.date, f.time) <= Date.now();
  const startedTag = (f) => (started(f) ? ` <span class="started">⏱ iniziata</span>` : "");
  const views = {};
  // Bollino colorato. Per i metodi (Raducioiu, Batistuta, ...) si apre una spiegazione:
  // ctx = la partita (oggetto con id) oppure l'elenco delle partite di una bolletta.
  const METODI = new Set(["RADUCIOIU", "BATISTUTA", "NO BET", "MULTIGOL"]);   // MARCATORI: bollino semplice
  const badge = (m, ctx) => {
    const cls = `badge b-${esc(String(m).replace(/\s/g, ""))}`;
    if (!METODI.has(m)) return `<span class="${cls}">${esc(m ?? "dati pochi")}</span>`;
    const ids = (Array.isArray(ctx) ? ctx : ctx ? [ctx] : []).map((x) => (typeof x === "string" ? x : x.fx || x.id)).filter(Boolean);
    return `<span class="${cls} tipme" tabindex="0" data-tip="${esc(m)}|${esc(ids.join(","))}">${esc(m)} ⓘ</span>`;
  };

  // ---------- spiegazione dei bollini ----------
  const FXI = D ? Object.fromEntries(D.partite.map((f) => [f.id, f])) : {};
  function tipHtml(m, ids) {
    const c = D.config, rmax = pct(c.metodo.raducioiu_max), bmin = pct(c.metodo.batistuta_min), nP = c.statistiche.partite_campione;
    const fxs = ids.map((id) => FXI[id]).filter((f) => f && f.est);
    const media = (f) => `${esc(f.home)} ${pct(f.est.bat_home)}, ${esc(f.away)} ${pct(f.est.bat_away)} → media <b>${pct(f.est.M)}</b>`;
    const G = {
      RADUCIOIU: [`<b>RADUCIOIU</b> – partita da pochi gol.`, `Media Batistuta fino al ${rmax}: le due squadre fanno raramente GG in un tempo.`, `Si gioca sul poco: Under 2.5, NG nei due tempi, risultati esatti bassi.`],
      BATISTUTA: [`<b>BATISTUTA</b> – partita da gol.`, `Media Batistuta dal ${bmin} in su: le due squadre fanno spesso GG in almeno un tempo.`, `Si gioca sul gol: GG in almeno un tempo (GG-GG / GG-NG / NG-GG), Over 2.5, Goal.`],
      "NO BET": [`<b>NO BET</b> – partita incerta.`, `Media Batistuta tra il ${rmax} e il ${bmin}: né Raducioiu né Batistuta.`, `Si valutano solo i consigli Multigol.`],
      MULTIGOL: [`<b>MULTIGOL</b> – fascia di gol.`, `Consiglio sulla fascia di gol (es. 1-3) più stretta che supera il ${pct(c.bollette.soglia_consiglio)} di probabilità.`],
    }[m];
    let h = `<div>${G[0]}</div>`;
    if (m === "MULTIGOL") {
      const tip = fxs.length === 1 && D.consigli.find((t) => t.fx === fxs[0].id);
      return h + `<div>${G[1]}</div>` + (tip ? `<div>Qui: <b>${esc(MK[tip.markets[0]])}</b> al ${pct(fxs[0].est.probs[tip.markets[0]])}.</div>` : "");
    }
    const why = `<div class="small" style="opacity:.85">"Media Batistuta" = quante volte, nelle ultime ${nP} partite di ciascuna squadra, c'è stato GG in almeno un tempo.</div>`;
    if (fxs.length === 1 && fxs[0].est.metodo === m && fxs[0].est.M != null) {
      const f = fxs[0], sopra = m === "RADUCIOIU" ? `pari o sotto la soglia del ${rmax}` : m === "BATISTUTA" ? `pari o sopra la soglia del ${bmin}` : `tra il ${rmax} e il ${bmin}`;
      return h + `<div>GG in almeno un tempo nelle ultime ${nP}: ${media(f)}, ${sopra}.</div><div>${G[2]}</div>` + why;
    }
    h += `<div>${G[1]}</div><div>${G[2]}</div>`;
    const withM = fxs.filter((f) => f.est.M != null);
    if (withM.length) h += `<div style="margin-top:4px">In questa bolletta:</div>` + withM.map((f) => `<div class="small">• ${media(f)}</div>`).join("");
    return h + why;
  }
  const tipBox = document.createElement("div");
  tipBox.className = "tipbox";
  tipBox.hidden = true;
  document.body.appendChild(tipBox);
  let tipEl = null;
  function showTip(el) {
    const [m, ids] = el.dataset.tip.split("|");
    tipBox.innerHTML = tipHtml(m, ids ? ids.split(",") : []);
    tipBox.hidden = false;
    tipEl = el;
    const r = el.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 16);
    tipBox.style.width = w + "px";
    tipBox.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + window.scrollX + "px";
    const below = r.bottom + 6, hgt = tipBox.offsetHeight;
    tipBox.style.top = (below + hgt > window.innerHeight && r.top > hgt + 6 ? r.top - hgt - 6 : below) + window.scrollY + "px";
  }
  const hideTip = () => { tipBox.hidden = true; tipEl = null; };
  // PC: si apre passando con il mouse
  document.addEventListener("mouseover", (e) => {
    if (!D || !matchMedia("(hover: hover)").matches) return;
    const el = e.target.closest(".tipme");
    if (el && el !== tipEl) showTip(el);
    else if (!el && tipEl && !e.target.closest(".tipbox")) hideTip();
  });
  // telefono: si apre toccando (e non apre/chiude la scheda sotto)
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".tipme");
    if (el) { e.preventDefault(); e.stopPropagation(); if (el === tipEl && !matchMedia("(hover: hover)").matches) hideTip(); else showTip(el); return; }
    if (tipEl && !e.target.closest(".tipbox")) hideTip();
  }, true);
  window.addEventListener("scroll", () => { if (tipEl) hideTip(); }, { passive: true });

  if (!D) { main.innerHTML = `<div class="empty">Dati non trovati. Esegui <b>python build.py</b>.</div>`; return; }
  document.getElementById("upd").innerHTML = `Stagione ${esc(D.stagione)}<br>agg. ${esc(D.aggiornato)}`;

  document.getElementById("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.tab = b.dataset.tab;
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
    render(); window.scrollTo(0, 0);
  });
  main.addEventListener("click", (e) => {
    const c = e.target.closest("[data-set]"); if (!c) return;
    const [k, v] = c.dataset.set.split("=");
    state[k] = v === "" ? null : v;
    if (k === "statLg") state.team = null;
    render();
  });

  function chips(key, items) {
    return `<div class="chips">${items.map(([v, l]) => `<button class="chip ${String(state[key]) === String(v) ? "on" : ""}" data-set="${key}=${esc(v)}">${esc(l)}</button>`).join("")}</div>`;
  }

  // ---------- campionati affidabili ----------
  // due tabelle: stagioni passate (quella provata nei test) e stagione in corso (si rifà a ogni aggiornamento)
  const REL = (D.backtest && D.backtest.affidabilita) || { tabella: [], nomi: {} };
  const RELC = D.affidabilita_stagione || { tabella: [], nomi: REL.nomi };
  const relOn = D.config.affidabilita && D.config.affidabilita.attiva;
  const findRel = (T, lg, tipo) => T.tabella.find((r) => r.lg === lg && r.tipo === tipo);
  const relOf = (lg, tipo) => findRel(REL, lg, tipo);
  const exOf = (T) => (relOn ? T.tabella.filter((r) => r.stato === "escluso") : []);
  const esclusi = exOf(REL), esclusiC = exOf(RELC);
  const activeRel = () => (state.camp === "stagione" ? RELC : REL);
  const DOVE = { affidabili: "nelle ultime stagioni", stagione: "in questa stagione" };
  // serie di bollette scelta: tutti i campionati, affidabili nelle stagioni passate, affidabili quest'anno
  const inSet = (s) => (s.set || ["tutti"]).includes(state.camp);
  const campChips = () => (esclusi.length || esclusiC.length ? `<div class="chips">${[["tutti", "Tutti i campionati"], ["affidabili", "✔ Affidabili (stagioni passate)"], ["stagione", "📅 Affidabili quest'anno"]].map(([v, l]) =>
    `<button class="chip ${state.camp === v ? "on" : ""}" data-set="camp=${v}">${l}</button>`).join("")}</div>` : "");
  const listEx = (ex) => Object.entries(ex.reduce((o, r) => ((o[REL.nomi[r.tipo] || r.tipo] = o[REL.nomi[r.tipo] || r.tipo] || []).push(lgName(r.lg)), o), {})).map(([t, l]) => `<b>${esc(t)}</b> in ${esc(l.join(", "))}`).join(" · ");
  const relNote = () => {
    if (!esclusi.length && !esclusiC.length) return "";
    const box = (h) => `<div class="small muted" style="margin:-4px 4px 10px">${h}</div>`;
    if (state.camp === "tutti") return box(`Accanto a ogni partita (secondo le stagioni passate): <span class="rel-s rel-ok">✔</span> campionato affidabile per quella giocata, <span class="rel-s rel-attenzione">⚠</span> un po' sotto il previsto, <span class="rel-s rel-escluso">✘</span> poco affidabile. Dettagli nella scheda Verifica.`);
    const ex = state.camp === "stagione" ? esclusiC : esclusi;
    return box(`${ex.length ? `Bollette senza le giocate nei campionati che ${DOVE[state.camp]} escono meno del previsto: ${listEx(ex)}.` : `Nessun campionato escluso ${DOVE[state.camp]}: le bollette sono quelle di sempre.`}
      ${state.camp === "stagione" ? `<br><b>Attenzione:</b> nei test sulle stagioni passate, scegliere i campionati con la sola stagione in corso non ha migliorato le bollette (con poche giornate pesa molto il caso). La scelta più provata è "Affidabili (stagioni passate)".` : ""} Dettagli nella scheda Verifica.`);
  };
  // segno di affidabilità del campionato per la giocata (secondo la tabella della scelta attiva)
  const tipoOf = (mks) => { const m = mks[0]; return /^MG/.test(m) ? "MULTIGOL" : m === "RAD" ? "NGNG" : m === "U25" ? "UNDER" : ["BAT", "GGGG", "GGNG", "NGGG"].includes(m) ? "BATISTUTA" : null; };
  const relSign = (pk) => {
    const T = activeRel(), t = tipoOf(pk.markets), r = t && findRel(T, pk.lg, t);
    if (!r || r.stato === "pochi") return "";
    const L = { ok: ["✔", "campionato affidabile"], attenzione: ["⚠", "un po' sotto il previsto"], escluso: ["✘", "campionato poco affidabile"] }[r.stato];
    return ` <span class="rel-s rel-${r.stato}" title="${esc(REL.nomi[t])}: ${L[1]} (${r.uscita - r.attesa >= 0 ? "+" : ""}${((r.uscita - r.attesa) * 100).toFixed(1)} punti ${T === RELC ? "in questa stagione" : "nelle stagioni passate"})">${L[0]}</span>`;
  };
  // avviso sulla partita (scheda Partite): per quali giocate il campionato è escluso o da tenere d'occhio
  const relTag = (f) => {
    const rs = REL.tabella.filter((r) => r.lg === f.lg && (r.stato === "escluso" || r.stato === "attenzione"));
    return rs.length ? ` · <span class="${rs.some((r) => r.stato === "escluso") ? "esito-L" : "muted"}">⚠ ${rs.map((r) => `${esc(REL.nomi[r.tipo] || r.tipo)} ${r.stato === "escluso" ? "escluso" : "attenzione"}`).join(", ")}</span>` : "";
  };
  function relGrid(T) {
    const tipi = Object.keys(REL.nomi), lgs = [...new Set(T.tabella.map((r) => r.lg))];
    const ICO = { ok: "✔", attenzione: "⚠", escluso: "✘", pochi: "·" };
    const cell = (r) => (r ? `<td class="rel-${r.stato}" title="${r.n} partite · uscita ${pct(r.uscita)} · attesa ${pct(r.attesa)}">${ICO[r.stato]} ${r.uscita != null && r.stato !== "pochi" ? `${r.uscita - r.attesa >= 0 ? "+" : ""}${((r.uscita - r.attesa) * 100).toFixed(1)}` : ""}</td>` : "<td>–</td>");
    const sc = (lg) => Math.min(...tipi.map((t) => (findRel(T, lg, t) || {}).z ?? 9));
    return `<div class="tw"><table><tr><th>Campionato</th>${tipi.map((t) => `<th>${esc(REL.nomi[t])}</th>`).join("")}</tr>
      ${lgs.sort((a, b) => sc(a) - sc(b)).map((lg) => `<tr><td>${esc(lgName(lg))}</td>${tipi.map((t) => cell(findRel(T, lg, t))).join("")}</tr>`).join("")}</table></div>`;
  }
  function relTable() {
    if (!REL.tabella.length) return "";
    const P = REL.prova;
    return `<h2>Campionati affidabili</h2>
      <div class="note">Per ogni campionato e tipo di giocata: quanti punti percentuali la giocata è uscita sopra (+) o sotto (−) quanto stimato nelle ultime ${D.backtest.stagioni.length} stagioni.
      <b>✘ escluso</b> = esce chiaramente meno del previsto: ${relOn ? `tolto dalle bollette con la scelta "Affidabili (stagioni passate)"` : "non tolto (opzione spenta)"}. <b>⚠ attenzione</b> = un po' sotto, resta nelle bollette. <b>·</b> = troppe poche partite per giudicare (Batistuta sempre).
      ${P ? `<br>Prova: decidendo con le stagioni prima del ${esc("20" + P.stagione.slice(0, 2) + "/" + P.stagione.slice(2))}, in quella stagione gli esclusi sono usciti il ${pct(P.esclusi.uscita, 1)} contro il ${pct(P.esclusi.attesa, 1)} stimato, i tenuti il ${pct(P.tenuti.uscita, 1)} contro il ${pct(P.tenuti.attesa, 1)}.` : ""}</div>
      ${relGrid(REL)}
      ${RELC.tabella.length ? `<h2>Campionati affidabili quest'anno</h2>
      <div class="note">Stessa tabella con le sole partite giocate in questa stagione: è quella usata dalla scelta "📅 Affidabili quest'anno". Con poche giornate i numeri cambiano molto: nei test sulle stagioni passate non ha migliorato le bollette.</div>
      ${relGrid(RELC)}` : ""}`;
  }

  // ---------- bollette ----------
  // risultato in diretta / finale della giocata (dalla scheda Live), se la partita è iniziata
  const liveJ = (pk) => (MG.liveJ && !pk.esito ? MG.liveJ(pk, pk.markets) : null);
  function pickHtml(pk) {
    const es = pk.esito ? ` <span class="esito-${pk.esito}">${pk.esito === "W" ? "✔" : pk.esito === "L" ? "✘" : "annullata"}${pk.score ? " " + esc(pk.score) : ""}</span>` : "";
    const tag = !pk.esito && MG.liveTag ? MG.liveTag(pk, pk.markets) : "";
    const j = pk.esito === "W" || pk.esito === "L" ? pk.esito : liveJ(pk);
    const go = !pk.esito && !tag && started(pk);
    return `<div class="pick${go ? " gone" : ""}${j ? " lvp-" + j : ""}">
      <div><div class="m">${esc(pk.home)} – ${esc(pk.away)}${relSign(pk)}${go ? startedTag(pk) : ""}${tag}</div>
        <div class="small muted">${esc(lgName(pk.lg))} · ${fdate(pk.date, pk.time)}</div></div>
      <div class="r"><div class="w">${esc(pk.name)}${es}</div>
        <div class="small muted">${pct(pk.p)} · quota min ${q2(pk.min_odds)}${pk.real ? " · media bookmaker " + q2(pk.real) : ""}</div></div>
      ${MG.formPick && !pk.esito ? `<div style="grid-column:1/-1">${MG.formPick(pk)}</div>` : ""}
      ${MG.quoteHtml ? `<div style="grid-column:1/-1">${MG.quoteHtml(pk)}</div>` : ""}
    </div>`;
  }
  // stato della bolletta della settimana dai risultati: persa appena una giocata è persa, vinta quando sono vinte tutte
  function liveStatus(s) {
    const js = s.picks.map(liveJ);
    if (s.min_ok) {   // sistema a correzione: vinta con almeno min_ok giocate prese
      const w = js.filter((j) => j === "W").length, l = js.filter((j) => j === "L").length;
      if (s.picks.length - l < s.min_ok) return badge("PERSA") + " ";
      if (w >= s.min_ok && js.every((j) => j === "W" || j === "L")) return badge("VINTA") + " ";
      return js.some((j) => j) ? badge("IN CORSO") + " " : "";
    }
    if (js.includes("L")) return badge("PERSA") + " ";
    if (js.every((j) => j === "W")) return badge("VINTA") + " ";
    if (js.some((j) => j)) return badge("IN CORSO") + " ";
    return "";
  }
  function slipHtml(s, withStatus) {
    const stake = D.config.bollette.puntata;
    const perCol = s.combos ? ` · ${s.combos} colonne da ${eur(stake / s.combos)}` : "";
    return `<div class="card">
      <div class="row" style="margin:0 0 4px">${badge(s.method, s.picks)} ${!withStatus ? liveStatus(s) : ""}${withStatus ? badge(s.status) + (s.live ? ` <span class="small muted" title="Risultato preso dal live: verrà confermato con l'aggiornamento">· live</span>` : "") : ""}
        <h3 style="margin:0">${esc(s.title)}</h3></div>
      ${s.descr ? `<div class="small muted">${esc(s.descr)}</div>` : ""}
      ${!withStatus && s.picks.some(started) && !s.picks.some(liveJ) ? `<div class="gonenote">⏱ Una o più partite sono già iniziate: questa bolletta non si può più giocare così com'è.</div>` : ""}
      ${s.picks.map(pickHtml).join("")}
      <div class="tot">
        <span>Probabilità <b>${pct(s.prob)}</b></span>
        <span>Quota equa <b>${q2(s.fair)}</b></span>
        ${s.real ? `<span>Quota bookmaker <b>${q2(s.real)}</b></span>` : ""}
        <span>Puntata <b>${eur(stake)}</b>${perCol}</span>
        ${!withStatus && MG.quoteSlip ? MG.quoteSlip(s) : ""}
        ${!withStatus ? `<button class="btn small" data-slip="${esc(s.id)}">Apri come sistema</button>` : ""}
        ${window.MG && MG.giocBtn ? MG.giocBtn(s) : ""}
        ${s.profit != null ? `<span>Utile <b class="${s.profit >= 0 ? "esito-W" : "esito-L"}">${eur(s.profit)}</b></span>` : ""}
      </div></div>`;
  }
  function viewBollette() {
    let list = D.bollette.filter(inSet);
    if (state.metodo !== "TUTTE") list = list.filter((s) => s.method === state.metodo);
    const nOk = D.partite.filter((f) => f.ok).length;
    return `<div class="note">Bollette per le partite dal ${fdate(D.oggi)} ai 7 giorni successivi (${nOk} partite analizzabili su ${D.partite.length}).
      Le percentuali sono già corrette con quello che è uscito davvero nelle stagioni passate.
      <b>Gioca solo se la quota del bookmaker è uguale o più alta della "quota min".</b></div>
      ${campChips()}
      ${chips("metodo", [["TUTTE", "Tutte"], ["MULTIGOL", "Multigol"], ["BATISTUTA", "Batistuta"], ["RADUCIOIU", "Raducioiu"], ["MARCATORI", "Marcatori"]])}
      ${relNote()}
      ${list.length ? list.map((s) => slipHtml(s, false)).join("") : `<div class="empty">Nessuna bolletta per ora.<br>Il calendario del fine settimana di solito esce il venerdì.</div>`}`;
  }

  // ---------- partite ----------
  const SHOW = ["MG12", "MG13", "MG14", "MG23", "MG24", "MG25", "MG35", "MG45", "O15", "O25", "U25", "U35", "GG", "NG", "BAT", "RAD", "GGGG", "GGNG", "NGGG", "RE_C", "RE_O", "RE_X"];
  function viewPartite() {
    const lgs = [...new Set(D.partite.map((f) => f.lg))];
    let list = D.partite;
    if (state.lg) list = list.filter((f) => f.lg === state.lg);
    const tip = Object.fromEntries(D.consigli.map((t) => [t.fx, t.markets[0]]));
    return `${chips("lg", [["", "Tutti"], ...lgs.map((l) => [l, lgName(l)])])}
      ${list.length ? list.map((f) => {
        const e = f.est;
        const rows = SHOW.filter((m) => e.probs[m] != null).map((m) => `<tr class="${tip[f.id] === m ? "hi" : ""}"><td>${esc(MK[m])}</td><td>${pct(e.probs[m])}</td><td class="lo">${pct(e.raw[m])}</td><td>${q2(1 / e.probs[m])}</td></tr>`).join("");
        return `<details class="card${started(f) ? " gone" : ""}"><summary>
          <div class="row" style="margin:0"><b>${esc(f.home)} – ${esc(f.away)}</b>${startedTag(f)}</div>
          <div class="small muted">${esc(lgName(f.lg))} · ${fdate(f.date, f.time)} · ${f.ok ? badge(e.metodo, f) + (e.M != null ? ` media Batistuta ${pct(e.M)}` : "") : "poche partite giocate, esclusa dalle bollette"}
          ${tip[f.id] ? ` · consiglio <b>${esc(MK[tip[f.id]])}</b>` : ""}${relTag(f)}</div></summary>
          <div class="tw" style="margin-top:8px"><table><tr><th>Mercato</th><th>% corretta</th><th>% Excel</th><th>Quota equa</th></tr>${rows}</table></div>
          <div class="small muted" style="margin-top:6px">"% Excel" è il calcolo diretto del tuo metodo (media delle due squadre). "% corretta" è quanto è uscito davvero in passato con quella stima.
          Partite giocate: casa ${e.games_home}, ospite ${e.games_away}.</div>
        </details>`;
      }).join("") : `<div class="empty">Nessuna partita in calendario nei prossimi 7 giorni.</div>`}`;
  }

  // ---------- statistiche ----------
  function seqHtml(seq, kind) {
    return `<div class="seq">${seq.map((c) => c == null ? `<span class="cn">?</span>` : `<span class="c${c}">${kind === "mg" ? ["0", "1-2", "4-5", "3", "6+"][c] : c}</span>`).join("")}</div>`;
  }
  function viewStatistiche() {
    const lgs = Object.keys(D.statistiche);
    if (!state.statLg || !D.statistiche[state.statLg]) state.statLg = lgs[0];
    const S = D.statistiche[state.statLg];
    const r = S.riepilogo;
    const k = (v, l) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`;
    const cols = [
      ["team", "Squadra"], ["g", "G"], ["mg.0-0", "0-0"], ["mg.1-2", "1-2"], ["mg.3", "3"], ["mg.4-5", "4-5"], ["mg.6+", "6+"],
      ["mg13", "MG 1-3"], ["bat", "Batistuta"], ["bat_casa", "Bat casa"], ["bat_fuori", "Bat fuori"], ["gf", "Gol fatti"], ["gs", "Gol subiti"],
    ];
    const get = (row, key) => key.split(".").reduce((o, x) => (o ? o[x] : null), row);
    let rows = [...S.squadre];
    if (state.sort) { const s = state.sort; rows.sort((a, b) => (s === "team" ? String(a.team).localeCompare(b.team) : (get(b, s) ?? -1) - (get(a, s) ?? -1))); }
    const team = rows.find((t) => t.team === state.team);
    return `<div class="row"><select id="selLg">${lgs.map((l) => `<option value="${esc(l)}" ${l === state.statLg ? "selected" : ""}>${esc(lgName(l))}</option>`).join("")}</select></div>
      <div class="grid2">${k(r.partite, "partite giocate")}${k(r.media_gol, "media gol")}${k(pct(r.mg13), "Multigol 1-3")}${k(pct(r.o25), "Over 2.5")}${k(pct(r.gg), "Goal")}
      ${r.raducioiu != null ? k(pct(r.raducioiu), "Raducioiu (NG-NG tempi)") + k(pct(r.bat_1t), "GG solo 1°T") + k(pct(r.bat_2t), "GG solo 2°T") + k(pct(r.bat_entrambi), "GG entrambi i tempi") : ""}</div>
      <h2>Squadre <span class="small muted">(tocca una colonna per ordinare, una squadra per il dettaglio)</span></h2>
      <div class="tw"><table><tr>${cols.map(([c, l]) => `<th data-set="sort=${c}">${l}</th>`).join("")}</tr>
      ${rows.map((t) => `<tr class="click ${t.team === state.team ? "hi" : ""}" data-set="team=${esc(t.team)}">${cols.map(([c]) => {
        const v = get(t, c);
        return `<td>${c === "team" ? esc(v) : c === "g" || c === "gf" || c === "gs" ? (v ?? "–") : pct(v)}</td>`;
      }).join("")}</tr>`).join("")}</table></div>
      ${team ? `<div class="card" style="margin-top:10px"><h3>${esc(team.team)}</h3>
        <div class="small muted">Multigol per giornata (come il foglio "Eventi GG-NG" del file MULTIGOL)</div>${seqHtml(team.seq_mg, "mg")}
        ${team.bat != null ? `<div class="small muted" style="margin-top:8px">Codici TOP: 0 = nessun tempo con GG · 1 = GG nel 1°T · 2 = GG nel 2°T · 3 = GG in entrambi</div>${seqHtml(team.seq_top, "top")}` : `<div class="small muted" style="margin-top:8px">Per questo campionato non c'è il risultato del primo tempo.</div>`}
      </div>` : ""}`;
  }

  // ---------- storico ----------
  function viewStorico() {
    const h = D.storico.filter(inSet).reverse();
    const c = (st) => h.filter((s) => s.status === st).length;
    // riepilogo per metodo della serie scelta
    const sum = {};
    h.forEach((s) => {
      if (s.status !== "VINTA" && s.status !== "PERSA") return;
      const r = (sum[`${s.method} – ${s.kind}`] = sum[`${s.method} – ${s.kind}`] || { n: 0, vinte: 0, p: 0, n_quote: 0, utile: 0 });
      r.n++; r.vinte += s.status === "VINTA"; r.p += s.prob;
      if (s.profit != null) { r.n_quote++; r.utile += s.profit; }
      r.perc = r.vinte / r.n; r.p_attesa = r.p / r.n;
    });
    const k = (v, l) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`;
    const keys = Object.keys(sum);
    return `${campChips()}<div class="grid2">${k(h.length, "bollette create")}${k(c("VINTA"), "vinte")}${k(c("PERSA"), "perse")}${k(c("IN CORSO"), "in corso")}</div>
      ${keys.length ? `<h2>Risultati per metodo</h2><div class="tw"><table><tr><th>Metodo</th><th>Giocate</th><th>Vinte</th><th>% uscita</th><th>% attesa</th><th>Utile*</th></tr>
      ${keys.map((x) => `<tr><td>${esc(x)}</td><td>${sum[x].n}</td><td>${sum[x].vinte}</td><td>${pct(sum[x].perc)}</td><td>${pct(sum[x].p_attesa)}</td><td>${sum[x].n_quote ? eur(sum[x].utile) : "–"}</td></tr>`).join("")}
      </table></div><div class="small muted" style="margin:6px 4px">* utile calcolato solo dove c'è la quota vera del bookmaker (Under/Over 2.5), con ${eur(D.config.bollette.puntata)} a bolletta.</div>` : ""}
      <h2>Tutte le bollette</h2>
      ${h.length ? h.map((s) => `<details><summary class="card" style="list-style:none">${badge(s.status)} ${badge(s.method, s.picks)} <b>${esc(s.title)}</b>
        <div class="small muted">creata ${fdate(s.created)} · prob. ${pct(s.prob)} · quota ${q2(s.real || s.fair)}</div></summary>${slipHtml(s, true)}</details>`).join("") : `<div class="empty">Ancora nessuna bolletta.</div>`}`;
  }

  // ---------- verifica (backtest) ----------
  function viewVerifica() {
    const B = D.backtest;
    const st = B.strategie;
    const nice = { RAD: "NG-NG tempi", BAT: "Batistuta", U25: "Under 2.5", O25: "Over 2.5", NG: "No Goal", GG: "Goal", O15: "Over 1.5", MG13: "MG 1-3" };
    const mks = Object.keys(B.calibrazione).filter((m) => B.calibrazione[m].length);
    const cal = B.calibrazione[state.calMk] || [];
    return `<div class="note">Qui l'app rifà il tuo metodo giornata per giornata sulle stagioni ${B.stagioni.map((s) => "20" + s.slice(0, 2) + "/" + s.slice(2)).join(" e ")},
      usando solo le partite già giocate fino a quel momento. Serve a capire se e quanto il metodo funziona davvero.</div>
      <h2>Giocate con le quote vere dei bookmaker</h2>
      <div class="tw"><table><tr><th>Strategia</th><th>Giocate</th><th>% vinte</th><th>Resa per 1 € puntato</th></tr>
      ${Object.entries(st).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${pct(v.perc, 1)}</td><td class="${v.roi >= 0 ? "esito-W" : "esito-L"}">${v.roi >= 0 ? "+" : ""}${pct(v.roi, 1)}</td></tr>`).join("")}
      </table></div>
      <div class="small muted" style="margin:6px 4px">Una resa negativa vuol dire che, giocando sempre quella strategia, alla lunga si perde quella percentuale di quanto puntato.</div>
      <h2>Consigli Multigol (fascia più stretta sopra la soglia)</h2>
      <div class="grid2"><div class="kpi"><div class="v">${B.consigli_multigol.n}</div><div class="l">consigli nel test</div></div>
      <div class="kpi"><div class="v">${pct(B.consigli_multigol.p_attesa)}</div><div class="l">% stimata col metodo Excel</div></div>
      <div class="kpi"><div class="v">${pct(B.consigli_multigol.perc)}</div><div class="l">% uscita davvero</div></div></div>
      <h2>Fasce di media Batistuta (come il foglio "Sviluppo")</h2>
      <div class="tw"><table><tr><th>Media Batistuta</th><th>Partite</th>${Object.values(nice).map((n) => `<th>${n}</th>`).join("")}</tr>
      ${B.fasce_M.map((f) => `<tr><td>${esc(f.fascia)}</td><td>${f.n}</td>${Object.keys(nice).map((m) => `<td>${pct(f[m])}</td>`).join("")}</tr>`).join("")}
      </table></div>
      ${relTable()}
      <h2>Stima del metodo contro uscita reale</h2>
      <div class="row"><select id="selCal">${mks.map((m) => `<option value="${m}" ${m === state.calMk ? "selected" : ""}>${esc(MK[m])}</option>`).join("")}</select></div>
      <div class="tw"><table><tr><th>Stima Excel</th><th>Partite</th><th>Uscita reale</th><th></th></tr>
      ${cal.map((c) => `<tr><td>${esc(c.fascia)}</td><td>${c.n}</td><td>${pct(c.perc)}</td><td style="width:40%"><div class="bar"><i style="width:${c.perc * 100}%"></i></div></td></tr>`).join("")}
      </table></div>`;
  }

  // ---------- calcolatori ----------
  function viewCalcolatori() {
    return `
    <div class="card calc"><h3>Giocata su vincita</h3>
      <label>Quota</label><input id="v_q" type="number" step="0.01" value="1.20">
      <label>Quanto vuoi vincere (€)</label><input id="v_w" type="number" value="50">
      <div class="out" id="v_out"></div></div>
    <div class="card calc"><h3>Giocata su utile</h3>
      <label>Quota</label><input id="u_q" type="number" step="0.01" value="1.57">
      <label>Quanto utile vuoi (€)</label><input id="u_u" type="number" value="30">
      <div class="out" id="u_out"></div></div>
    <div class="card calc"><h3>Contabilizzatore (stessa vincita su più esiti)</h3>
      <div class="small muted">Es. Batistuta: GG-GG, GG-NG, NG-GG. Oppure risultati esatti a gruppi.</div>
      <label>Quote degli esiti (separate da virgola)</label><input id="c_q" style="width:100%" value="15, 6, 3.75">
      <label>Quanto vuoi vincere (€)</label><input id="c_w" type="number" value="40">
      <div class="out" id="c_out"></div></div>
    <div class="card calc"><h3>Sistema (più partite × più combinazioni)</h3>
      <div class="small muted">Una riga per partita con le quote delle combinazioni. Es. Sistema Batistuta 2×3.</div>
      <label>Quote</label><textarea id="s_q" rows="3" style="width:100%;font:inherit;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink)">13, 6, 3.6
12, 6, 3.4</textarea>
      <label>Totale da giocare (€)</label><input id="s_t" type="number" value="20.25">
      <div class="out" id="s_out"></div></div>
    <div class="card calc"><h3>Multipla a raddoppio (reinvesti la vincita)</h3>
      <label>Importo iniziale (€)</label><input id="r_i" type="number" value="20">
      <label>Quote delle giocate in sequenza</label><input id="r_q" style="width:100%" value="1.68, 1.53, 1.53, 1.65, 1.7">
      <div class="out" id="r_out"></div></div>`;
  }
  const nums = (s) => String(s).split(/[,;\s]+/).map((x) => parseFloat(x.replace(",", "."))).filter((x) => x > 1);
  const val = (id) => parseFloat(document.getElementById(id).value);
  function calc() {
    const set = (id, h) => (document.getElementById(id).innerHTML = h);
    let q = val("v_q"), w = val("v_w");
    set("v_out", q > 1 ? `Gioca <b>${eur(w / q)}</b> · utile ${eur(w - w / q)} (${pct((w - w / q) / (w / q), 1)})` : "");
    q = val("u_q"); const u = val("u_u");
    set("u_out", q > 1 ? `Gioca <b>${eur(u / (q - 1))}</b> · vincita ${eur(u + u / (q - 1))}` : "");
    const qs = nums(document.getElementById("c_q").value); w = val("c_w");
    if (qs.length) {
      const st = qs.map((x) => w / x), tot = st.reduce((a, b) => a + b, 0);
      set("c_out", qs.map((x, i) => `Esito ${i + 1} (quota ${q2(x)}): gioca <b>${eur(st[i])}</b>`).join("<br>") +
        `<br>Totale giocato <b>${eur(tot)}</b> · utile netto <b class="${w - tot >= 0 ? "esito-W" : "esito-L"}">${eur(w - tot)}</b> (${pct((w - tot) / tot, 1)})` +
        `<br><span class="small muted">Quota complessiva ${q2(w / tot)} – se è sotto 1.00 la giocata è in perdita sicura.</span>`);
    } else set("c_out", "");
    const lines = document.getElementById("s_q").value.split("\n").map(nums).filter((l) => l.length);
    const T = val("s_t");
    if (lines.length) {
      let combos = [1];
      lines.forEach((l) => { combos = combos.flatMap((c) => l.map((x) => c * x)); });
      const per = T / combos.length, wins = combos.map((c) => c * per);
      const mn = Math.min(...wins), mx = Math.max(...wins), av = wins.reduce((a, b) => a + b, 0) / wins.length;
      set("s_out", `<b>${combos.length}</b> colonne da <b>${eur(per)}</b><br>Vincita min ${eur(mn)} · media ${eur(av)} · max ${eur(mx)}<br>Utile min <b class="${mn - T >= 0 ? "esito-W" : "esito-L"}">${eur(mn - T)}</b> · max ${eur(mx - T)}`);
    }
    let imp = val("r_i"); const rq = nums(document.getElementById("r_q").value);
    if (rq.length) {
      const start = imp;
      set("r_out", rq.map((x, i) => { const v = imp * x; const r = `Passo ${i + 1}: gioca ${eur(imp)} a ${q2(x)} → ${eur(v)}`; imp = v; return r; }).join("<br>") +
        `<br>Se le vinci tutte: utile <b class="esito-W">${eur(imp - start)}</b>. Se ne perdi una perdi ${eur(start)}.`);
    }
  }

  // ---------- render ----------
  function render() {
    try { localStorage.setItem("mg_camp", state.camp); } catch (e) { /* niente */ }
    const v = Object.assign({ bollette: viewBollette, partite: viewPartite, statistiche: viewStatistiche, storico: viewStorico, verifica: viewVerifica, calcolatori: viewCalcolatori }, views)[state.tab];
    main.innerHTML = v();
    if (views.after) views.after(state.tab);
    const sl = document.getElementById("selLg");
    if (sl) sl.onchange = () => { state.statLg = sl.value; state.team = null; state.sort = null; render(); };
    const sc = document.getElementById("selCal");
    if (sc) sc.onchange = () => { state.calMk = sc.value; render(); };
    if (state.tab === "calcolatori") { main.querySelectorAll("input,textarea").forEach((i) => (i.oninput = calc)); calc(); }
  }
  window.MG = { D, state, views, inSet, campChips, esc, pct, q2, eur, lgName, fdate, badge, render, ko, hm, started, startedTag,
    goTab(t) { state.tab = t; document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === t)); render(); window.scrollTo(0, 0); } };
  document.addEventListener("DOMContentLoaded", render);

  // ---------- versione nuova online? ricarico da solo ----------
  // il telefono tiene in memoria la pagina per un po': se online c'è una versione più nuova la riapro con un indirizzo nuovo
  function checkVersion() {
    const mine = (document.querySelector('meta[name="mg-ver"]') || {}).content;
    if (!mine || location.protocol === "file:") return;
    fetch(`version.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!j.v || j.v === mine) return;
      let tried = null;
      try { tried = sessionStorage.getItem("mg_reload"); sessionStorage.setItem("mg_reload", j.v); } catch (e) { /* niente */ }
      if (tried !== j.v) location.replace(`${location.pathname}?v=${j.v}${location.hash}`);
    }).catch(() => {});
  }
  checkVersion();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkVersion(); });
})();
