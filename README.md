# ShiftScan

Upload a screenshot of a work calendar → get an editable list of shifts → download a
`.ics` file you can import into Google Calendar, Apple Calendar, Outlook, etc.

## How it works

1. **Frontend** (`src/`): a small React/Vite app. You upload an image, it gets sent to
   a serverless function, and the response is rendered as an editable table. Nothing
   is written to any calendar automatically — you review every row, then click
   "Download" to generate the `.ics` file client-side.
2. **Backend** (`netlify/functions/parse-calendar.js`): a Netlify serverless function
   that sends the image to Google's Gemini API (free tier) and asks it to return
   structured JSON (title/date/start/end/location per shift). This has to run
   server-side because your API key can't be shipped to the browser.
3. **ICS generation** (`src/generateIcs.js`): builds a standards-compliant iCalendar
   file (RFC 5545) entirely in the browser from whatever's in the editable table —
   no server round-trip needed for this part.

## Local setup

```bash
npm install
```

You'll need a **free** Gemini API key:

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with a Google account — no credit card needed
3. Click "Create API key" and copy it

This runs on Gemini's free tier, which is rate-limited (a generous number of requests
per day/minute) rather than billed. If you ever hit the limit, requests just fail with
a "try again" error — you will not be charged.

For local dev with Netlify's CLI:

```bash
npm install -g netlify-cli
netlify env:set GEMINI_API_KEY AIza...
netlify dev
```

`netlify dev` runs both the Vite frontend and the serverless function together, so the
`/.netlify/functions/parse-calendar` fetch call in `App.jsx` works locally.

If you just run `npm run dev` (plain Vite, no Netlify CLI), the frontend will load but
the extract step will fail since there's no function server behind it — use
`netlify dev` instead once you're testing the full flow.

## Deploying (free tier works fine)

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import an existing project**, point it at the repo.
   Netlify will read `netlify.toml` and auto-detect the build command/functions folder.
3. In **Site settings → Environment variables**, add `GEMINI_API_KEY` with your key.
4. Deploy. Netlify's free tier includes 125k function invocations/month, and Gemini's
   free tier is rate-limited rather than billed — so run end-to-end, this costs $0 at
   personal-use traffic.

## Extending it

- **Staying free at higher traffic**: the whole stack is free-tier by design, but
  Gemini's free tier has a requests-per-minute/day cap shared across everyone using
  your key. If this gets popular, you'll see rate-limit errors before you'd ever see a
  bill — worth adding basic throttling (e.g. Netlify Edge Functions + IP-based limits,
  or a Turnstile/CAPTCHA before the extract button) so a burst of traffic fails
  gracefully with a "try again in a minute" message instead of erroring silently.
- **Multi-image / multi-week schedules**: the function currently takes one image. You
  could loop multiple uploads client-side and merge the `shifts` arrays before
  generating one combined `.ics`.
- **Recurring shifts**: right now every shift is a one-off `VEVENT`. If a calendar
  shows a repeating pattern, you could detect it and emit an `RRULE` instead of one
  event per occurrence.
- **Timezones**: shifts are written as "floating" local time (no timezone attached),
  which is usually what you want for "my shift is at 9am wherever I open this." If you
  need shifts to carry an explicit timezone (e.g. for someone importing across time
  zones), swap `toIcsLocal` in `generateIcs.js` for a `TZID`-based `DTSTART`.
