@echo off
cd /d "%~dp0"
python build.py
start "" "%~dp0docs\index.html"
