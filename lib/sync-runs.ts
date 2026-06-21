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
