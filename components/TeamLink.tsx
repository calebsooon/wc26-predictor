import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { getTeam } from '@/lib/teams'

export function TeamLink({
  code,
  children,
  className = '',
  style,
  stopPropagation = false,
}: {
  code: string
  children: ReactNode
  className?: string
  style?: CSSProperties
  stopPropagation?: boolean
}) {
  const team = getTeam(code)
  return (
    <Link
      href={`/squads?team=${encodeURIComponent(team.code)}`}
      className={className}
      style={style}
      aria-label={`Open ${team.fullName} squad`}
      title={`Open ${team.fullName} squad`}
      onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
    >
      {children}
    </Link>
  )
}
