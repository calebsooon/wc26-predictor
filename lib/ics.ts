// iCalendar (RFC 5545) builder — pure, dependency-free, runs on server and client.
// One stable UID per match means re-fetching a subscribed feed UPDATES events in
// place (knockout teams filling in, kickoff changes) instead of duplicating them.

import { getTeam } from '@/lib/teams'

export interface IcsMatch {
  id: string
  match_date: string            // ISO timestamptz — emitted in UTC
  home_team: string
  away_team: string
  group_name: string | null
  gw_number: number | null
  round_name?: string | null    // stage label (e.g. "Quarter-Finals")
  updated_at?: string | null    // drives SEQUENCE so clients re-sync on change
}

const MATCH_MINUTES = 120       // assumed fixture length for DTEND

// Escape a value for an iCal TEXT field (RFC 5545 §3.3.11).
function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Fold lines longer than 75 octets with CRLF + single space (RFC 5545 §3.1).
function fold(line: string): string {
  if (line.length <= 73) return line
  const out: string[] = []
  let rest = line
  out.push(rest.slice(0, 73))
  rest = rest.slice(73)
  while (rest.length > 72) { out.push(' ' + rest.slice(0, 72)); rest = rest.slice(72) }
  if (rest.length) out.push(' ' + rest)
  return out.join('\r\n')
}

// ISO instant → UTC iCal stamp: 20260711T190000Z
function toUtcStamp(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  )
}

const PRODID = '-//MatchDay//World Cup 2026//EN'

function teamLabel(code: string): string {
  // getTeam falls back to the raw code, so undrawn knockout placeholders
  // (e.g. "W73") still render gracefully until the real team is known.
  return getTeam(code).name
}

function stageLabel(m: IcsMatch): string {
  if (m.group_name) return `Group ${m.group_name}`
  return m.round_name || 'Knockout'
}

function vevent(m: IcsMatch, reminderMinutes: number | null, stamp: string): string {
  const start = toUtcStamp(m.match_date)
  const end = toUtcStamp(new Date(new Date(m.match_date).getTime() + MATCH_MINUTES * 60_000).toISOString())
  const summary = `${teamLabel(m.home_team)} vs ${teamLabel(m.away_team)}`
  const desc = `FIFA World Cup 2026 · ${stageLabel(m)}`
  // SEQUENCE increments when the match row changes so clients re-sync the event.
  const seq = m.updated_at ? Math.floor(new Date(m.updated_at).getTime() / 1000) % 2_000_000_000 : 0

  const lines = [
    'BEGIN:VEVENT',
    `UID:match-${m.id}@matchday`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SEQUENCE:${seq}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(desc)}`,
    `CATEGORIES:${esc(stageLabel(m))}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
  ]
  if (reminderMinutes != null && reminderMinutes > 0) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(summary)}`,
      `TRIGGER:-PT${reminderMinutes}M`,
      'END:VALARM',
    )
  }
  lines.push('END:VEVENT')
  return lines.map(fold).join('\r\n')
}

export interface BuildOptions {
  name?: string
  reminderMinutes?: number | null
  /** Subscription refresh hint for clients, in hours. */
  refreshHours?: number
}

export function buildCalendar(matches: IcsMatch[], opts: BuildOptions = {}): string {
  const { name = 'MatchDay — World Cup 2026', reminderMinutes = 60, refreshHours = 6 } = opts
  const stamp = toUtcStamp(new Date().toISOString())
  const head = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(name)}`),
    `X-PUBLISHED-TTL:PT${refreshHours}H`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshHours}H`,
  ]
  const body = matches.map((m) => vevent(m, reminderMinutes ?? null, stamp))
  return [...head, ...body, 'END:VCALENDAR'].join('\r\n') + '\r\n'
}

/** Filename-safe slug for downloaded files. */
export function icsFilename(label: string): string {
  return 'matchday-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.ics'
}
