@echo off
title Annotate — Collaborative Annotation System
color 0A
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   Annotate — Collaborative Annotation    ║
echo  ╚══════════════════════════════════════════╝
echo.
if exist .env (
  echo  [✓] Found .env file — checking MONGO_URI...
) else (
  echo  [!] No .env file found. Copying from .env.example...
  copy .env.example .env >nul
  echo  [!] Edit .env and add your MONGO_URI for persistent storage.
  echo      Leave it blank to use in-memory storage.
  echo.
)
echo  Starting server...
echo.
echo  ─────────────────────────────────────────────────
echo   Open browser at:  http://localhost:3001
echo   For persistence:  Edit .env → set MONGO_URI
echo   Atlas guide:      https://www.mongodb.com/atlas
echo  ─────────────────────────────────────────────────
echo.
node server.js
pause
