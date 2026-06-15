import { useEffect, useState } from 'react'
import api from '../api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Download, Filter, Trash2 } from 'lucide-react'

export default function Attendance() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'))

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/attendance', {
        params: { date_filter: dateFilter }
      })
      setRecords(data)
    } catch { toast.error('Failed to load attendance') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [dateFilter])

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this attendance record?')) return
    try {
      await api.delete(`/attendance/${id}`)
      toast.success('Record deleted')
      load()
    } catch {
      toast.error('Failed to delete record')
    }
  }

  const exportCSV = () => {
    const headers = ['Employee', 'Department', 'Date', 'Check In', 'Check Out', 'Status', 'Confidence']
    const rows = records.map(r => [
      r.employee_name,
      r.department,
      r.date,
      r.check_in ? format(new Date(r.check_in + 'Z'), 'HH:mm:ss') : '',
      r.check_out ? format(new Date(r.check_out + 'Z'), 'HH:mm:ss') : '',
      r.status,
      r.confidence ? (r.confidence * 100).toFixed(1) + '%' : '',
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${dateFilter}.csv`
    a.click()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Attendance Records</h2>
          <p className="subtitle">{records.length} records</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div className="date-filter">
            <Filter size={14} />
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={exportCSV}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><span className="spinner lg" /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Date</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Duration</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const duration = r.check_in && r.check_out
                    ? Math.round((new Date(r.check_out + 'Z') - new Date(r.check_in + 'Z')) / 60000)
                    : null
                  return (
                    <tr key={r.id}>
                      <td className="muted">{i + 1}</td>
                      <td><strong>{r.employee_name}</strong></td>
                      <td>{r.department}</td>
                      <td>{r.date}</td>
                      <td>{r.check_in ? format(new Date(r.check_in + 'Z'), 'HH:mm:ss') : '—'}</td>
                      <td>{r.check_out ? format(new Date(r.check_out + 'Z'), 'HH:mm:ss') : '—'}</td>
                      <td>{duration !== null ? `${duration} min` : '—'}</td>
                      <td>{r.confidence ? `${(r.confidence * 100).toFixed(1)}%` : '—'}</td>
                      <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                      <td>
                        <button className="btn-icon" style={{ color: 'var(--error)' }} onClick={() => handleDelete(r.id)} title="Delete Record">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {records.length === 0 && (
                  <tr><td colSpan={9} className="empty-row">No records for {dateFilter}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
