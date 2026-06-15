import os
import json
import logging
import uuid
from datetime import datetime, date
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv()

from database import get_db, create_tables, Employee, AttendanceRecord, User
from schemas import (
    UserCreate, UserLogin, Token,
    EmployeeCreate, EmployeeUpdate, EmployeeOut,
    FaceRegisterRequest, FaceRecognizeRequest,
    AttendanceOut, AttendanceStats,
)
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_admin,
)
from face_service import extract_face_encoding, recognize_face, save_face_image, warmup_models

# ── WebSockets Manager ───────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

# ── Bootstrap ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

app = FastAPI(
    title="Face Recognition Attendance System",
    version="1.0.0",
    description="Production-grade attendance management using facial recognition",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded face images
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.on_event("startup")
def startup():
    if os.getenv("AUTO_MIGRATE", "false").lower() == "true":
        logger.info("Running auto DB migration...")
        create_tables()
    warmup_models()  # pre-load ArcFace + detector so first scan is instant
    # Seed default admin if no users exist
    db = next(get_db())
    try:
        if db.query(User).count() == 0:
            admin = User(
                username="admin",
                email="admin@company.com",
                hashed_password=hash_password("Admin@1234"),
                role="admin",
            )
            db.add(admin)
            db.commit()
            logger.info("Default admin created — username: admin | password: Admin@1234")
    finally:
        db.close()


# ════════════════════════════════════════════════════════════════════════════════
# AUTH ROUTES
# ════════════════════════════════════════════════════════════════════════════════

@app.post("/api/auth/register", response_model=Token)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer", "user": {"id": user.id, "username": user.username, "role": user.role}}


@app.post("/api/auth/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer", "user": {"id": user.id, "username": user.username, "role": user.role}}


@app.get("/api/auth/me")
def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "username": current_user.username, "email": current_user.email, "role": current_user.role}


# ════════════════════════════════════════════════════════════════════════════════
# EMPLOYEE ROUTES
# ════════════════════════════════════════════════════════════════════════════════

@app.get("/api/employees", response_model=List[EmployeeOut])
def list_employees(
    department: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Employee)
    if department:
        q = q.filter(Employee.department == department)
    if search:
        q = q.filter(Employee.name.ilike(f"%{search}%"))
    employees = q.order_by(Employee.name).all()
    result = []
    for emp in employees:
        out = EmployeeOut.model_validate(emp)
        out.has_face = emp.face_encoding is not None
        result.append(out)
    return result


@app.post("/api/employees", response_model=EmployeeOut)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if db.query(Employee).filter(Employee.employee_id == payload.employee_id).first():
        raise HTTPException(status_code=400, detail="Employee ID already exists")
    if payload.email and db.query(Employee).filter(Employee.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    emp = Employee(**payload.model_dump())
    db.add(emp)
    db.commit()
    db.refresh(emp)
    out = EmployeeOut.model_validate(emp)
    out.has_face = False
    return out


@app.get("/api/employees/{emp_id}", response_model=EmployeeOut)
def get_employee(emp_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    out = EmployeeOut.model_validate(emp)
    out.has_face = emp.face_encoding is not None
    return out


@app.patch("/api/employees/{emp_id}", response_model=EmployeeOut)
def update_employee(
    emp_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(emp, field, val)
    emp.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(emp)
    out = EmployeeOut.model_validate(emp)
    out.has_face = emp.face_encoding is not None
    return out


@app.delete("/api/employees/{emp_id}")
def delete_employee(emp_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    db.delete(emp)
    db.commit()
    return {"message": "Employee deleted"}


# ════════════════════════════════════════════════════════════════════════════════
# WEBSOCKETS
# ════════════════════════════════════════════════════════════════════════════════

@app.websocket("/api/ws/admin")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ════════════════════════════════════════════════════════════════════════════════
# FACE ROUTES
# ════════════════════════════════════════════════════════════════════════════════

@app.post("/api/face/register")
def register_face(
    payload: FaceRegisterRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    emp = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    try:
        encoding = extract_face_encoding(payload.image_data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Save face image
    filename = f"{emp.employee_id}_{uuid.uuid4().hex[:8]}.jpg"
    filepath = save_face_image(payload.image_data, UPLOAD_DIR, filename)

    emp.face_encoding = json.dumps(encoding)
    emp.face_image_path = f"/uploads/{filename}"
    emp.updated_at = datetime.utcnow()
    db.commit()

    return {"message": "Face registered successfully", "employee": emp.name}


@app.post("/api/face/recognize")
async def recognize(
    payload: FaceRecognizeRequest,
    db: Session = Depends(get_db),
):
    """
    Identify a person and record attendance.
    No auth required — called from kiosk/camera endpoint.

    Response shapes:
      recognized=True,  blocked=False  → normal check-in / check-out
      recognized=True,  blocked=True   → employee identified but access is suspended
      recognized=False                 → face not in system
    """
    # Query ALL employees with face data (active and blocked) so we can
    # tell the difference between "unknown person" and "blocked employee".
    all_with_face = db.query(Employee).filter(
        Employee.face_encoding.isnot(None)
    ).all()

    if not all_with_face:
        raise HTTPException(status_code=404, detail="No registered faces found")

    known = [{"employee_id": e.id, "encoding": e.face_encoding} for e in all_with_face]

    try:
        match = recognize_face(payload.image_data, known)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if match is None:
        return {"recognized": False, "message": "Face not recognized"}

    emp = db.query(Employee).filter(Employee.id == match["employee_id"]).first()

    # ── Blocked employee — identified but no access ──────────────────────
    if not emp.is_active:
        return {
            "recognized": True,
            "blocked": True,
            "employee": {
                "id": emp.id,
                "name": emp.name,
                "department": emp.department,
                "position": emp.position,
                "face_image": emp.face_image_path,
            },
            "confidence": match["confidence"],
            "message": "Access suspended. Please contact HR or your administrator.",
        }

    # ── Active employee — record attendance ──────────────────────────────
    today = date.today().isoformat()
    now_utc = datetime.utcnow()
    local_now = datetime.now()

    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.employee_id == emp.id,
        AttendanceRecord.date == today,
    ).first()

    action = None
    if record is None:
        # Check if late
        status = "present"
        try:
            shift_h, shift_m = map(int, emp.shift_start.split(':'))
            shift_time = local_now.replace(hour=shift_h, minute=shift_m, second=0, microsecond=0)
            # 15 minute grace period
            if (local_now - shift_time).total_seconds() > 15 * 60:
                status = "late"
        except Exception:
            pass

        record = AttendanceRecord(
            employee_id=emp.id,
            date=today,
            check_in=now_utc,
            confidence=match["confidence"],
            status=status,
        )
        db.add(record)
        action = "check_in"
    elif record.check_out is None:
        record.check_out = now_utc
        action = "check_out"
    else:
        action = "already_complete"

    db.commit()

    # ── Broadcast WebSocket Event ────────────────────────────────────────────
    if action in ["check_in", "check_out"]:
        try:
            await manager.broadcast({
                "type": "attendance_update",
                "employee": emp.name,
                "action": action,
                "time": now_utc.isoformat(),
                "status": record.status
            })
        except Exception as e:
            logger.error(f"WS Broadcast error: {e}")

    return {
        "recognized": True,
        "blocked": False,
        "employee": {
            "id": emp.id,
            "name": emp.name,
            "department": emp.department,
            "position": emp.position,
            "face_image": emp.face_image_path,
        },
        "confidence": match["confidence"],
        "action": action,
        "check_in":  record.check_in.isoformat()  if record.check_in  else None,
        "check_out": record.check_out.isoformat() if record.check_out else None,
    }


# ════════════════════════════════════════════════════════════════════════════════
# ATTENDANCE ROUTES
# ════════════════════════════════════════════════════════════════════════════════

@app.get("/api/attendance", response_model=List[AttendanceOut])
def list_attendance(
    date_filter: Optional[str] = None,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(AttendanceRecord).join(Employee)
    if date_filter:
        q = q.filter(AttendanceRecord.date == date_filter)
    if employee_id:
        q = q.filter(AttendanceRecord.employee_id == employee_id)
    records = q.order_by(AttendanceRecord.check_in.desc()).all()

    result = []
    for r in records:
        out = AttendanceOut.model_validate(r)
        out.employee_name = r.employee.name if r.employee else None
        out.department = r.employee.department if r.employee else None
        result.append(out)
    return result


@app.delete("/api/attendance/{record_id}")
def delete_attendance(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    record = db.query(AttendanceRecord).filter(AttendanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    db.delete(record)
    db.commit()
    return {"message": "Attendance record deleted"}



@app.get("/api/attendance/stats", response_model=AttendanceStats)
def attendance_stats(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    today = date.today().isoformat()
    total = db.query(Employee).filter(Employee.is_active == True).count()
    present = db.query(AttendanceRecord).filter(AttendanceRecord.date == today).count()
    checked_out = db.query(AttendanceRecord).filter(
        AttendanceRecord.date == today,
        AttendanceRecord.check_out.isnot(None),
    ).count()
    late = db.query(AttendanceRecord).filter(
        AttendanceRecord.date == today,
        AttendanceRecord.status == "late",
    ).count()

    return AttendanceStats(
        total_employees=total,
        present_today=present,
        absent_today=max(total - present, 0),
        late_today=late,
        checked_out_today=checked_out,
    )


@app.get("/api/attendance/departments")
def departments_attendance(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    today = date.today().isoformat()
    departments = db.query(Employee.department).distinct().all()
    result = []
    for (dept,) in departments:
        total = db.query(Employee).filter(Employee.department == dept, Employee.is_active == True).count()
        present = (
            db.query(AttendanceRecord)
            .join(Employee)
            .filter(Employee.department == dept, AttendanceRecord.date == today)
            .count()
        )
        result.append({"department": dept, "total": total, "present": present, "absent": total - present})
    return result


@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


# ════════════════════════════════════════════════════════════════════════════════
# KIOSK STATUS  (in-memory flag — resets to "open" on server restart)
# ════════════════════════════════════════════════════════════════════════════════

_kiosk_state: dict = {"open": True, "message": ""}


@app.get("/api/kiosk/status")
def kiosk_status():
    """Public — polled by the kiosk every few seconds."""
    return _kiosk_state


@app.put("/api/kiosk/status")
def set_kiosk_status(
    payload: dict,
    _: User = Depends(require_admin),
):
    """
    Admin only. Payload: {"open": bool, "message": "Optional closed message"}
    """
    _kiosk_state["open"]    = bool(payload.get("open", True))
    _kiosk_state["message"] = str(payload.get("message", ""))
    logger.info(f"Kiosk status set to: {'OPEN' if _kiosk_state['open'] else 'CLOSED'}")
    return _kiosk_state


# ════════════════════════════════════════════════════════════════════════════════
# EMPLOYEE BLOCK / UNBLOCK  (convenience shortcut)
# ════════════════════════════════════════════════════════════════════════════════

@app.patch("/api/employees/{emp_id}/toggle-active")
def toggle_employee_active(
    emp_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Flip an employee's is_active flag. Blocked employees are excluded from recognition."""
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp.is_active = not emp.is_active
    emp.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(emp)
    status = "unblocked" if emp.is_active else "blocked"
    logger.info(f"Employee {emp.name} ({emp.employee_id}) {status}")
    return {"id": emp.id, "is_active": emp.is_active, "name": emp.name}

