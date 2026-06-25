@echo off
title Nexus Quant Terminal Launcher
echo ==============================================
echo 🚀 Starting Nexus Quant Terminal and Bot...
echo ==============================================
echo.

echo 0. Killing any running instances...
:: 3039 portunu kullanan işlemi bul ve öldür
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr :3039') DO (
  taskkill /F /PID %%T >nul 2>&1
)
:: 5005 portunu kullanan işlemi bul ve öldür (Python Inference)
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr :5005') DO (
  taskkill /F /PID %%T >nul 2>&1
)
:: Geri kalan node.exe'leri kapat (Borsabot için güvenli yöntem)
taskkill /F /IM node.exe >nul 2>&1

echo 1. Starting Web Dashboard (Next.js)...
start "Web Dashboard" cmd /k "npm run dev"

echo 2. Starting Python Inference Server...
start "Python Inference Server" cmd /k "python scripts/hybrid/inference_server.py"

echo 3. Waiting for servers to initialize (3 seconds)...
ping -n 4 127.0.0.1 >nul

echo 4. Starting Hybrid AI Bot...
start "Hybrid AI Engine" cmd /k "npx tsx scripts/hybrid/start_hybrid.ts"

echo 5. Opening web dashboard...
start http://localhost:3039/hybrid-bots

echo.
echo ✅ Done! You can close this small launcher window.
echo The dashboard and bot processes are running in the other windows.
pause
