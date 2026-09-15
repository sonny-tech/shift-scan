import { getStore } from '@netlify/blobs'

// Simple per-IP rate limit so one burst of traffic can't burn through the
// whole day's free-tier quota. Uses Netlify Blobs (free, built into every
// Netlify site — no separate account or setup needed) to persist counts
// across function invocations.
const RATE_LIMIT = 10 // max requests
const RATE_WINDOW_MS = 60 * 60 * 1000 // per hour, per IP

async function checkRateLimit(ip) {
  const store = getStore('rate-limits')
  const key = `ip:${ip}`
  const now = Date.now()

  const existing = await store.get(key, { type: 'json' })

  if (!existing || now - existing.windowStart > RATE_WINDOW_MS) {
    await store.setJSON(key, { count: 1, windowStart: now })
    return { allowed: true }
  }

  if (existing.count >= RATE_LIMIT) {
    const retryAfterMs = RATE_WINDOW_MS - (now - existing.windowStart)
    return { allowed: false, retryAfterMinutes: Math.ceil(retryAfterMs / 60000) }
  }

  await store.setJSON(key, { count: existing.count + 1, windowStart: existing.windowStart })
  return { allowed: true }
}

// Netlify Function: POST /.netlify/functions/parse-calendar
// Body: { image: "<base64>", mediaType: "image/png" }
// Response: { shifts: [{ title, date, startTime, endTime, location }] }
//
// Uses Google's Gemini API (free tier, no billing account required) for
// the image-understanding call, so running this site costs nothing.
// The API key still lives ONLY in this server-side function's
// environment variables (set in the Netlify dashboard, never shipped to
// the browser) — that's why the screenshot has to go through a backend
// function rather than straight from the browser.

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const clientIp =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['client-ip'] ||
    'unknown'

  const rateCheck = await checkRateLimit(clientIp)
  if (!rateCheck.allowed) {
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: `Too many requests. Try again in about ${rateCheck.retryAfterMinutes} minute(s).`,
      }),
    }
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server is missing GEMINI_API_KEY' }),
    }
  }

  let payload
  try {
    payload = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { image, mediaType } = payload
  if (!image || !mediaType) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Both "image" (base64) and "mediaType" are required' }),
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  const systemPrompt = `You extract work shifts from a screenshot of a calendar and return ONLY valid JSON, no prose, no markdown fences.

Return an object of the shape:
{"shifts": [{"title": string, "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM", "location": string|null}]}

Rules:
- 24-hour time for startTime/endTime.
- If a year isn't visible, infer it using today's date (${today}) and the nearest sensible occurrence of the visible month/day.
- If a shift has no explicit end time, make a reasonable estimate only if the calendar implies one (e.g. an 8-hour default); otherwise set endTime to null.
- If you cannot confidently read a field, use null rather than guessing wildly.
- Do not invent shifts that aren't visible in the image.
- Return {"shifts": []} if no shifts are visible.`

  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: mediaType, data: image } },
              {
                text: 'Extract every work shift visible in this calendar screenshot as JSON, following the schema in the system prompt.',
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Upstream API error', detail: errText }),
      }
    }

    const data = await response.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"shifts": []}'
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Could not parse model output as JSON', raw: cleaned }),
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unexpected server error', detail: String(err) }),
    }
  }
}
