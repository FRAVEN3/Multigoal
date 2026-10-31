/* Scheda "Rendimento": statistiche delle bollette create dall'app (con il confronto sulle stagioni passate)
   e delle giocate fatte davvero (bollette segnate "L'ho giocata" + sistemi salvati). */
(function () {
  "use strict";
  const MG = window.MG;
  if (!MG || !MG.D) return;
  const { D, esc, pct, q2, eur, lgName, fdate, badge } = MG;
  const MK = D.mercati;

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* memoria piena */ } };
  const KEY = "mg_giocate";
  let giocate = load(KEY, []);
  const ui = Object.assign({ sez: "app", per: "tutto", met: "TUTTI" }, load("mg_rend_ui", {}));
  const saveUi = () => store("mg_rend_ui", ui);

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
  const monday = (s) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const normTitle = (t) => String(t).replace(/ #\d+$/, "");
  const mkName = (k) => k.split("+").sort().map((m) => MK[m] || m).join(" / ");
  const NOMI = { MULTIGOL: "Multigol", BATISTUTA: "Batistuta", RADUCIOIU: "Raducioiu" };

  // ---------- dati: bollette dell'app (quest'anno) e rifatte sulle stagioni passate ----------
  const ES = { VINTA: "V", PERSA: "P", ANNULLATA: "A", "IN CORSO": "C" };
  const curList = () => D.storico.map((s) => ({
    id: s.id, w: s.created, end: s.settled || s.created, m: s.method, k: s.kind, t: normTitle(s.title), p: s.prob, q: s.real,
    s: ES[s.status] || "C", pk: s.picks.map((pk) => [pk.lg, pk.markets.join("+"), pk.p, pk.esito === "ANN" ? "A" : pk.esito || null, pk.date]),
  }));
  const past = ((D.backtest && D.backtest.bollette) || []).map((s) => Object.assign({}, s, { t: normTitle(s.t) }));

  // ---------- conti ----------
  function aggSlips(list) {
    const r = { n: 0, v: 0, p: 0, nq: 0, ut: 0, corso: 0 };
    list.forEach((s) => {
      if (s.s === "C") { r.corso++; return; }
      if (s.s === "A") return;
      r.n++; r.v += s.s === "V"; r.p += s.p;
      if (s.q) { r.nq++; r.ut += s.s === "V" ? s.q - 1 : -1; }
    });
    return r;
  }
  function aggPicks(list, keyFn) {
    const out = {};
    list.forEach((s) => s.pk.forEach((pk) => {
      if (pk[3] !== "W" && pk[3] !== "L") return;
      const k = keyFn ? keyFn(pk, s) : "tot";
      const r = (out[k] = out[k] || { n: 0, w: 0, p: 0 });
      r.n++; r.w += pk[3] === "W"; r.p += pk[2];
    }));
    return out;
  }
  const groupBy = (list, fn) => list.reduce((o, x) => ((o[fn(x)] = o[fn(x)] || []).push(x), o), {});
  const band = (p) => (p < 0.6 ? "sotto 60%" : p < 0.7 ? "60-69%" : p < 0.8 ? "70-79%" : p < 0.9 ? "80-89%" : "90% e oltre");
  const BANDS = ["sotto 60%", "60-69%", "70-79%", "80-89%", "90% e oltre"];

  // stessa percentuale con colore: verde se uscita >= attesa
  const vsAtt = (real, att) => (real == null ? "–" : `<span class="${real >= att - 0.005 ? "esito-W" : "esito-L"}">${pct(real)}</span>`);
  const pastCell = (r) => (r && r.n ? `${pct(r.w / r.n)} <span class="small muted">(${r.n})</span>` : "–");
  const k = (v, l, cls) => `<div class="kpi"><div class="v ${cls || ""}">${v}</div><div class="l">${l}</div></div>`;

  // serie di vinte/perse consecutive
  function streaks(list) {
    const done = list.filter((s) => s.s === "V" || s.s === "P").sort((a, b) => (a.end + a.w).localeCompare(b.end + b.w));
    let maxV = 0, maxP = 0, run = 0, last = null;
    done.forEach((s) => {
      run = s.s === last ? run + 1 : 1; last = s.s;
      if (s.s === "V") maxV = Math.max(maxV, run); else maxP = Math.max(maxP, run);
    });
    return { cur: run, curS: last, maxV, maxP };
  }

  // ---------- grafico (una sola serie: niente legenda, valore al passaggio del dito) ----------
  // pts = [{ x: etichetta, y: valore, tip: testo }]; mode "bar" (percentuali) o "line" (saldo che sale e scende)
  function chart(pts, mode, ref) {
    if (pts.length < (mode === "bar" ? 2 : 3)) return `<div class="small muted" style="margin:4px">Il grafico compare quando ci sono almeno 2 ${mode === "bar" ? "settimane" : "giocate concluse"}.</div>`;
    const W = 340, H = 150, L = 34, R = 8, T = 10, B = 22, iw = W - L - R, ih = H - T - B;
    const ys = pts.map((p) => p.y).concat(ref != null ? [ref] : []);
    let lo = mode === "bar" ? 0 : Math.min(0, ...ys), hi = mode === "bar" ? 1 : Math.max(0, ...ys);
    if (hi === lo) hi = lo + 1;
    const Y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih;
    const step = iw / pts.length, X = (i) => L + step * i + step / 2;
    const ticks = mode === "bar" ? [0, 0.5, 1] : [lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i);
    const fmt = (v) => (mode === "bar" ? pct(v) : `${Math.round(v)}€`);
    let g = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="cg"/><text x="${L - 4}" y="${Y(v) + 3}" class="ct" text-anchor="end">${fmt(v)}</text>`).join("");
    if (mode === "bar") {
      const bw = Math.max(3, Math.min(26, step - 2));
      g += pts.map((p, i) => { const y = Y(p.y), h = Math.max(1, Y(0) - y);
        return `<path d="M${X(i) - bw / 2},${Y(0)} v${-(h - Math.min(4, h))} q0,${-Math.min(4, h)} ${Math.min(4, bw / 2)},${-Math.min(4, h)} h${bw - 2 * Math.min(4, bw / 2)} q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z" class="cb"/>`; }).join("");
      if (ref != null) g += `<line x1="${L}" x2="${W - R}" y1="${Y(ref)}" y2="${Y(ref)}" class="cr"/><text x="${W - R}" y="${Y(ref) - 4}" class="ct" text-anchor="end">attesa ${pct(ref)}</text>`;
    } else {
      g += `<path d="${pts.map((p, i) => `${i ? "L" : "M"}${X(i)},${Y(p.y)}`).join("")}" class="cl"/>`;
      const e = pts[pts.length - 1];
      g += `<circle cx="${X(pts.length - 1)}" cy="${Y(e.y)}" r="4" class="cd"/><text x="${X(pts.length - 1) - 6}" y="${Y(e.y) - 8}" class="ct cv" text-anchor="end">${eur(e.y)}</text>`;
    }
    const lab = [0, pts.length - 1].map((i) => `<text x="${X(i)}" y="${H - 6}" class="ct" text-anchor="${i ? "end" : "start"}">${esc(pts[i].x)}</text>`).join("");
    const hits = pts.map((p, i) => `<rect x="${L + step * i}" y="${T}" width="${step}" height="${ih}" class="ch" data-tip="${esc(p.tip)}"/>`).join("");
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${g}${lab}${hits}</svg><div class="ctip" hidden></div></div>`;
  }

  // ---------- sezione: bollette dell'app ----------
  function appHtml() {
    const t0 = ui.per === "4s" ? addDays(D.oggi, -28) : "";
    const fM = (s) => ui.met === "TUTTI" || s.m === ui.met;
    const list = curList().filter((s) => fM(s) && s.w >= t0), pl = past.filter(fM);
    const A = aggSlips(list), Ap = aggSlips(pl), P = aggPicks(list).tot || { n: 0, w: 0, p: 0 }, Pp = aggPicks(pl).tot || { n: 0, w: 0, p: 0 };
    const st = streaks(list);
    const few = A.n < 30 ? `<div class="note">Per ora ci sono solo <b>${A.n}</b> bollette concluse: le percentuali possono cambiare molto. La colonna <b>"Stagioni passate"</b> mostra come sono andate le stesse bollette rifatte sulle ultime ${D.backtest.stagioni.length} stagioni (${Ap.n} bollette): è il numero più affidabile.</div>` : "";

    // per tipo di bolletta
    const byT = groupBy(list, (s) => s.t), byTp = groupBy(pl, (s) => s.t);
    const titles = [...new Set([...Object.keys(byT), ...Object.keys(byTp)])].sort();
    const rowsT = titles.map((t) => {
      const a = aggSlips(byT[t] || []), b = aggSlips(byTp[t] || []);
      return `<tr><td style="white-space:normal">${esc(t)}</td><td>${a.n}${a.corso ? ` <span class="small muted">+${a.corso}</span>` : ""}</td><td>${a.v}</td><td>${a.n ? vsAtt(a.v / a.n, a.p / a.n) : "–"}</td><td>${a.n ? pct(a.p / a.n) : "–"}</td><td>${b.n ? `${pct(b.v / b.n)} <span class="small muted">(${b.n})</span>` : "–"}</td></tr>`;
    }).join("");

    // tabelle sulle singole giocate
    const pickTable = (title, keyFn, order, label) => {
      const a = aggPicks(list, keyFn), b = aggPicks(pl, keyFn);
      // prima le voci con giocate quest'anno, poi le altre (per quante ce ne sono nelle stagioni passate)
      const keys = (order || [...new Set([...Object.keys(a), ...Object.keys(b)])].sort((x, y) => ((a[y] || {}).n || 0) - ((a[x] || {}).n || 0) || ((b[y] || {}).n || 0) - ((b[x] || {}).n || 0)))
        .filter((x) => a[x] || b[x]);
      if (!keys.length) return "";
      return `<h2>${title}</h2><div class="tw"><table><tr><th>${label}</th><th>Giocate</th><th>Indovinate</th><th>% attesa</th><th>Stagioni passate</th></tr>
        ${keys.map((x) => { const r = a[x]; return `<tr><td style="white-space:normal">${esc(x)}</td><td>${r ? r.n : 0}</td><td>${r ? vsAtt(r.w / r.n, r.p / r.n) : "–"}</td><td>${r ? pct(r.p / r.n) : "–"}</td><td>${pastCell(b[x])}</td></tr>`; }).join("")}</table></div>`;
    };

    // andamento settimanale delle giocate
    const weeks = groupBy(list.flatMap((s) => s.pk.filter((pk) => pk[3] === "W" || pk[3] === "L").map((pk) => ({ pk, w: monday(pk[4] || s.w) }))), (x) => x.w);
    const wk = Object.keys(weeks).sort().map((w) => { const xs = weeks[w], v = xs.filter((x) => x.pk[3] === "W").length;
      return { x: fdate(w).slice(4), y: v / xs.length, tip: `Settimana dal ${fdate(w)}: ${v} su ${xs.length} indovinate (${pct(v / xs.length)})` }; });

    return `${few}
      <div class="grid2">
        ${k(A.n, `bollette concluse${A.corso ? ` · ${A.corso} in corso` : ""}`)}
        ${k(A.n ? vsAtt(A.v / A.n, A.p / A.n) : "–", `bollette vinte (${A.v}) · attesa ${A.n ? pct(A.p / A.n) : "–"}`)}
        ${k(P.n ? vsAtt(P.w / P.n, P.p / P.n) : "–", `giocate indovinate: ${P.w} su ${P.n} · attesa ${P.n ? pct(P.p / P.n) : "–"}`)}
        ${k(Ap.n ? pct(Ap.v / Ap.n) : "–", `bollette vinte nelle stagioni passate (${Ap.n}) · giocate ${Pp.n ? pct(Pp.w / Pp.n) : "–"}`)}
        ${k(st.curS ? `${st.cur} ${st.curS === "V" ? "vinte" : "perse"}` : "–", "serie attuale")}
        ${k(`${st.maxV} / ${st.maxP}`, "serie più lunga vinte / perse")}
        ${A.nq ? k(`<span class="${A.ut >= 0 ? "esito-W" : "esito-L"}">${eur(A.ut * D.config.bollette.puntata)}</span>`, `utile con le quote vere (${A.nq} bollette Under/Over da ${eur(D.config.bollette.puntata)})`) : ""}
      </div>
      <div class="small muted" style="margin:6px 4px">Percentuale <span class="esito-W">verde</span> = uscita almeno quanto stimato, <span class="esito-L">rossa</span> = meno del previsto. "Attesa" = la probabilità che l'app aveva dato.</div>
      <h2>Giocate indovinate per settimana</h2>${chart(wk, "bar", P.n ? P.p / P.n : null)}
      <h2>Per tipo di bolletta</h2>
      <div class="tw"><table><tr><th>Bolletta</th><th>Concluse</th><th>Vinte</th><th>% vinte</th><th>% attesa</th><th>Stagioni passate</th></tr>${rowsT}</table></div>
      ${pickTable("Per tipo di giocata", (pk) => mkName(pk[1]), null, "Giocata")}
      ${pickTable("Per fascia di probabilità", (pk) => band(pk[2]), BANDS, "L'app diceva")}
      ${pickTable("Per campionato", (pk) => lgName(pk[0]), null, "Campionato")}
      <div class="small muted" style="margin:8px 4px">Le "Stagioni passate" sono le bollette che l'app avrebbe creato ogni venerdì delle ultime ${D.backtest.stagioni.length} stagioni con le regole di oggi, usando solo le partite già giocate fino a quel giorno. Il numero tra parentesi è quante sono.</div>`;
  }

  // ---------- sezione: le mie giocate ----------
  function myRecords() {
    const byId = Object.fromEntries(D.storico.map((s) => [s.id, s]));
    const out = giocate.map((g) => {
      const s = byId[g.id];
      if (s && s.status !== "IN CORSO") g.status = s.status;   // ricordo l'esito anche quando esce dallo storico
      const status = (s && s.status) || g.status || "IN CORSO";
      let vinto = null;
      if (status === "VINTA") vinto = g.vincita != null ? g.vincita : g.quota ? g.importo * g.quota : null;
      else if (status === "PERSA") vinto = 0;
      else if (status === "ANNULLATA") vinto = g.importo;
      return { src: "b", id: g.id, tipo: `${NOMI[g.method] || g.method} – ${g.kind}`, title: g.title, date: g.created, end: (s && s.settled) || g.created,
        importo: g.importo, quota: g.quota, vinto, status, needWin: status === "VINTA" && vinto == null, g };
    });
    store(KEY, giocate);
    const sv = load("mg_sistemi_salvati", []);
    if (MG.sis && MG.sis.settle) sv.forEach((x) => {
      const st = MG.sis.settle(x);
      const last = x.items.reduce((m, it) => (it.date > m ? it.date : m), x.created);
      out.push({ src: "s", id: x.id, tipo: "Sistemi (scheda Sistema / Bomba)", title: `Sistema ${x.items.length} partite · ${x.cols} colonne`, date: x.created, end: last,
        importo: x.total, quota: null, vinto: st.done ? st.pay : null, status: st.done ? (st.pay > 0 ? "VINTA" : "PERSA") : "IN CORSO" });
    });
    return out.sort((a, b) => (a.end + a.date).localeCompare(b.end + b.date));
  }

  function myHtml() {
    const all = myRecords();
    const fM = (r) => ui.met === "TUTTI" || r.tipo.toUpperCase().startsWith(ui.met);
    const t0 = ui.per === "4s" ? addDays(D.oggi, -28) : "";
    const list = all.filter((r) => fM(r) && r.date >= t0);
    const done = list.filter((r) => r.vinto != null && r.status !== "ANNULLATA");
    const gioc = done.reduce((a, r) => a + r.importo, 0), vin = done.reduce((a, r) => a + r.vinto, 0);
    const open = list.filter((r) => r.status === "IN CORSO"), inGioco = open.reduce((a, r) => a + r.importo, 0);
    const nV = done.filter((r) => r.vinto > 0).length;
    let c = 0;
    const pts = [{ x: "inizio", y: 0, tip: "Saldo di partenza: 0 €" }].concat(done.map((r) => { c += r.vinto - r.importo; return { x: fdate(r.end).slice(4), y: c, tip: `${fdate(r.end)} · ${r.title}: ${r.vinto - r.importo >= 0 ? "+" : ""}${eur(r.vinto - r.importo)} → saldo ${eur(c)}` }; }));
    const byT = groupBy(done, (r) => r.tipo);
    const rowsT = Object.keys(byT).sort().map((t) => { const xs = byT[t], gi = xs.reduce((a, r) => a + r.importo, 0), vi = xs.reduce((a, r) => a + r.vinto, 0);
      return `<tr><td style="white-space:normal">${esc(t)}</td><td>${xs.length}</td><td>${xs.filter((r) => r.vinto > 0).length}</td><td>${eur(gi)}</td><td>${eur(vi)}</td><td class="${vi - gi >= 0 ? "esito-W" : "esito-L"}">${eur(vi - gi)}</td><td>${gi ? pct((vi - gi) / gi, 1) : "–"}</td></tr>`; }).join("");
    const need = list.filter((r) => r.needWin);
    const rowsL = list.slice().reverse().map((r) => `<div class="card" style="padding:8px 10px">
      <div class="row" style="margin:0">${badge(r.status)} <b style="flex:1">${esc(r.title)}</b></div>
      <div class="small muted">${fdate(r.date)} · giocati ${eur(r.importo)}${r.quota ? ` @ ${q2(r.quota)}` : ""}${r.vinto != null ? ` · vinti ${eur(r.vinto)} · <b class="${r.vinto - r.importo >= 0 ? "esito-W" : "esito-L"}">${eur(r.vinto - r.importo)}</b>` : ""}</div>
      ${r.src === "b" ? `<div class="row" style="margin:6px 0 0"><button class="btn small" style="margin:0" data-gedit="${esc(r.id)}">Modifica</button>
        ${r.status === "VINTA" ? `<button class="btn small" style="margin:0" data-gwin="${esc(r.id)}">Scrivi vincita</button>` : ""}
        <button class="btn small" style="margin:0;background:var(--lose)" data-gdel="${esc(r.id)}">Togli</button></div>` : `<div class="small muted">dalla scheda Sistema (si modifica lì)</div>`}
    </div>`).join("");
    return `<div class="note">Qui contano solo le giocate fatte davvero: le bollette che segni con <b>"✅ L'ho giocata"</b> (schede Bollette o Storico) e i sistemi salvati nella scheda Sistema (anche quelli della Bomba).
      Restano salvate su questo dispositivo.</div>
      ${need.length ? `<div class="gonenote">✍ ${need.length} bollett${need.length === 1 ? "a vinta non ha" : "e vinte non hanno"} la quota: premi "Scrivi vincita" per contarla nel saldo.</div>` : ""}
      <div class="grid2">
        ${k(eur(gioc), `giocato (${done.length} concluse)`)}
        ${k(eur(vin), "vinto")}
        ${k(`<span class="${vin - gioc >= 0 ? "esito-W" : "esito-L"}">${eur(vin - gioc)}</span>`, "saldo")}
        ${k(gioc ? pct((vin - gioc) / gioc, 1) : "–", "resa su quanto giocato")}
        ${k(done.length ? pct(nV / done.length) : "–", `vinte (${nV} su ${done.length})`)}
        ${k(eur(inGioco), `in gioco (${open.length} in corso)`)}
      </div>
      <h2>Saldo nel tempo</h2>${chart(pts, "line")}
      ${rowsT ? `<h2>Per tipo</h2><div class="tw"><table><tr><th>Tipo</th><th>Concluse</th><th>Vinte</th><th>Giocato</th><th>Vinto</th><th>Saldo</th><th>Resa</th></tr>${rowsT}</table></div>` : ""}
      <h2>Le mie giocate</h2>${rowsL || `<div class="empty">Ancora nessuna giocata segnata.<br>Vai in <b>Bollette</b> e premi "✅ L'ho giocata" su quella che giochi.</div>`}`;
  }

  function view() {
    const chip = (key, v, l) => `<button class="chip ${ui[key] === v ? "on" : ""}" data-rd="${key}=${v}">${l}</button>`;
    return `<div class="chips">${chip("sez", "app", "Bollette dell'app")}${chip("sez", "mie", "Le mie giocate")}</div>
      <div class="chips">${chip("per", "tutto", "Tutto")}${chip("per", "4s", "Ultime 4 settimane")}
        <span style="width:8px"></span>${chip("met", "TUTTI", "Tutti")}${chip("met", "MULTIGOL", "Multigol")}${chip("met", "BATISTUTA", "Batistuta")}${chip("met", "RADUCIOIU", "Raducioiu")}</div>
      ${ui.sez === "app" ? appHtml() : myHtml()}`;
  }

  // ---------- "L'ho giocata" sulle bollette ----------
  const num = (s) => { const v = parseFloat(String(s ?? "").replace(",", ".")); return isFinite(v) ? v : null; };
  MG.giocBtn = (s) => {
    const g = giocate.find((x) => x.id === s.id);
    return g ? `<button class="btn small giocata" data-gedit="${esc(s.id)}">✅ Giocata ${eur(g.importo)}${g.quota ? " @ " + q2(g.quota) : ""}</button>`
      : `<button class="btn small" style="background:var(--nob)" data-gioca="${esc(s.id)}">✅ L'ho giocata</button>`;
  };
  function ask(s, g) {
    const imp = num(prompt(`Quanto hai giocato su "${normTitle(s.title)}"? (€)`, g ? g.importo : D.config.bollette.puntata));
    if (imp == null || imp <= 0) return null;
    const hint = s.combos || s.picks.some((p) => p.markets.length > 1 || p.markets[0] === "BAT")
      ? "Quota totale del bookmaker.\nPer sistemi e Batistuta (3 combinazioni) lascia vuoto: a fine partite scrivi quanto hai vinto."
      : "Quota totale del bookmaker (es. 2,10)";
    const qd = g ? g.quota : s.real || (s.picks.length === 1 ? s.picks[0].min_odds : null);
    const q = num(prompt(hint, qd != null ? qd : ""));
    return { importo: Math.round(imp * 100) / 100, quota: q && q > 1 ? q : null };
  }
  const findSlip = (id) => D.bollette.find((b) => b.id === id) || D.storico.find((b) => b.id === id);

  document.getElementById("main").addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-gioca],[data-gedit],[data-gdel],[data-gwin],[data-rd]");
    if (!t) return;
    const d = t.dataset;
    if (d.rd) { const [key, v] = d.rd.split("="); ui[key] = v; saveUi(); }
    else if (d.gioca) {
      const s = findSlip(d.gioca); if (!s) return;
      const a = ask(s); if (!a) return;
      giocate.push({ id: s.id, ...a, created: D.oggi, title: normTitle(s.title), method: s.method, kind: s.kind });
    } else if (d.gedit) {
      const g = giocate.find((x) => x.id === d.gedit), s = findSlip(d.gedit) || g; if (!g) return;
      const a = ask(s, g); if (!a) return;
      Object.assign(g, a);
    } else if (d.gwin) {
      const g = giocate.find((x) => x.id === d.gwin); if (!g) return;
      const v = num(prompt("Quanto hai vinto in tutto? (€)", g.vincita ?? (g.quota ? (g.importo * g.quota).toFixed(2) : "")));
      if (v == null) return;
      g.vincita = v;
    } else if (d.gdel) {
      if (!confirm("Togliere questa giocata dalle tue statistiche?")) return;
      giocate = giocate.filter((x) => x.id !== d.gdel);
    }
    store(KEY, giocate);
    MG.render();
  });

  // valore del grafico al passaggio del mouse o al tocco
  function showTip(e) {
    const r = e.target.closest && e.target.closest(".chart rect.ch"), box = e.target.closest && e.target.closest(".chart");
    document.querySelectorAll(".chart rect.ch.on").forEach((x) => x !== r && x.classList.remove("on"));
    document.querySelectorAll(".chart .ctip").forEach((x) => { if (!box || !box.contains(x)) x.hidden = true; });
    if (!r) return;
    const tip = box.querySelector(".ctip");
    r.classList.add("on");
    tip.textContent = r.dataset.tip; tip.hidden = false;
  }
  document.getElementById("main").addEventListener("mouseover", showTip);
  document.getElementById("main").addEventListener("click", showTip);

  MG.views.rendimento = view;
})();
