#!/bin/bash
# ── Face Attendance System — Start Script ─────────────────────────────────────
set -e

PROJECT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$PROJECT/backend"
FRONTEND="$PROJECT/frontend"

echo "🔷 Face Recognition Attendance System"
echo "======================================="

# ── Backend ──────────────────────────────────────────────────────────────────
echo ""
echo "📦 Setting up Python backend..."
cd "$BACKEND"

if [ ! -d "venv" ]; then
  python3 -m venv venv
  echo "  ✓ virtualenv created"
fi

source venv/bin/activate
pip install -q -r requirements.txt
echo "  ✓ Python deps installed"

# Start FastAPI
echo ""
echo "🚀 Starting FastAPI on http://localhost:8000 ..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  ✓ Backend PID: $BACKEND_PID"

# ── Frontend ──────────────────────────────────────────────────────────────────
echo ""
echo "📦 Setting up React frontend..."
cd "$FRONTEND"
npm install --silent
echo "  ✓ Node deps installed"

echo ""
echo "🚀 Starting React on http://localhost:5173 ..."
npm run dev &
FRONTEND_PID=$!
echo "  ✓ Frontend PID: $FRONTEND_PID"

echo ""
echo "======================================="
echo "✅ System running!"
echo "   Dashboard  → http://localhost:5173"
echo "   API Docs   → http://localhost:8000/docs"
echo "   Default login: admin / Admin@1234"
echo "======================================="
echo ""
echo "Press Ctrl+C to stop all services."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
