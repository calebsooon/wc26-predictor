import type { SupabaseClient } from '@supabase/supabase-js'

export type SyncKind = 'lineups' | 'results' | 'injuries' | 'events' | 'fifa_matches' | 'fifa_teams' | 'golden_boot'
export type SyncTrigger = 'admin' | 'cron' | 'cli'
export type SyncStatus = 'success' | 'partial' | 'failed'

export type SyncRunStart = {
  provider?: string
  scope?: string | null
}

export type SyncRunFinish = {
  sourceUpdatedAt?: string | null
  recordsRead?: number
  recordsWritten?: number
  errorSummary?: string | null
}

/** Turn Supabase and fetch errors into a useful, compact sync-run message. */
export function describeSyncError(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [value.message, value.details, value.hint, value.code]
      .filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
      .map(String)
    if (parts.length) return parts.join(' · ')
    try { return JSON.stringify(error) }
    catch { return 'Unknown provider error' }
  }
  return String(error)
}

export async function startSyncRun(service: SupabaseClient, kind: SyncKind, trigger: SyncTrigger, start: SyncRunStart = {}) {
  const { data, error } = await service
    .from('sync_runs')
    .insert({ kind, trigger_source: trigger, status: 'running', provider: start.provider ?? null, scope: start.scope ?? null })
    .select('id')
    .single()
  if (error) throw new Error(`Unable to start ${kind} sync log: ${error.message}`)
  return data.id as string
}

export async function finishSyncRun(
  service: SupabaseClient,
  id: string,
  status: SyncStatus,
  details: Record<string, unknown>,
  finish: SyncRunFinish = {},
) {
  const { error } = await service
    .from('sync_runs')
    .update({
      status,
      details,
      finished_at: new Date().toISOString(),
      source_updated_at: finish.sourceUpdatedAt ?? null,
      records_read: finish.recordsRead ?? 0,
      records_written: finish.recordsWritten ?? 0,
      error_summary: finish.errorSummary ?? null,
    })
    .eq('id', id)
  if (error) throw new Error(`Unable to finish sync log: ${error.message}`)
}
