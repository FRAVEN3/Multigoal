/* Formazioni ufficiali: da 100 minuti prima del calcio d'inizio l'app cerca su ESPN titolari e panchina
   delle partite con marcatori e aggiorna la probabilità di ogni giocatore:
     titolare ufficiale -> gioca quasi tutta la partita, in panchina -> entra poco, non convocato -> non segna
   (non convocato = infortunato, squalificato o fuori rosa: ESPN non dice il motivo). */
(function () {
  "use strict";
  const MG = window.MG;
  if (!MG || !MG.D || !MG.D.marcatori) return;
  const { D, esc, pct } = MG;
  const PL = D.marcatori;
  const FX = Object.fromEntries(D.partite.map((f) => [f.id, f]));
  const KEY = "mg_formazioni";
  const BEFORE = 100 * 60000, AFTER = 30 * 60000;   // da 100 minuti prima a mezz'ora dopo l'inizio
  const PLAY = { titolare: 0.92, panchina: 0.2, fuori: 0 };   // quanta partita si prevede che giochi

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  let FORM = load();
  for (const id of Object.keys(FORM)) if (!PL[id]) delete FORM[id];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(FORM)); } catch (e) { /* memoria piena */ } };

  // ricalcola le probabilità con la formazione ufficiale
  function apply() {
    for (const [fx, f] of Object.entries(FORM)) {
      for (const pl of Object.values(PL[fx] || {}).flat()) {
        if (pl.p0 == null) pl.p0 = pl.p;
        const st = f.ids[pl.id] || "fuori";
        const mu = -Math.log(1 - Math.min(0.99, pl.p0)), e = pl.e || 0.8;
        pl.uff = st;
        pl.p = Math.round((1 - Math.exp(-mu * PLAY[st] / e)) * 10000) / 10000;
        if (FX[fx]) FX[fx].est.probs[`SC_${pl.id}`] = pl.p;
      }
    }
  }

  async function check() {
    const now = Date.now();
    const todo = Object.keys(PL).filter((id) => {
      const f = FX[id];
      if (!f || (FORM[id] && FORM[id].n)) return false;
      const ko = MG.ko(f.date, f.time);
      return ko - BEFORE <= now && now <= ko + AFTER;
    });
    if (!todo.length || !MG.espnFind) return;
    let changed = false;
    for (const id of todo) {
      try {
        const ev = await MG.espnFind(FX[id]);
        if (!ev) continue;
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${ev.slug}/summary?event=${ev.id}`, { cache: "no-store" });
        const j = await r.json();
        const ids = {};
        (j.rosters || []).forEach((t) => (t.roster || []).forEach((p) => { ids[String(p.athlete.id)] = p.starter ? "titolare" : "panchina"; }));
        if (Object.keys(ids).length >= 22) { FORM[id] = { n: Object.keys(ids).length, ids, t: now }; changed = true; }
      } catch (e) { /* riprovo al prossimo giro */ }
    }
    if (changed) {
      save(); apply();
      const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (!typing) MG.render();
    }
  }

  // ---------- per le altre schede ----------
  const TAG = { titolare: ["✅ titolare ufficiale", "ok"], panchina: ["🪑 in panchina", "warn"], fuori: ["⛔ non convocato", "warn"] };
  MG.formTag = (pl) => (pl && pl.uff ? ` <span class="tag ${TAG[pl.uff][1]}">${TAG[pl.uff][0]}</span>${pl.p0 != null && Math.abs(pl.p - pl.p0) >= 0.005 ? ` <span class="small muted">${pct(pl.p0)} → <b>${pct(pl.p)}</b></span>` : ""}` : "");
  // giocata "segna X" di una bolletta: stato ufficiale, probabilità aggiornata e, se non gioca, chi mettere al suo posto
  MG.formPick = (pk) => {
    const m = pk.markets[0];
    if (!/^SC_/.test(m)) return "";
    const pl = Object.values(PL[pk.fx] || {}).flat().find((x) => `SC_${x.id}` === m);
    if (!pl) return "";
    if (!pl.uff) {
      const f = FX[pk.fx];
      return f && MG.ko(f.date, f.time) - Date.now() < BEFORE && Date.now() < MG.ko(f.date, f.time) ? `<div class="small muted">⏳ formazioni ufficiali in arrivo…</div>` : "";
    }
    let h = `<div class="small">${MG.formTag(pl)}</div>`;
    if (pl.uff !== "titolare") {
      const alt = Object.values(PL[pk.fx]).flat().filter((x) => x.uff === "titolare").sort((a, b) => b.p - a.p)[0];
      if (alt) h += `<div class="small esito-L">${pl.uff === "fuori" ? "Non gioca" : "Parte dalla panchina"}: al suo posto conviene <b>${esc(alt.name)}</b> (titolare, ${pct(alt.p)}).</div>`;
    }
    return h;
  };
  MG.formOf = (fxId) => FORM[fxId] || null;

  apply();
  check();
  setInterval(() => { if (document.visibilityState === "visible") check(); }, 3 * 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
})();
