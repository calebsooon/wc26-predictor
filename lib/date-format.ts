const SGT_TZ = 'Asia/Singapore'

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: SGT_TZ, hour12: false,
  }).format(new Date(iso))
}

export function fmtDateKey(dateKey: string): string {
  const date = new Date(dateKey + 'T00:00:00+08:00')
  const todaySGT = new Intl.DateTimeFormat('en-CA', { timeZone: SGT_TZ }).format(new Date())
  const label = new Intl.DateTimeFormat('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: SGT_TZ,
  }).format(date)
  return dateKey === todaySGT ? `Today · ${label}` : label
}
