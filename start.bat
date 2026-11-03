@echo off
cd /d "%~dp0"
if not exist ".env" (
 echo Chua co file .env. Hay sao chep .env.example thanh .env va dien thong tin.
 pause
 exit /b 1
)
node --env-file=.env server.js
pause
