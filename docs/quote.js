/* Le tue quote: in Bollette scrivi la quota del tuo bookmaker per ogni giocata e l'app dice se conviene.
   Conviene quando probabilità × quota supera il margine di sicurezza (la "quota min").
   Batistuta e risultati esatti: una quota per ogni esito, l'app calcola la quota complessiva
   dividendo l'importo per vincere uguale con ognuno (come il Contabilizzatore). */
(function () {
  "use strict";
  const MG = window.MG;
  if (!MG || !MG.D) return;
  const { D, esc, pct, q2, started } = MG;
  const MK = D.mercati;
  const margin = D.config.bollette.margine_valore;
  const FX = Object.fromEntries(D.partite.map((f) => [f.id, f]));

  const KEY = "mg_quote";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  let Q = load();
  // tengo le quote delle ultime 6 settimane
  const old = new Date(Date.now() - 42 * 864e5).toISOString().slice(0, 10);
  for (const k of Object.keys(Q)) if (!Q[k].d || Q[k].d < old) delete Q[k];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Q)); } catch (e) { /* memoria piena */ } };

  // esiti singoli da quotare per ogni giocata della bolletta
  const PARTS = { BAT: ["GGGG", "GGNG", "NGGG"], RE_C: ["RS10", "RS20", "RS21"], RE_O: ["RS01", "RS02", "RS12"], RE_X: ["RS00", "RS11", "RS22"] };
  const parts = (markets) => markets.flatMap((m) => PARTS[m] || [m]);
  const short = (m) => (/^RS\d\d$/.test(m) ? `${m[2]}-${m[3]}` : { GGGG: "GG-GG", GGNG: "GG-NG", NGGG: "NG-GG" }[m] || MK[m] || m);
  const keyOf = (fx, m) => `${fx}|${m}`;

  // quota di un esito: la tua, oppure la quota media dei bookmaker per Under/Over 2.5
  function oddsOf(pk, m) {
    const k = Q[keyOf(pk.fx, m)];
    if (k) return { q: k.q, mine: true };
    if (pk.real && pk.markets.length === 1 && pk.markets[0] === m && (m === "U25" || m === "O25")) return { q: pk.real, mine: false };
    return null;
  }
  // quota complessiva della giocata (più esiti = importo diviso per vincere uguale)
  function pickOdds(pk) {
    const ps = parts(pk.markets), os = ps.map((m) => oddsOf(pk, m));
    if (os.some((o) => !o)) return null;
    return { q: 1 / os.reduce((s, o) => s + 1 / o.q, 0), mine: os.some((o) => o.mine) };
  }
  function slipOdds(s) {
    const os = s.picks.map(pickOdds);
    if (!os.length || os.some((o) => !o)) return null;
    return os.reduce((a, o) => a * o.q, 1);
  }
  // giudizio: resa attesa = probabilità × quota − 1
  function verdict(p, q) {
    const ev = p * q - 1;
    const cls = p * q >= margin ? "qv-ok" : ev >= 0 ? "qv-mid" : "qv-no";
    const txt = p * q >= margin ? "conviene" : ev >= 0 ? "al limite" : "non conviene";
    return `<span class="qv ${cls}">${cls === "qv-ok" ? "✔" : cls === "qv-no" ? "✘" : "≈"} ${txt} <span class="q">(${ev >= 0 ? "+" : ""}${pct(ev, 1)})</span></span>`;
  }

  // ---------- caselle nella bolletta ----------
  function verdHtml(pk) {
    const ps = parts(pk.markets), po = pickOdds(pk);
    return po ? `${ps.length > 1 ? `insieme ${q2(po.q)} · ` : ""}${verdict(pk.p, po.q)}` : `<span class="muted">serve almeno ${q2(pk.min_odds)}${ps.length > 1 ? " in tutto" : ""}</span>`;
  }
  MG.quoteHtml = (pk) => {
    if (pk.esito) return "";
    const ps = parts(pk.markets), editable = !started(pk) && FX[pk.fx];
    const po = pickOdds(pk);
    if (!editable) return po ? `<div class="small muted">quota ${q2(po.q)} · ${verdict(pk.p, po.q)}</div>` : "";
    const inputs = ps.map((m) => {
      const o = oddsOf(pk, m);
      return `<label class="qin">${ps.length > 1 ? `<span>${esc(short(m))}</span>` : ""}<input class="odds" type="number" step="0.01" min="1.01" inputmode="decimal"
        placeholder="quota" value="${o ? o.q : ""}" data-myq="${esc(pk.fx)}|${m}|${esc(pk.date)}"></label>`;
    }).join("");
    return `<div class="qrow"><span class="small muted">${ps.length > 1 ? "Le tue quote:" : "La tua quota:"}</span>${inputs}
      <span class="small qverd" data-qpk="${esc(pk.fx)}|${esc(pk.markets.join("+"))}">${verdHtml(pk)}</span></div>`;
  };
  MG.quoteSlip = (s) => `<span data-qslip="${esc(s.id)}">${slipLine(s)}</span>`;
  function slipLine(s) {
    const Qs = slipOdds(s);
    if (!Qs) return "";
    const ev = s.prob * Qs - 1;
    return `<span>Con le tue quote <b>${q2(Qs)}</b> · resa attesa <b class="${s.prob * Qs >= margin ? "esito-W" : ev >= 0 ? "" : "esito-L"}">${ev >= 0 ? "+" : ""}${pct(ev, 1)}</b></span>`;
  };
  MG.slipOdds = slipOdds;
  // quota scritta da te per un esito (usata da Sistema e Bomba al posto della quota minima)
  MG.myOdds = (fxId, mk) => (Q[keyOf(fxId, mk)] || {}).q || null;

  document.getElementById("main").addEventListener("change", (ev) => {
    const t = ev.target;
    if (!t.dataset || !t.dataset.myq) return;
    const [fx, m, d] = t.dataset.myq.split("|");
    const v = parseFloat(String(t.value).replace(",", "."));
    if (v > 1) Q[keyOf(fx, m)] = { q: Math.round(v * 100) / 100, d };
    else delete Q[keyOf(fx, m)];
    save();
    // aggiorno solo i giudizi (non tutta la pagina), così puoi passare subito alla casella dopo
    document.querySelectorAll("[data-qpk]").forEach((el) => {
      const [f, mk] = el.dataset.qpk.split("|");
      const pk = D.bollette.flatMap((b) => b.picks).find((p) => p.fx === f && p.markets.join("+") === mk);
      if (pk) el.innerHTML = verdHtml(pk);
    });
    document.querySelectorAll("[data-qslip]").forEach((el) => {
      const sl = D.bollette.find((b) => b.id === el.dataset.qslip);
      if (sl) el.innerHTML = slipLine(sl);
    });
  });
})();
