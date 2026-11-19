# Wincere Multigol

Versione app dei file Excel "Wincere MULTIGOL" e "WINCERE TOP".

## Uso sul PC
Doppio clic su **Aggiorna.bat**: scarica i risultati, ricalcola tutto e apre la pagina.

## Cosa fa
- **Statistiche**: codici Multigol (0-0, 1-2, 3, 4-5, 6+) e TOP (GG nei tempi) per squadra, come i fogli "Eventi GG-NG" e "Statistiche".
- **Metodo**: media Batistuta delle due squadre. Fino al 46% è RADUCIOIU, dal 60% è BATISTUTA, in mezzo NO BET (soglie in `config.json`).
- **Bollette**: Multigol a raddoppio, singole, Batistuta (GG-GG/GG-NG/NG-GG), sistemi, Raducioiu Under 2.5 e risultati esatti.
- **Le tue quote** (in Bollette): sotto ogni giocata scrivi la quota del tuo bookmaker e l'app dice se conviene (verde), è al limite (giallo) o non conviene (rosso), con la resa attesa. Per Batistuta e risultati esatti si scrive una quota per esito e l'app calcola la quota complessiva. Le quote passano a Sistema, Bomba, "L'ho giocata" e Rendimento ("utile con le tue quote").
- **Campionati affidabili**: accanto a ogni partita delle bollette un segno dice se il campionato, per quella giocata, è affidabile (✔), un po' sotto il previsto (⚠) o poco affidabile (✘). In Bollette, Storico, Rendimento (e per la Bomba) scegli "Tutti i campionati" (le bollette di sempre), "Affidabili (stagioni passate)" (la scelta provata nei test) o "Affidabili quest'anno" (solo con le partite della stagione in corso: nei test non ha migliorato le bollette). Tabelle complete nella scheda Verifica.
- **📊 Rendimento**: "Bollette dell'app" mostra quante bollette e giocate sono uscite (per tipo di bolletta, di giocata, fascia di probabilità e campionato, con serie e andamento per settimana), confrontate con le stesse bollette rifatte sulle 2 stagioni passate. "Le mie giocate" mostra il tuo saldo: conta le bollette segnate con "✅ L'ho giocata" (in Bollette o Storico) e i sistemi salvati.
- **Live**: risultati in tempo reale (da ESPN, aggiornati ogni minuto) delle partite dei sistemi e delle scalate salvati e delle partite che segui con ☆. Ogni giocata diventa verde o rossa quando è decisa; durante la partita mostra "per ora". Le partite finite vengono chiuse subito con il risultato live (scritta "· live"), poi confermate con il risultato ufficiale all'aggiornamento. Per la Svizzera il live non c'è.
- **Bomba IA**: scrivi importo e numero di partite e scegli lo stile (Prudente / Equilibrato / Coraggioso); sceglie giocate dalle bollette e il tipo di sistema migliore tra quelli provati con la simulazione. In "Tipo di sistema" puoi lasciare Automatico oppure scegliere tu una o più formule (es. 2 su 3 + 3 su 3 integrale).
- **🎯 Ris. esatto**: per le partite Raducioiu (o tutte) mostra la probabilità di ogni risultato da 0-0 a 3-3, calcolata dai gol attesi delle due squadre e corretta con i risultati delle stagioni passate. Tocca i risultati da coprire (o "i 3 più probabili") e scrivi le quote: su una partita ti dice quanto giocare su ogni risultato per vincere sempre la stessa cifra, su più partite apre il sistema. I singoli risultati esatti si possono usare anche in Sistema.
- **Scalata**: catena di bollette a raddoppio. Scegli importo, numero di gradini e quota obiettivo; la vincita di ogni gradino diventa la puntata del successivo. I gradini vanno in ordine di orario (anche più nello stesso giorno: il successivo parte almeno 2h15 dopo l'ultima partita del precedente). Le partite si possono cambiare a mano, scrivendo le quote vere. Le scalate avviate si controllano da sole e i gradini non ancora iniziati si possono ricalcolare quando escono nuove partite.
- **Sistema**: scegli partite e giocate (anche più giocate sulla stessa partita e categorie diverse), scrivi le quote del bookmaker; calcola colonne (integrale o a correzione, es. 2 su 4), vincite, probabilità e resa. I sistemi salvati restano sul dispositivo e si controllano da soli.
- **Storico**: controlla da solo se le bollette sono vinte o perse.
- **Verifica**: prova il metodo sulle due stagioni passate.
- **Calcolatori**: su vincita, su utile, Contabilizzatore, sistemi, raddoppio.

Dati: football-data.co.uk (si aggiorna 2 volte a settimana; il calendario del weekend esce di solito il venerdì). L'app online si aggiorna da sola ogni giorno alle 7:00 (ora italiana d'inverno).

## Impostazioni (`config.json`)
- `metodo.raducioiu_max` / `batistuta_min`: soglie del metodo.
- `bollette.soglia_consiglio`: probabilità minima per consigliare una fascia Multigol.
- `bollette.puntata`: puntata per bolletta usata nello storico.
- `leagues`: campionati inclusi.
