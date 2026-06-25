#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "=== HİBRİT BOT BAŞLATILIYOR ==="

# Start Python Inference Server on port 5005
echo "1. Python Yapay Zeka Sunucusu başlatılıyor..."
python3 scripts/hybrid/inference_server.py &

# Wait for Python Server to start up
echo "Python sunucusunun hazır olması bekleniyor..."
sleep 5

# Start Hybrid Bot Engine
echo "2. Canlı WebSocket ve Karar Motoru başlatılıyor..."
npx tsx scripts/hybrid/start_hybrid.ts &

# Start Next.js Dashboard App on port 3039
echo "3. Next.js Dashboard Arayüzü başlatılıyor..."
exec npm run start
