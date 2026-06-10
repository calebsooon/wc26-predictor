'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Round {
  id: string
  name: string
  order: number
}

interface ScoredPrediction {
  user_id: string
  username: string
  points_awarded: number
  round_id: string
}

interface UserRow {
  user_id: string
  username: string
  total: number
  byRound: Record<string, number>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLeaderboard(predictions: ScoredPrediction[]): UserRow[] {
  const map = new Map<string, UserRow>()

  for (const p of predictions) {
    if (!map.has(p.user_id)) {
      map.set(p.user_id, { user_id: p.user_id, username: p.username, total: 0, byRound: {} })
    }
    const row = map.get(p.user_id)!
    row.total += p.points_awarded
    row.byRound[p.round_id] = (row.byRound[p.round_id] ?? 0) + p.points_awarded
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

function rankBadge(rank: number) {
  if (rank === 1) return <span className="text-lg" aria-label="1st">🥇</span>
  if (rank === 2) return <span className="text-lg" aria-label="2nd">🥈</span>
  if (rank === 3) return <span className="text-lg" aria-label="3rd">🥉</span>
  return <span className="text-sm text-gray-400 font-medium w-7 text-center inline-block">{rank}</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const supabase = createClient()

  const [rounds, setRounds] = useState<Round[]>([])
  const [predictions, setPredictions] = useState<ScoredPrediction[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [selectedRound, setSelectedRound] = useState<string | null>(null) // null = overall
  const [loading, setLoading] = useState(true)

  // ── Initial data load ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)

      const { data: roundData } = await supabase
        .from('rounds')
        .select('id, name, "order"')
        .order('"order"')
      if (roundData) setRounds(roundData as Round[])

      await fetchPredictions()
      setLoading(false)
    }
    load()
  }, [])

  async function fetchPredictions() {
    // Join predictions → profiles (username) and matches → round_id
    const { data } = await supabase
      .from('predictions')
      .select('user_id, points_awarded, profiles(username), matches(round_id)')
      .not('points_awarded', 'is', null)

    if (data) {
      setPredictions(
        (data as unknown as { user_id: string; points_awarded: number; profiles: { username: string } | null; matches: { round_id: string } | null }[]).map(p => ({
          user_id: p.user_id,
          username: p.profiles?.username ?? '?',
          points_awarded: p.points_awarded,
          round_id: p.matches?.round_id ?? '',
        }))
      )
    }
  }

  // ── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-predictions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'predictions' },
        () => { fetchPredictions() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Derived leaderboard ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const source = selectedRound
      ? predictions.filter(p => p.round_id === selectedRound)
      : predictions
    return buildLeaderboard(source)
  }, [predictions, selectedRound])

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading leaderboard…</p>
      </div>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Leaderboard</h1>

      {/* Round filter tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button
          onClick={() => setSelectedRound(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            selectedRound === null
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Overall
        </button>
        {rounds.map(r => (
          <button
            key={r.id}
            onClick={() => setSelectedRound(r.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selectedRound === r.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">
          No scored predictions yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-200">
                <th className="pb-2 pr-3 font-medium w-10">Rank</th>
                <th className="pb-2 pr-3 font-medium">Player</th>
                {selectedRound === null && rounds.map(r => (
                  <th key={r.id} className="pb-2 pr-3 font-medium text-right hidden sm:table-cell">
                    {r.name.replace('Group Stage', 'GS')
                      .replace('Round of 32', 'R32')
                      .replace('Round of 16', 'R16')
                      .replace('Quarter-Finals', 'QF')
                      .replace('Semi-Finals', 'SF')
                      .replace('Bronze Final', 'BF')
                      .replace('Final', 'F')}
                  </th>
                ))}
                <th className="pb-2 font-medium text-right">
                  {selectedRound
                    ? rounds.find(r => r.id === selectedRound)?.name
                    : 'Total'}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const isMe = row.user_id === currentUserId
                return (
                  <tr
                    key={row.user_id}
                    className={`border-b border-gray-100 transition-colors ${
                      isMe ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Rank */}
                    <td className="py-3 pr-3">
                      {rankBadge(i + 1)}
                    </td>

                    {/* Username */}
                    <td className="py-3 pr-3 font-medium text-gray-800">
                      {row.username}
                      {isMe && (
                        <span className="ml-1.5 text-xs text-blue-500 font-normal">(you)</span>
                      )}
                    </td>

                    {/* Per-round breakdown (overall view, desktop only) */}
                    {selectedRound === null && rounds.map(r => (
                      <td key={r.id} className="py-3 pr-3 text-right text-gray-400 hidden sm:table-cell">
                        {row.byRound[r.id] !== undefined ? row.byRound[r.id] : '—'}
                      </td>
                    ))}

                    {/* Points */}
                    <td className="py-3 text-right font-bold text-gray-900">
                      {selectedRound
                        ? (row.byRound[selectedRound] ?? 0)
                        : row.total}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-300 mt-6 text-center">
        Updates live · round breakdown visible on wider screens
      </p>
    </main>
  )
}
