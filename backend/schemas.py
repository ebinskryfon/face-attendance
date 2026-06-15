from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


# ── Auth ────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: str = Field(default="admin", pattern="^(admin|viewer)$")


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


# ── Employee ─────────────────────────────────────────────────────────────────

class EmployeeCreate(BaseModel):
    employee_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    department: str = Field(..., min_length=1, max_length=100)
    position: str = Field(..., min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    shift_start: Optional[str] = Field("09:00", pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$")
    shift_end: Optional[str] = Field("17:00", pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$")


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    shift_start: Optional[str] = Field(None, pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$")
    shift_end: Optional[str] = Field(None, pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$")
    is_active: Optional[bool] = None


class EmployeeOut(BaseModel):
    id: int
    employee_id: str
    name: str
    department: str
    position: str
    email: Optional[str]
    phone: Optional[str]
    face_image_path: Optional[str]
    shift_start: str
    shift_end: str
    is_active: bool
    created_at: datetime
    has_face: bool = False

    class Config:
        from_attributes = True


# ── Face Registration ─────────────────────────────────────────────────────────

class FaceRegisterRequest(BaseModel):
    employee_id: int
    image_data: str  # base64 encoded image


class FaceRecognizeRequest(BaseModel):
    image_data: str  # base64 encoded image


# ── Attendance ────────────────────────────────────────────────────────────────

class AttendanceOut(BaseModel):
    id: int
    employee_id: int
    date: str
    check_in: Optional[datetime]
    check_out: Optional[datetime]
    confidence: Optional[float]
    status: str
    notes: Optional[str]
    employee_name: Optional[str] = None
    department: Optional[str] = None

    class Config:
        from_attributes = True


class AttendanceStats(BaseModel):
    total_employees: int
    present_today: int
    absent_today: int
    late_today: int
    checked_out_today: int
