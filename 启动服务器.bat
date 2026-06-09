@echo off
title MyHealth Server
cd /d "E:\dd\Documents\hanako\Health"
echo Starting MyHealth Server...
echo Access at: http://localhost:8083
echo Share at: http://192.168.31.85:8083
echo.
echo Close this window to stop the server.
echo =====================================
python server.py 8083
pause
