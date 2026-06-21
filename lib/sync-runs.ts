import type { SupabaseClient } from '@supabase/supabase-js'

export type SyncKind = 'lineups' | 'results' | 'injuries' | 'events'
export type SyncTrigger = 'admin' | 'cron'
export type SyncStatus = 'success' | 'partial' | 'failed'

export async function startSyncRun(service: SupabaseClient, kind: SyncKind, trigger: SyncTrigger) {
  const { data, error } = await service
    .from('sync_runs')
    .insert({ kind, trigger_source: trigger, status: 'running' })
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
) {
  const { error } = await service
    .from('sync_runs')
    .update({ status, details, finished_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Unable to finish sync log: ${error.message}`)
}
