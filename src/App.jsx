import { useState, useRef } from 'react'
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

export default function App() {
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [status, setStatus] = useState('idle') // idle | reading | error | done
  const [errorMsg, setErrorMsg] = useState('')
  const [shifts, setShifts] = useState([])
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

  const readyToDownload = shifts.some((s) => s.date && s.startTime && s.endTime)

  return (
    <div className="page">
      <header className="masthead">
        <span className="stamp">PUNCH IN</span>
        <h1>ShiftScan</h1>
        <p className="sub">Screenshot your schedule. Punch it into your calendar.</p>
      </header>

      <section className="card-slot">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleFile(e.target.files?.[0])}
          hidden
        />
        {!imagePreview ? (
          <button className="slot-button" onClick={() => inputRef.current?.click()}>
            <span className="slot-icon">▭</span>
            <span>Insert schedule screenshot</span>
            <span className="slot-hint">PNG, JPG, or paste a screen capture</span>
          </button>
        ) : (
          <div className="preview">
            <img src={imagePreview} alt="Uploaded schedule preview" />
            <div className="preview-actions">
              <button className="link-button" onClick={() => inputRef.current?.click()}>
                Choose a different image
              </button>
              <button className="primary-button" onClick={handleExtract} disabled={status === 'reading'}>
                {status === 'reading' ? 'Reading schedule…' : 'Read shifts from image'}
              </button>
            </div>
          </div>
        )}
      </section>

      {status === 'error' && (
        <div className="ledger-row error-row">
          <strong>Couldn't read that one.</strong> {errorMsg}
        </div>
      )}

      {shifts.length > 0 && (
        <section className="timesheet">
          <div className="timesheet-head">
            <h2>Shifts found</h2>
            <p>Check each row against the screenshot, then punch out a calendar file.</p>
          </div>

          <div className="ledger">
            <div className="ledger-header">
              <span>Title</span>
              <span>Date</span>
              <span>Start</span>
              <span>End</span>
              <span>Location</span>
              <span aria-hidden="true"></span>
            </div>
            {shifts.map((shift, i) => (
              <div className="ledger-row" key={i}>
                <input
                  value={shift.title}
                  onChange={(e) => updateShift(i, 'title', e.target.value)}
                  placeholder="Shift"
                />
                <input
                  type="date"
                  value={shift.date}
                  onChange={(e) => updateShift(i, 'date', e.target.value)}
                />
                <input
                  type="time"
                  value={shift.startTime}
                  onChange={(e) => updateShift(i, 'startTime', e.target.value)}
                />
                <input
                  type="time"
                  value={shift.endTime}
                  onChange={(e) => updateShift(i, 'endTime', e.target.value)}
                />
                <input
                  value={shift.location}
                  onChange={(e) => updateShift(i, 'location', e.target.value)}
                  placeholder="Optional"
                />
                <button className="remove-button" onClick={() => removeShift(i)} aria-label="Remove shift">
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="timesheet-actions">
            <button className="link-button" onClick={addShift}>
              + Add a row by hand
            </button>
            <button className="primary-button" onClick={handleDownload} disabled={!readyToDownload}>
              Download work-shifts.ics
            </button>
          </div>
        </section>
      )}

      <footer className="footer">
        <p>
          Every date, time, and title is editable before anything downloads — nothing is added to a
          calendar until you import the file yourself.
        </p>
      </footer>
    </div>
  )
}
