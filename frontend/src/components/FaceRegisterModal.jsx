import { useCallback, useRef, useState } from 'react'
import Webcam from 'react-webcam'
import api from '../api'
import toast from 'react-hot-toast'
import { X, Camera, Upload, CheckCircle } from 'lucide-react'

const VIDEO_CONSTRAINTS = { width: 480, height: 360, facingMode: 'user' }

export default function FaceRegisterModal({ employee, onClose, onSaved }) {
  const webcamRef = useRef(null)
  const [captured, setCaptured] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('camera') // 'camera' | 'upload'

  const capture = useCallback(() => {
    const img = webcamRef.current?.getScreenshot()
    if (img) setCaptured(img)
  }, [])

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCaptured(reader.result)
    reader.readAsDataURL(file)
  }

  const handleRegister = async () => {
    if (!captured) return
    setLoading(true)
    try {
      await api.post('/face/register', {
        employee_id: employee.id,
        image_data: captured,
      })
      toast.success(`Face registered for ${employee.name}`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal face-modal">
        <div className="modal-header">
          <h3>Register Face — {employee.name}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="tab-bar">
          <button className={mode === 'camera' ? 'tab active' : 'tab'} onClick={() => setMode('camera')}>
            <Camera size={14} /> Camera
          </button>
          <button className={mode === 'upload' ? 'tab active' : 'tab'} onClick={() => setMode('upload')}>
            <Upload size={14} /> Upload
          </button>
        </div>

        <div className="face-capture">
          {mode === 'camera' ? (
            <>
              {!captured ? (
                <div className="webcam-wrap">
                  <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg"
                    videoConstraints={VIDEO_CONSTRAINTS} mirrored className="webcam-feed" />
                  <button className="btn-primary mt-1" onClick={capture}>
                    <Camera size={16} /> Capture
                  </button>
                </div>
              ) : (
                <div className="preview-wrap">
                  <img src={captured} alt="Captured" className="preview-img" />
                  <button className="btn-secondary mt-1" onClick={() => setCaptured(null)}>Retake</button>
                </div>
              )}
            </>
          ) : (
            <div className="upload-area">
              {!captured ? (
                <label className="upload-label">
                  <Upload size={32} />
                  <span>Click to upload a face photo</span>
                  <input type="file" accept="image/*" onChange={handleUpload} hidden />
                </label>
              ) : (
                <div className="preview-wrap">
                  <img src={captured} alt="Uploaded" className="preview-img" />
                  <button className="btn-secondary mt-1" onClick={() => setCaptured(null)}>Remove</button>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="face-hint">✓ Clear, front-facing photo &nbsp;·&nbsp; ✓ Good lighting &nbsp;·&nbsp; ✗ No sunglasses</p>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleRegister}
            disabled={!captured || loading}
          >
            {loading ? <span className="spinner" /> : <><CheckCircle size={16} /> Register Face</>}
          </button>
        </div>
      </div>
    </div>
  )
}
