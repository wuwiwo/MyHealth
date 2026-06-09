@echo off
start /B python "E:\dd\Documents\hanako\Health\server.py" 8083
timeout /t 3 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:8083/
