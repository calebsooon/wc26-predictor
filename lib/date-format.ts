const DEFAULT_TZ = 'Asia/Singapore'
const DEFAULT_LOCALE = 'en-SG'

export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ
  } catch {
    return DEFAULT_TZ
  }
}

function fmtDate(iso: string | Date, options: Intl.DateTimeFormatOptions, timeZone = getUserTimeZone(), locale = DEFAULT_LOCALE): string {
  const value = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(value)
}

export function fmtDateTime(iso: string, timeZone = getUserTimeZone()): string {
  return fmtDate(iso, {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }, timeZone)
}

export function fmtTime(iso: string, timeZone = getUserTimeZone()): string {
  return fmtDate(iso, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }, timeZone)
}

export function fmtDateLong(iso: string, timeZone = getUserTimeZone()): string {
  return fmtDate(iso, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }, timeZone)
}

export function fmtDateKey(dateKey: string, timeZone = getUserTimeZone()): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12))
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
  const label = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    weekday: 'short', day: 'numeric', month: 'short', timeZone,
  }).format(date)
  return dateKey === todayKey ? `Today · ${label}` : label
}

export function fmtDateOnlyKey(iso: string, timeZone = getUserTimeZone()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso))
}

export function getTimeZoneShortLabel(timeZone = getUserTimeZone()): string {
  try {
    const parts = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      timeZone,
      timeZoneName: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'Local'
  } catch {
    return 'SGT'
  }
}

