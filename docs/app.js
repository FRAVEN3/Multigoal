/* Wincere Multigol – interfaccia. I dati arrivano da data.js (creato da build.py). */
(function () {
  "use strict";
  const D = window.MG_DATA;
  const main = document.getElementById("main");
  const LG = D ? D.config.leagues : {};
  const MK = D ? D.mercati : {};
  const state = { tab: "bollette", metodo: "TUTTE", lg: null, statLg: null, team: null, sort: null, calMk: "MG13" };

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
  const badge = (m) => `<span class="badge b-${esc(String(m).replace(/\s/g, ""))}">${esc(m ?? "dati pochi")}</span>`;

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

  // ---------- bollette ----------
  function pickHtml(pk) {
    const es = pk.esito ? ` <span class="esito-${pk.esito}">${pk.esito === "W" ? "✔" : pk.esito === "L" ? "✘" : "annullata"}${pk.score ? " " + esc(pk.score) : ""}</span>` : "";
    const go = !pk.esito && started(pk);
    return `<div class="pick${go ? " gone" : ""}">
      <div><div class="m">${esc(pk.home)} – ${esc(pk.away)}${go ? startedTag(pk) : ""}</div>
        <div class="small muted">${esc(lgName(pk.lg))} · ${fdate(pk.date, pk.time)}</div></div>
      <div class="r"><div class="w">${esc(pk.name)}${es}</div>
        <div class="small muted">${pct(pk.p)} · quota min ${q2(pk.min_odds)}${pk.real ? " · bookmaker " + q2(pk.real) : ""}</div></div>
    </div>`;
  }
  function slipHtml(s, withStatus) {
    const stake = D.config.bollette.puntata;
    const perCol = s.combos ? ` · ${s.combos} colonne da ${eur(stake / s.combos)}` : "";
    return `<div class="card">
      <div class="row" style="margin:0 0 4px">${badge(s.method)} ${withStatus ? badge(s.status) : ""}
        <h3 style="margin:0">${esc(s.title)}</h3></div>
      ${s.descr ? `<div class="small muted">${esc(s.descr)}</div>` : ""}
      ${!withStatus && s.picks.some(started) ? `<div class="gonenote">⏱ Una o più partite sono già iniziate: questa bolletta non si può più giocare così com'è.</div>` : ""}
      ${s.picks.map(pickHtml).join("")}
      <div class="tot">
        <span>Probabilità <b>${pct(s.prob)}</b></span>
        <span>Quota equa <b>${q2(s.fair)}</b></span>
        ${s.real ? `<span>Quota bookmaker <b>${q2(s.real)}</b></span>` : ""}
        <span>Puntata <b>${eur(stake)}</b>${perCol}</span>
        ${!withStatus ? `<button class="btn small" data-slip="${esc(s.id)}">Apri come sistema</button>` : ""}
        ${s.profit != null ? `<span>Utile <b class="${s.profit >= 0 ? "esito-W" : "esito-L"}">${eur(s.profit)}</b></span>` : ""}
      </div></div>`;
  }
  function viewBollette() {
    let list = D.bollette;
    if (state.metodo !== "TUTTE") list = list.filter((s) => s.method === state.metodo);
    const nOk = D.partite.filter((f) => f.ok).length;
    return `<div class="note">Bollette per le partite dal ${fdate(D.oggi)} ai 7 giorni successivi (${nOk} partite analizzabili su ${D.partite.length}).
      Le percentuali sono già corrette con quello che è uscito davvero nelle stagioni passate.
      <b>Gioca solo se la quota del bookmaker è uguale o più alta della "quota min".</b></div>
      ${chips("metodo", [["TUTTE", "Tutte"], ["MULTIGOL", "Multigol"], ["BATISTUTA", "Batistuta"], ["RADUCIOIU", "Raducioiu"]])}
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
          <div class="small muted">${esc(lgName(f.lg))} · ${fdate(f.date, f.time)} · ${f.ok ? badge(e.metodo) + (e.M != null ? ` media Batistuta ${pct(e.M)}` : "") : "poche partite giocate, esclusa dalle bollette"}
          ${tip[f.id] ? ` · consiglio <b>${esc(MK[tip[f.id]])}</b>` : ""}</div></summary>
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
    const h = [...D.storico].reverse();
    const c = (st) => h.filter((s) => s.status === st).length;
    const sum = D.storico_riepilogo;
    const k = (v, l) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`;
    const keys = Object.keys(sum);
    return `<div class="grid2">${k(h.length, "bollette create")}${k(c("VINTA"), "vinte")}${k(c("PERSA"), "perse")}${k(c("IN CORSO"), "in corso")}</div>
      ${keys.length ? `<h2>Risultati per metodo</h2><div class="tw"><table><tr><th>Metodo</th><th>Giocate</th><th>Vinte</th><th>% uscita</th><th>% attesa</th><th>Utile*</th></tr>
      ${keys.map((x) => `<tr><td>${esc(x)}</td><td>${sum[x].n}</td><td>${sum[x].vinte}</td><td>${pct(sum[x].perc)}</td><td>${pct(sum[x].p_attesa)}</td><td>${sum[x].n_quote ? eur(sum[x].utile) : "–"}</td></tr>`).join("")}
      </table></div><div class="small muted" style="margin:6px 4px">* utile calcolato solo dove c'è la quota vera del bookmaker (Under/Over 2.5), con ${eur(D.config.bollette.puntata)} a bolletta.</div>` : ""}
      <h2>Tutte le bollette</h2>
      ${h.length ? h.map((s) => `<details><summary class="card" style="list-style:none">${badge(s.status)} ${badge(s.method)} <b>${esc(s.title)}</b>
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
    const v = Object.assign({ bollette: viewBollette, partite: viewPartite, statistiche: viewStatistiche, storico: viewStorico, verifica: viewVerifica, calcolatori: viewCalcolatori }, views)[state.tab];
    main.innerHTML = v();
    if (views.after) views.after(state.tab);
    const sl = document.getElementById("selLg");
    if (sl) sl.onchange = () => { state.statLg = sl.value; state.team = null; state.sort = null; render(); };
    const sc = document.getElementById("selCal");
    if (sc) sc.onchange = () => { state.calMk = sc.value; render(); };
    if (state.tab === "calcolatori") { main.querySelectorAll("input,textarea").forEach((i) => (i.oninput = calc)); calc(); }
  }
  window.MG = { D, state, views, esc, pct, q2, eur, lgName, fdate, badge, render, ko, hm, started, startedTag,
    goTab(t) { state.tab = t; document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === t)); render(); window.scrollTo(0, 0); } };
  document.addEventListener("DOMContentLoaded", render);
})();
