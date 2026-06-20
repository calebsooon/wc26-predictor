export interface ProviderGoalEvent {
  time: number
  teamId: number
  type: string
  detail: string
  playerName: string | null
}

/** Chooses the first credited scorer, ignoring own goals and incomplete events. */
export function firstCreditedGoal(events: ProviderGoalEvent[]) {
  return [...events]
    .filter((event) => event.type === 'Goal' && event.detail !== 'Own Goal' && event.playerName?.trim())
    .sort((a, b) => a.time - b.time)[0] ?? null
}

export function sameFixtureDay(a: string, b: string) {
  return a.slice(0, 10) === b.slice(0, 10)
}
