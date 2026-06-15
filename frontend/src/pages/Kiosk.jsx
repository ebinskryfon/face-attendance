import { useCallback, useEffect, useRef, useState } from 'react'
import Webcam from 'react-webcam'
import { format } from 'date-fns'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

// ── Public API calls — no auth token needed ───────────────────────────────────
async function recognize(imageData) {
  const res = await fetch(`${API_BASE}/api/face/recognize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_data: imageData }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Recognition failed')
  }
  return res.json()
}

async function fetchKioskStatus() {
  const res = await fetch(`${API_BASE}/api/kiosk/status`)
  return res.json()
}

// How long the result splash stays visible before resetting (ms)
const RESULT_DISPLAY_MS   = 5000
// Delay between auto-scan attempts when idle (ms)
const AUTO_SCAN_INTERVAL_MS = 3000
// How often to poll kiosk open/closed status (ms)
const STATUS_POLL_MS      = 5000

// ── Component ─────────────────────────────────────────────────────────────────
export default function Kiosk() {
  const webcamRef   = useRef(null)
  const timerRef    = useRef(null)
  const scanLoopRef = useRef(null)

  const [phase, setPhase]         = useState('idle')   // idle | scanning | success | fail | error
  const [result, setResult]       = useState(null)
  const [clock, setClock]         = useState(new Date())
  const [errMsg, setErrMsg]       = useState('')
  const [kioskOpen, setKioskOpen] = useState(true)
  const [closedMsg, setClosedMsg] = useState('')

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Poll kiosk open/closed status
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await fetchKioskStatus()
        setKioskOpen(s.open)
        setClosedMsg(s.message || '')
      } catch { /* ignore network errors */ }
    }
    poll() // immediate
    const id = setInterval(poll, STATUS_POLL_MS)
    return () => clearInterval(id)
  }, [])

  // Reset to idle + restart auto-scan loop
  const reset = useCallback(() => {
    clearTimeout(timerRef.current)
    setPhase('idle')
    setResult(null)
    setErrMsg('')
  }, [])

  // Single scan attempt
  const scan = useCallback(async () => {
    const img = webcamRef.current?.getScreenshot()
    if (!img) return

    setPhase('scanning')
    try {
      const data = await recognize(img)
      setResult(data)
      if (data.recognized && data.blocked) {
        setPhase('blocked')
      } else if (data.recognized) {
        setPhase('success')
      } else {
        setPhase('fail')
      }
    } catch (e) {
      setErrMsg(e.message || 'Recognition failed')
      setPhase('error')
    }
    timerRef.current = setTimeout(reset, RESULT_DISPLAY_MS)
  }, [reset])

  // Auto-scan loop — only runs when idle AND kiosk is open
  useEffect(() => {
    if (phase !== 'idle' || !kioskOpen) {
      clearInterval(scanLoopRef.current)
      return
    }
    scanLoopRef.current = setInterval(scan, AUTO_SCAN_INTERVAL_MS)
    return () => clearInterval(scanLoopRef.current)
  }, [phase, scan, kioskOpen])

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimeout(timerRef.current)
    clearInterval(scanLoopRef.current)
  }, [])

  const actionLabel = () => {
    if (!result?.action) return ''
    if (result.action === 'check_in')        return 'Checked In'
    if (result.action === 'check_out')       return 'Checked Out'
    if (result.action === 'already_complete') return 'Already Recorded'
    return ''
  }

  const actionEmoji = () => {
    if (!result?.action) return ''
    if (result.action === 'check_in')        return '✅'
    if (result.action === 'check_out')       return '🚪'
    if (result.action === 'already_complete') return '⚡'
    return ''
  }

  return (
    <div className="kiosk-standalone">

      {/* ── Header bar ───────────────────────────────────────────────── */}
      <header className="kiosk-topbar">
        <div className="kiosk-brand">
          <span className="kiosk-brand-dot" />
          FaceAttend
        </div>
        <div className="kiosk-clock-wrap">
          <span className="kiosk-time">{format(clock, 'HH:mm:ss')}</span>
          <span className="kiosk-date">{format(clock, 'EEEE, d MMMM yyyy')}</span>
        </div>
      </header>

      {/* ── Main area ────────────────────────────────────────────────── */}
      <main className="kiosk-main">

        {/* Kiosk CLOSED overlay */}
        {!kioskOpen && (
          <div className="kiosk-closed-screen">
            <div className="kiosk-closed-icon">🌙</div>
            <h2 className="kiosk-closed-title">Attendance Closed</h2>
            <p className="kiosk-closed-msg">
              {closedMsg || 'The attendance kiosk is currently unavailable.'}
            </p>
            <p className="kiosk-closed-sub">Please contact your administrator.</p>
          </div>
        )}

        {/* Camera feed — hidden (but mounted) when closed so webcam restarts fast */}
        <div
          className={`kiosk-cam-frame ${phase === 'scanning' ? 'frame-scanning' : ''} ${phase === 'success' ? 'frame-success' : ''} ${phase === 'fail' || phase === 'error' ? 'frame-fail' : ''}`}
          style={kioskOpen ? {} : { visibility: 'hidden', pointerEvents: 'none' }}
        >
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: 'user', width: 720, height: 960 }}
            mirrored
            className="kiosk-video"
          />

          {/* Corner guides */}
          <div className="kiosk-corners">
            <div className="kc tl" /><div className="kc tr" />
            <div className="kc bl" /><div className="kc br" />
          </div>

          {/* Scan line animation */}
          {phase === 'scanning' && (
            <div className="kiosk-scanline-wrap">
              <div className="kiosk-scanline" />
            </div>
          )}

          {/* Tap-to-scan hint */}
          {phase === 'idle' && (
            <div className="kiosk-idle-overlay" onClick={scan}>
              <div className="kiosk-idle-pulse" />
              <p className="kiosk-idle-hint">Auto-scanning · Tap to scan now</p>
            </div>
          )}
        </div>

        {/* ── Result splash ─────────────────────────────────────────── */}
        {(phase === 'success' || phase === 'blocked' || phase === 'fail' || phase === 'error') && (
          <div className={`kiosk-splash ${phase}`} onClick={reset}>

            {/* SUCCESS */}
            {phase === 'success' && result && (
              <>
                <div className="kiosk-splash-icon success-icon">
                  {result.employee?.face_image
                    ? <img src={result.employee.face_image.startsWith('http') ? result.employee.face_image : API_BASE + result.employee.face_image} alt={result.employee.name} className="splash-photo" />
                    : <span>✅</span>
                  }
                </div>
                <h2 className="splash-name">{result.employee.name}</h2>
                <p className="splash-dept">{result.employee.department} · {result.employee.position}</p>
                <div className={`splash-action-badge ${result.action}`}>
                  {actionEmoji()} {actionLabel()}
                </div>
                <div className="splash-times">
                  {result.check_in && (
                    <span>In: {format(new Date(result.check_in + 'Z'), 'HH:mm:ss')}</span>
                  )}
                  {result.check_out && (
                    <span>Out: {format(new Date(result.check_out + 'Z'), 'HH:mm:ss')}</span>
                  )}
                </div>
                <p className="splash-conf">
                  Confidence {(result.confidence * 100).toFixed(1)}%
                </p>
              </>
            )}

            {/* ACCESS SUSPENDED — blocked employee identified */}
            {phase === 'blocked' && result && (
              <>
                <div className="kiosk-splash-icon blocked-icon">
                  {result.employee?.face_image
                    ? <img src={result.employee.face_image.startsWith('http') ? result.employee.face_image : API_BASE + result.employee.face_image} alt={result.employee.name} className="splash-photo blocked-photo" />
                    : <span className="blocked-initials">
                        {result.employee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </span>
                  }
                </div>
                <div className="blocked-shield">🔒</div>
                <h2 className="splash-name">{result.employee.name}</h2>
                <p className="splash-dept">{result.employee.department} · {result.employee.position}</p>
                <div className="blocked-access-badge">⛔ Access Suspended</div>
                <p className="blocked-message">
                  Your access to this facility has been temporarily suspended.
                </p>
                <p className="blocked-contact">
                  Please contact <strong>HR</strong> or your administrator to resolve this.
                </p>
              </>
            )}

            {/* FACE NOT RECOGNISED */}
            {phase === 'fail' && (
              <>
                <div className="kiosk-splash-icon fail-icon">❓</div>
                <h2 className="splash-name">Face Not Recognised</h2>
                <p className="splash-dept">Please stand closer and ensure good lighting</p>
                <p className="splash-dept" style={{ marginTop: '0.25rem', fontSize: '0.78rem' }}>
                  Contact your administrator if the problem persists
                </p>
              </>
            )}

            {/* DETECTION ERROR */}
            {phase === 'error' && (
              <>
                <div className="kiosk-splash-icon fail-icon">⚠️</div>
                <h2 className="splash-name">Detection Error</h2>
                <p className="splash-dept">{errMsg}</p>
              </>
            )}

            <p className="splash-dismiss">Tap anywhere to dismiss</p>
          </div>
        )}


        {/* Scanning overlay label */}
        {phase === 'scanning' && (
          <div className="kiosk-scanning-label">
            <span className="spinner lg" />
            <span>Scanning…</span>
          </div>
        )}
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="kiosk-footer">
        {phase === 'idle'
          ? 'Stand in front of the camera — scanning automatically every 3 s'
          : phase === 'scanning'
          ? 'Processing…'
          : 'Result shown · returning to idle soon'}
      </footer>
    </div>
  )
}
