import { useEffect, useState } from 'react'
import api from '../api'
import toast from 'react-hot-toast'
import { Plus, Search, Edit2, Trash2, Camera, User, ShieldOff, ShieldCheck, Clock } from 'lucide-react'
import EmployeeModal from '../components/EmployeeModal'
import FaceRegisterModal from '../components/FaceRegisterModal'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [editEmp, setEditEmp]     = useState(null)
  const [faceEmp, setFaceEmp]     = useState(null)
  const [toggling, setToggling]   = useState(null) // emp id being toggled

  const load = async () => {
    try {
      const { data } = await api.get('/employees', { params: { search: search || undefined } })
      setEmployees(data)
    } catch { toast.error('Failed to load employees') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [search])

  const handleDelete = async (emp) => {
    if (!confirm(`Delete ${emp.name}? This cannot be undone.`)) return
    try {
      await api.delete(`/employees/${emp.id}`)
      toast.success('Employee deleted')
      load()
    } catch { toast.error('Delete failed') }
  }

  const handleToggleActive = async (emp) => {
    setToggling(emp.id)
    try {
      const { data } = await api.patch(`/employees/${emp.id}/toggle-active`)
      const action = data.is_active ? 'unblocked' : 'blocked'
      toast.success(`${data.name} ${action}`)
      // Optimistic local update
      setEmployees(prev =>
        prev.map(e => e.id === emp.id ? { ...e, is_active: data.is_active } : e)
      )
    } catch {
      toast.error('Failed to update employee status')
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Employees</h2>
          <p className="subtitle">{employees.length} total</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add Employee
        </button>
      </div>

      <div className="search-bar">
        <Search size={16} />
        <input
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading-center"><span className="spinner lg" /></div>
      ) : (
        <div className="employee-grid">
          {employees.map(emp => (
            <div key={emp.id} className={`employee-card ${!emp.is_active ? 'emp-blocked' : ''}`}>
              <div className="emp-avatar">
                {emp.face_image_path
                  ? <img src={emp.face_image_path.startsWith('http') ? emp.face_image_path : API_BASE + emp.face_image_path} alt={emp.name} />
                  : <User size={32} />}
                <span className={`face-dot ${emp.has_face ? 'registered' : 'unregistered'}`} />
              </div>

              {/* Blocked banner */}
              {!emp.is_active && (
                <div className="blocked-banner">🚫 Access Blocked</div>
              )}

              <div className="emp-info">
                <h4>{emp.name}</h4>
                <p>{emp.position}</p>
                <span className="dept-tag">{emp.department}</span>
                <p className="emp-id">ID: {emp.employee_id}</p>
                <p className="emp-id" style={{ marginTop: '0.2rem', color: 'var(--text-muted)' }}>
                  <Clock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }} />
                  Shift: {emp.shift_start || '09:00'} - {emp.shift_end || '17:00'}
                </p>
              </div>

              <div className="emp-actions">
                {/* Block / Unblock */}
                <button
                  className={`icon-btn ${!emp.is_active ? 'btn-unblock' : 'danger'}`}
                  title={emp.is_active ? 'Block Access' : 'Unblock Access'}
                  onClick={() => handleToggleActive(emp)}
                  disabled={toggling === emp.id}
                >
                  {toggling === emp.id
                    ? <span className="spinner" style={{ width: 14, height: 14 }} />
                    : emp.is_active
                      ? <ShieldOff size={16} />
                      : <ShieldCheck size={16} />
                  }
                </button>

                <button
                  className="icon-btn"
                  title="Register Face"
                  onClick={() => setFaceEmp(emp)}
                >
                  <Camera size={16} />
                </button>
                <button
                  className="icon-btn"
                  title="Edit"
                  onClick={() => setEditEmp(emp)}
                >
                  <Edit2 size={16} />
                </button>
                <button
                  className="icon-btn danger"
                  title="Delete"
                  onClick={() => handleDelete(emp)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {employees.length === 0 && (
            <div className="empty-state">
              <User size={48} />
              <p>No employees found</p>
            </div>
          )}
        </div>
      )}

      {(showAdd || editEmp) && (
        <EmployeeModal
          employee={editEmp}
          onClose={() => { setShowAdd(false); setEditEmp(null) }}
          onSaved={load}
        />
      )}

      {faceEmp && (
        <FaceRegisterModal
          employee={faceEmp}
          onClose={() => setFaceEmp(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
