# ══════════════════════════════════════════════════════════════════════════════
#  Face Recognition Attendance System — Makefile
# ══════════════════════════════════════════════════════════════════════════════

ROOT         := $(shell pwd)
BACKEND_DIR  := $(ROOT)/backend
FRONTEND_DIR := $(ROOT)/frontend
VENV         := $(BACKEND_DIR)/venv
PYTHON       := $(VENV)/bin/python
PIP          := $(VENV)/bin/pip
UVICORN      := $(VENV)/bin/uvicorn

.PHONY: help install install-backend install-frontend \
        backend frontend dev stop db-setup lint clean

# ── Default ───────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Face Recognition Attendance System"
	@echo "  ════════════════════════════════════"
	@echo "  make install          Install all deps (backend + frontend)"
	@echo "  make backend          Start FastAPI on :8000"
	@echo "  make frontend         Start React dev server on :5173"
	@echo "  make dev              Start BOTH in parallel"
	@echo "  make stop             Kill both servers"
	@echo "  make db-setup         Create PostgreSQL user & database"
	@echo "  make install-backend  Install Python deps only"
	@echo "  make install-frontend Install Node deps only"
	@echo "  make clean            Remove venv, node_modules, __pycache__"
	@echo ""

# ── Install ───────────────────────────────────────────────────────────────────
install: install-backend install-frontend
	@echo "✅ All dependencies installed."

install-backend: $(VENV)/bin/activate
	@echo "📦 Installing Python dependencies..."
	$(PIP) install -q -r $(BACKEND_DIR)/requirements.txt
	@echo "✓  Backend ready."

$(VENV)/bin/activate:
	@echo "🐍 Creating Python virtualenv..."
	python3 -m venv $(VENV)

install-frontend:
	@echo "📦 Installing Node dependencies..."
	cd $(FRONTEND_DIR) && npm install --silent
	@echo "✓  Frontend ready."

# ── Database ──────────────────────────────────────────────────────────────────
db-setup:
	@echo "🗄️  Setting up PostgreSQL..."
	sudo -u postgres psql -c "CREATE USER attendance_user WITH PASSWORD 'Attend@2024' CREATEDB;" 2>/dev/null || echo "  (user already exists)"
	sudo -u postgres psql -c "CREATE DATABASE attendance_db OWNER attendance_user;" 2>/dev/null || echo "  (database already exists)"
	@echo "✓  Database ready."

# ── Run Servers ───────────────────────────────────────────────────────────────
backend:
	@echo "🚀 Starting FastAPI backend on http://localhost:8000 ..."
	cd $(BACKEND_DIR) && $(UVICORN) main:app --host 0.0.0.0 --port 8000 --reload

frontend:
	@echo "🚀 Starting React frontend on http://localhost:5173 ..."
	cd $(FRONTEND_DIR) && npm run dev

dev:
	@echo "🚀 Starting full stack (backend :8000 + frontend :5173)..."
	@echo "   Press Ctrl+C to stop both."
	@trap 'kill 0' INT; \
	  (cd $(BACKEND_DIR) && $(UVICORN) main:app --host 0.0.0.0 --port 8000 --reload) & \
	  (cd $(FRONTEND_DIR) && npm run dev) & \
	  wait

# ── Stop ──────────────────────────────────────────────────────────────────────
stop:
	@echo "🛑 Stopping servers..."
	-@pkill -f "uvicorn main:app" 2>/dev/null && echo "  ✓ Backend stopped" || echo "  (backend was not running)"
	-@pkill -f "vite" 2>/dev/null && echo "  ✓ Frontend stopped" || echo "  (frontend was not running)"

# ── Clean ─────────────────────────────────────────────────────────────────────
clean:
	@echo "🧹 Cleaning up..."
	rm -rf $(VENV)
	rm -rf $(FRONTEND_DIR)/node_modules
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	@echo "✓  Clean."
