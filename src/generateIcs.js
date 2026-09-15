// Builds a standards-compliant .ics file from an array of shift objects.
//
// Each shift looks like:
// {
//   title: "Front Desk Shift",
//   date: "2026-09-15",       // YYYY-MM-DD
//   startTime: "09:00",       // 24h HH:MM, local time
//   endTime: "17:00",         // 24h HH:MM, local time
//   location: "Main Building" // optional
// }

function pad(n) {
  return String(n).padStart(2, '0')
}

// Formats a date + time into the local (floating) iCal format: YYYYMMDDTHHMMSS
// We deliberately use "floating" time (no Z, no TZID) so the event shows at
// the same wall-clock time regardless of which calendar app/timezone it's
// imported into — the safest default for "my shift starts at 9am".
function toIcsLocal(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-')
  const [hh, mm] = timeStr.split(':')
  return `${y}${m}${d}T${pad(hh)}${pad(mm)}00`
}

function nowStamp() {
  const d = new Date()
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

// Escapes characters that have special meaning in the iCalendar spec (RFC 5545).
function escapeText(str = '') {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

// Folds lines longer than 75 octets per RFC 5545 so strict parsers don't choke.
function foldLine(line) {
  if (line.length <= 75) return line
  let result = ''
  let remaining = line
  let first = true
  while (remaining.length > 0) {
    const chunkSize = first ? 75 : 74
    result += (first ? '' : '\r\n ') + remaining.slice(0, chunkSize)
    remaining = remaining.slice(chunkSize)
    first = false
  }
  return result
}

export function shiftsToIcs(shifts, calendarName = 'Work Shifts') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ShiftScan//Screenshot to Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]

  shifts.forEach((shift, i) => {
    const uid = `shiftscan-${Date.now()}-${i}@shiftscan.app`
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${nowStamp()}`)
    lines.push(`DTSTART:${toIcsLocal(shift.date, shift.startTime)}`)
    lines.push(`DTEND:${toIcsLocal(shift.date, shift.endTime)}`)
    lines.push(`SUMMARY:${escapeText(shift.title || 'Work Shift')}`)
    if (shift.location) {
      lines.push(`LOCATION:${escapeText(shift.location)}`)
    }
    lines.push('END:VEVENT')
  })

  lines.push('END:VCALENDAR')

  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export function downloadIcs(shifts, filename = 'work-shifts.ics', calendarName) {
  const content = shiftsToIcs(shifts, calendarName)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
