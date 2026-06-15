# Face Recognition Attendance System

An enterprise-grade kiosk attendance system built with a robust **FastAPI** backend and a responsive **React/Vite** frontend. This platform offers seamless face recognition check-in/check-out, active anti-spoofing, real-time dashboard updates, and intelligent shift scheduling.

## Key Features
- **Face Recognition Attendance:** Quick, contactless check-ins.
- **Active Anti-Spoofing:** Advanced liveness detection to ensure security.
- **Real-Time WebSocket Dashboard:** Live updates for administrators on who is present.
- **Intelligent Shift Scheduling:** Flexible shift definitions and scheduling capabilities.
- **Production Ready:** Configured for seamless deployment (Vercel for Frontend, Railway for Backend) with environment-specific dynamic API URLs and automated database migrations.

## Project Structure

```text
face-attendance/
├── backend/                # FastAPI backend application
│   ├── uploads/            # Directory for uploaded images
│   ├── auth.py             # JWT authentication logic
│   ├── database.py         # DB connection and models
│   ├── face_service.py     # Anti-spoofing and face recognition logic
│   ├── main.py             # FastAPI entry point and routes
│   ├── schemas.py          # Pydantic models for API definitions
│   └── railway.toml        # Railway deployment configuration
├── frontend/               # React (Vite) frontend application
│   ├── public/             # Static assets
│   ├── src/
│   │   ├── api.js          # API client and configurations
│   │   ├── components/     # Reusable UI components
│   │   ├── context/        # React context providers
│   │   ├── pages/          # Dashboard, Kiosk, and other page views
│   │   └── App.jsx         # Application routing
│   ├── vercel.json         # Vercel deployment configuration
│   └── vite.config.js      # Vite configuration
├── docs/                   # Documentation and architectural plans
│   └── README.md           # Future roadmap and docs index
├── Makefile                # Shortcuts for local setup and dev servers
├── migrate_db.py           # Database migration script
└── start.sh                # Startup script for environments
```

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js & npm
- PostgreSQL

### Installation & Setup

You can use the provided `Makefile` to easily install and run the application.

1. **Install Dependencies:**
   ```bash
   make install
   ```

2. **Database Setup:**
   ```bash
   make db-setup
   ```

3. **Run Full Stack (Development):**
   ```bash
   make dev
   ```
   *The backend will be available at http://localhost:8000 and frontend at http://localhost:5173.*

### Other Commands
- `make backend` - Run only the backend.
- `make frontend` - Run only the frontend.
- `make clean` - Remove virtual environments, node modules, and caches.
- `make stop` - Stop both backend and frontend development servers.

## Documentation
For future plans and additional documentation, see the [docs/README.md](docs/README.md).
