@echo off
cd /d "%~dp0"

echo Scarico le ultime novita' da GitHub...
git pull --rebase --autostash -q
if errorlevel 1 echo ATTENZIONE: non riesco a scaricare da GitHub, continuo lo stesso.

python build.py
if errorlevel 1 (
  echo ERRORE durante l'aggiornamento dei dati: non carico nulla su GitHub.
  pause
  exit /b 1
)

echo Carico i nuovi dati su GitHub (app sul telefono)...
git add docs state data/backtest.json
git diff --cached --quiet || git commit -q -m "Aggiornamento dal PC %date% %time:~0,5%"
git push -q
if errorlevel 1 (
  echo ATTENZIONE: caricamento su GitHub non riuscito. Controlla la connessione e riprova.
  pause
) else (
  echo Fatto. Sul telefono i dati nuovi arrivano in 1-2 minuti: ricarica la pagina.
  timeout /t 5 >nul
)

start "" "%~dp0docs\index.html"
