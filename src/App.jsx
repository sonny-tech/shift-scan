import { useState, useRef, useEffect } from 'react'
import { downloadIcs } from './generateIcs'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function emptyShift() {
  return { title: 'Shift', date: '', startTime: '', endTime: '', location: '' }
}

const MIN_LOADING_MS = 1600

const LOADING_STEPS = [
  'Reading your screenshot',
  'Finding dates and shift times',
  'Building your shift list',
]

function Logo({ size = 28 }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
      <span className="logo-inner" />
    </span>
  )
}

function Loader() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setStep((n) => Math.min(n + 1, LOADING_STEPS.length - 1))
    }, 1700)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader-core">
        <div className="loader-mark">
          <span className="loader-ring" />
          <span className="loader-ring loader-ring-late" />
          <Logo size={72} />
        </div>
        <p className="loader-step" key={step}>
          {LOADING_STEPS[step]}
        </p>
        <div className="loader-track" aria-hidden="true">
          <span className="loader-bar" />
        </div>
        <p className="loader-note">This usually takes a few seconds</p>
      </div>
    </div>
  )
}

export default function App() {
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [status, setStatus] = useState('idle') // idle | reading | error | done
  const [errorMsg, setErrorMsg] = useState('')
  const [shifts, setShifts] = useState([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  async function handleFile(file) {
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setShifts([])
    setStatus('idle')
  }

  async function handleExtract() {
    if (!imageFile) return
    setStatus('reading')
    setErrorMsg('')
    const started = Date.now()
    try {
      const base64 = await fileToBase64(imageFile)
      const res = await fetch('/.netlify/functions/parse-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: imageFile.type || 'image/png' }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong reading the schedule')
      }
      const cleaned = (data.shifts || []).map((s) => ({
        title: s.title || 'Shift',
        date: s.date || '',
        startTime: s.startTime || '',
        endTime: s.endTime || '',
        location: s.location || '',
      }))
      // Keep the loading screen up long enough to avoid a flash on fast responses
      const remaining = MIN_LOADING_MS - (Date.now() - started)
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))
      setShifts(cleaned)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  function updateShift(index, field, value) {
    setShifts((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  function removeShift(index) {
    setShifts((prev) => prev.filter((_, i) => i !== index))
  }

  function addShift() {
    setShifts((prev) => [...prev, emptyShift()])
  }

  function handleDownload() {
    const valid = shifts.filter((s) => s.date && s.startTime && s.endTime)
    downloadIcs(valid, 'work-shifts.ics', 'Work Shifts')
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) handleFile(file)
  }

  const readyToDownload = shifts.some((s) => s.date && s.startTime && s.endTime)

  return (
    <div className="app">
      {status === 'reading' && <Loader />}

      <header className="nav">
        <div className="nav-inner">
          <a className="brand" href="/" aria-label="ShiftScan home">
            <Logo />
            <span>ShiftScan</span>
          </a>
          <button className="btn btn-dark btn-sm" onClick={() => inputRef.current?.click()}>
            Choose screenshot
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <span className="badge">
            <span className="badge-dot" />
            Works with Google, Apple, and Outlook calendars
          </span>
          <h1>
            Turn schedule screenshots <span className="muted">into calendar events</span>
          </h1>
          <p className="lede">
            Upload a screenshot of your work schedule. ShiftScan reads every shift, lets you check
            it, and gives you one file to import into your calendar.
          </p>

          <div className="stage">
            <FloatingCards />

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0])}
              hidden
            />

            {!imagePreview ? (
              <button
                className={`dropzone ${dragging ? 'is-dragging' : ''}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <span className="drop-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 16V4" />
                    <path d="m7 9 5-5 5 5" />
                    <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
                  </svg>
                </span>
                <span className="drop-title">Upload your schedule screenshot</span>
                <span className="drop-hint">Drop an image here, or click to browse. PNG or JPG.</span>
              </button>
            ) : (
              <div className="preview">
                <div className="preview-frame">
                  <img src={imagePreview} alt="Uploaded schedule preview" />
                </div>
                <div className="preview-actions">
                  <button className="btn btn-ghost" onClick={() => inputRef.current?.click()}>
                    Choose a different image
                  </button>
                  <button
                    className="btn btn-dark"
                    onClick={handleExtract}
                    disabled={status === 'reading'}
                  >
                    {status === 'reading' ? 'Reading schedule…' : 'Read shifts from image'}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14" />
                      <path d="m13 6 6 6-6 6" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>

          {status === 'error' && (
            <div className="alert" role="alert">
              <strong>Couldn’t read that image.</strong> {errorMsg}
            </div>
          )}
        </section>

        {shifts.length > 0 && (
          <section className="results">
            <div className="results-head">
              <h2>Shifts found</h2>
              <p>Check each row against your screenshot, then download the calendar file.</p>
            </div>

            <div className="table-card">
              <div className="row row-head" aria-hidden="true">
                <span>Title</span>
                <span>Date</span>
                <span>Start</span>
                <span>End</span>
                <span>Location</span>
                <span />
              </div>
              {shifts.map((shift, i) => (
                <div className="row" key={i}>
                  <label className="field">
                    <span className="field-label">Title</span>
                    <input
                      value={shift.title}
                      onChange={(e) => updateShift(i, 'title', e.target.value)}
                      placeholder="Shift"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Date</span>
                    <input
                      type="date"
                      value={shift.date}
                      onChange={(e) => updateShift(i, 'date', e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Start</span>
                    <input
                      type="time"
                      value={shift.startTime}
                      onChange={(e) => updateShift(i, 'startTime', e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">End</span>
                    <input
                      type="time"
                      value={shift.endTime}
                      onChange={(e) => updateShift(i, 'endTime', e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Location</span>
                    <input
                      value={shift.location}
                      onChange={(e) => updateShift(i, 'location', e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <button
                    className="remove"
                    onClick={() => removeShift(i)}
                    aria-label="Remove shift"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="results-actions">
              <button className="btn btn-outline" onClick={addShift}>
                Add a row
              </button>
              <button className="btn btn-dark" onClick={handleDownload} disabled={!readyToDownload}>
                Download work-shifts.ics
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>
          Every date, time, and title is editable before anything downloads. Nothing is added to a
          calendar until you import the file yourself.
        </p>
      </footer>
    </div>
  )
}

// Decorative cards that orbit the upload area (purely visual)
function FloatingCards() {
  return (
    <div className="floaters" aria-hidden="true">
      <div className="float-card fc-a">
        <span className="fc-title">Shift</span>
        <span className="fc-bar fc-bar-dark" />
        <span className="fc-bar" />
      </div>
      <div className="float-card fc-b">
        <span className="fc-title">Times</span>
        <span className="fc-line" />
        <span className="fc-line fc-short" />
        <span className="fc-line" />
      </div>
      <div className="float-card fc-c">
        <span className="fc-title">Calendars</span>
        <span className="fc-row"><i className="dot dot-green" />Google</span>
        <span className="fc-row"><i className="dot dot-amber" />Apple</span>
      </div>
      <div className="float-card fc-d">
        <span className="fc-title">Export</span>
        <span className="fc-row"><i className="dot dot-dark" />.ics file</span>
        <span className="fc-line fc-short" />
      </div>
    </div>
  )
}
