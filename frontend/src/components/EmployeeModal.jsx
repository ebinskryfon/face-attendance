import { useState } from 'react'
import api from '../api'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'

const DEPARTMENTS = ['Engineering', 'HR', 'Finance', 'Marketing', 'Operations', 'Sales', 'IT', 'Legal']

export default function EmployeeModal({ employee, onClose, onSaved }) {
  const isEdit = !!employee
  const [form, setForm] = useState(
    employee
      ? { name: employee.name, department: employee.department, position: employee.position, email: employee.email || '', phone: employee.phone || '', shift_start: employee.shift_start || '09:00', shift_end: employee.shift_end || '17:00' }
      : { employee_id: '', name: '', department: '', position: '', email: '', phone: '', shift_start: '09:00', shift_end: '17:00' }
  )
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isEdit) {
        await api.patch(`/employees/${employee.id}`, form)
        toast.success('Employee updated')
      } else {
        await api.post('/employees', form)
        toast.success('Employee created')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Employee' : 'Add Employee'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {!isEdit && (
            <div className="field">
              <label>Employee ID *</label>
              <input value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} required placeholder="EMP001" />
            </div>
          )}
          <div className="field">
            <label>Full Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="John Doe" />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Department *</label>
              <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} required>
                <option value="">Select…</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Position *</label>
              <input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} required placeholder="Software Engineer" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 234 567 8900" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Shift Start</label>
              <input type="time" value={form.shift_start} onChange={e => setForm({ ...form, shift_start: e.target.value })} required />
            </div>
            <div className="field">
              <label>Shift End</label>
              <input type="time" value={form.shift_end} onChange={e => setForm({ ...form, shift_end: e.target.value })} required />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : isEdit ? 'Save Changes' : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
