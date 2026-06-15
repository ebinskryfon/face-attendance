import { useEffect, useState } from 'react'
import api from '../api'
import { format } from 'date-fns'
import {
  Users, UserCheck, UserX, Clock, TrendingUp, Building2,
  Monitor, MonitorOff, Power
} from 'lucide-react'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement
} from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

export default function Dashboard() {
  const [stats, setStats]                   = useState(null)
  const [deptData, setDeptData]             = useState([])
  const [recentAttendance, setRecentAttendance] = useState([])
  const [kiosk, setKiosk]                   = useState({ open: true, message: '' })
  const [kioskMsg, setKioskMsg]             = useState('')
  const [kioskBusy, setKioskBusy]           = useState(false)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    const load = async () => {
      const [s, d, a, k] = await Promise.all([
        api.get('/attendance/stats'),
        api.get('/attendance/departments'),
        api.get(`/attendance?date_filter=${today}`),
        api.get('/kiosk/status').then(r => r.data),
      ])
      setStats(s.data)
      setDeptData(d.data)
      setRecentAttendance(a.data.slice(0, 10))
      setKiosk(k)
      setKioskMsg(k.message || '')
    }
    load()

    // Real-time updates via WebSockets
    const getWsEndpoint = () => {
      const apiBase = import.meta.env.VITE_API_BASE_URL;
      if (apiBase) {
        return apiBase.replace(/^http/, 'ws') + '/api/ws/admin';
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return import.meta.env.DEV 
        ? `ws://localhost:8000/api/ws/admin` 
        : `${protocol}//${window.location.host}/api/ws/admin`;
    };
    
    let ws = new WebSocket(getWsEndpoint())
    
    ws.onmessage = (event) => {
      // Event received from Kiosk Check-in/out
      console.log("Real-time update:", event.data)
      // Flash a little animation on the dashboard or just reload stats instantly
      load()
    }
    
    ws.onclose = () => {
      console.log("WebSocket disconnected")
    }

    // Still keep a slow poll as a fallback (e.g. if WS drops)
    const interval = setInterval(load, 60000)
    return () => {
      clearInterval(interval)
      ws.close()
    }
  }, [today])

  const toggleKiosk = async () => {
    setKioskBusy(true)
    try {
      const { data } = await api.put('/kiosk/status', {
        open: !kiosk.open,
        message: kioskMsg,
      })
      setKiosk(data)
    } catch {
      // toast handled by api interceptor
    } finally {
      setKioskBusy(false)
    }
  }

  if (!stats) return <div className="loading-center"><span className="spinner lg" /></div>

  const attendanceRate = stats.total_employees
    ? Math.round((stats.present_today / stats.total_employees) * 100)
    : 0

  const donutData = {
    labels: ['Present', 'Absent'],
    datasets: [{
      data: [stats.present_today, stats.absent_today],
      backgroundColor: ['#6366f1', '#1e1e2e'],
      borderColor: ['#818cf8', '#3b3b52'],
      borderWidth: 2,
    }],
  }

  const barData = {
    labels: deptData.map(d => d.department),
    datasets: [
      {
        label: 'Present',
        data: deptData.map(d => d.present),
        backgroundColor: '#6366f1',
        borderRadius: 6,
      },
      {
        label: 'Absent',
        data: deptData.map(d => d.absent),
        backgroundColor: '#3b3b52',
        borderRadius: 6,
      },
    ],
  }

  const barOptions = {
    responsive: true,
    plugins: { legend: { labels: { color: '#a0aec0' } } },
    scales: {
      x: { ticks: { color: '#a0aec0' }, grid: { color: '#2d2d44' } },
      y: { ticks: { color: '#a0aec0' }, grid: { color: '#2d2d44' } },
    },
  }

  const donutOptions = {
    plugins: { legend: { labels: { color: '#a0aec0' } } },
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p className="subtitle">{format(new Date(), 'EEEE, MMMM do yyyy')}</p>
        </div>
        <div className="attendance-badge">
          <TrendingUp size={16} />
          {attendanceRate}% Attendance Rate
        </div>
      </div>

      {/* Kiosk Control */}
      <div className={`card kiosk-control-card ${kiosk.open ? 'kiosk-open' : 'kiosk-closed'}`}>
        <div className="kiosk-control-header">
          <div className="kiosk-control-title">
            {kiosk.open ? <Monitor size={20} /> : <MonitorOff size={20} />}
            <span>Kiosk Interface</span>
            <span className={`kiosk-status-dot ${kiosk.open ? 'on' : 'off'}`} />
            <span className={`badge ${kiosk.open ? 'kiosk-on' : 'kiosk-off'}`}>
              {kiosk.open ? 'OPEN' : 'CLOSED'}
            </span>
          </div>
          <button
            className={`btn-primary ${kiosk.open ? 'btn-danger' : 'btn-success'}`}
            onClick={toggleKiosk}
            disabled={kioskBusy}
          >
            {kioskBusy
              ? <><span className="spinner" /> Working…</>
              : kiosk.open
                ? <><MonitorOff size={16} /> Shut Down Kiosk</>
                : <><Power size={16} /> Open Kiosk</>
            }
          </button>
        </div>
        <div className="kiosk-control-body">
          <div className="field" style={{ flex: 1 }}>
            <label>Closed Message (shown on kiosk display)</label>
            <input
              value={kioskMsg}
              onChange={e => setKioskMsg(e.target.value)}
              placeholder="e.g. Attendance closed for today. See you tomorrow!"
              disabled={kiosk.open}
            />
          </div>
          {!kiosk.open && (
            <button
              className="btn-secondary"
              style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
              onClick={async () => {
                const { data } = await api.put('/kiosk/status', { open: false, message: kioskMsg })
                setKiosk(data)
              }}
            >
              Update Message
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">
        <StatCard icon={<Users />} label="Total Employees" value={stats.total_employees} color="blue" />
        <StatCard icon={<UserCheck />} label="Present Today" value={stats.present_today} color="green" />
        <StatCard icon={<UserX />} label="Absent Today" value={stats.absent_today} color="red" />
        <StatCard icon={<Clock />} label="Checked Out" value={stats.checked_out_today} color="purple" />
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="card">
          <h3 className="card-title"><Building2 size={16} /> Department Overview</h3>
          <Bar data={barData} options={barOptions} />
        </div>
        <div className="card">
          <h3 className="card-title">Today's Attendance</h3>
          <div className="donut-wrap">
            <Doughnut data={donutData} options={donutOptions} />
          </div>
        </div>
      </div>

      {/* Recent Attendance */}
      <div className="card">
        <h3 className="card-title">Recent Check-ins</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentAttendance.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.employee_name}</strong></td>
                  <td>{r.department}</td>
                  <td>{r.check_in ? format(new Date(r.check_in + 'Z'), 'HH:mm') : '—'}</td>
                  <td>{r.check_out ? format(new Date(r.check_out + 'Z'), 'HH:mm') : '—'}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                </tr>
              ))}
              {recentAttendance.length === 0 && (
                <tr><td colSpan={5} className="empty-row">No records today</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}
