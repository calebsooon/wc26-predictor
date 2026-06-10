// Complete mapping for all 48 WC 2026 teams
// code      = 3-letter code used in matches table
// name      = short display name
// fullName  = official full name
// flag      = emoji flag
// playerKey = team_name used in the players table (from football-data.org)

export interface TeamInfo {
  code: string
  name: string
  fullName: string
  flag: string
  playerKey: string  // matches team_name in players table
}

export const TEAMS: Record<string, TeamInfo> = {
  ARG: { code: 'ARG', name: 'Argentina',       fullName: 'Argentina',                    flag: '🇦🇷', playerKey: 'Argentina' },
  ALG: { code: 'ALG', name: 'Algeria',          fullName: 'Algeria',                      flag: '🇩🇿', playerKey: 'Algeria' },
  AUS: { code: 'AUS', name: 'Australia',        fullName: 'Australia',                    flag: '🇦🇺', playerKey: 'Australia' },
  AUT: { code: 'AUT', name: 'Austria',          fullName: 'Austria',                      flag: '🇦🇹', playerKey: 'Austria' },
  BEL: { code: 'BEL', name: 'Belgium',          fullName: 'Belgium',                      flag: '🇧🇪', playerKey: 'Belgium' },
  BIH: { code: 'BIH', name: 'Bosnia & Herz.',   fullName: 'Bosnia and Herzegovina',       flag: '🇧🇦', playerKey: 'Bosnia-Herzegovina' },
  BRA: { code: 'BRA', name: 'Brazil',           fullName: 'Brazil',                       flag: '🇧🇷', playerKey: 'Brazil' },
  CAN: { code: 'CAN', name: 'Canada',           fullName: 'Canada',                       flag: '🇨🇦', playerKey: 'Canada' },
  CIV: { code: 'CIV', name: 'Ivory Coast',      fullName: "Côte d'Ivoire",                flag: '🇨🇮', playerKey: 'Ivory Coast' },
  COD: { code: 'COD', name: 'DR Congo',         fullName: 'DR Congo',                     flag: '🇨🇩', playerKey: 'Congo DR' },
  COL: { code: 'COL', name: 'Colombia',         fullName: 'Colombia',                     flag: '🇨🇴', playerKey: 'Colombia' },
  CPV: { code: 'CPV', name: 'Cape Verde',       fullName: 'Cape Verde',                   flag: '🇨🇻', playerKey: 'Cape Verde Islands' },
  CRO: { code: 'CRO', name: 'Croatia',          fullName: 'Croatia',                      flag: '🇭🇷', playerKey: 'Croatia' },
  CUW: { code: 'CUW', name: 'Curaçao',          fullName: 'Curaçao',                      flag: '🇨🇼', playerKey: 'Curaçao' },
  CZE: { code: 'CZE', name: 'Czechia',          fullName: 'Czech Republic',               flag: '🇨🇿', playerKey: 'Czechia' },
  ECU: { code: 'ECU', name: 'Ecuador',          fullName: 'Ecuador',                      flag: '🇪🇨', playerKey: 'Ecuador' },
  EGY: { code: 'EGY', name: 'Egypt',            fullName: 'Egypt',                        flag: '🇪🇬', playerKey: 'Egypt' },
  ENG: { code: 'ENG', name: 'England',          fullName: 'England',                      flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', playerKey: 'England' },
  ESP: { code: 'ESP', name: 'Spain',            fullName: 'Spain',                        flag: '🇪🇸', playerKey: 'Spain' },
  FRA: { code: 'FRA', name: 'France',           fullName: 'France',                       flag: '🇫🇷', playerKey: 'France' },
  GER: { code: 'GER', name: 'Germany',          fullName: 'Germany',                      flag: '🇩🇪', playerKey: 'Germany' },
  GHA: { code: 'GHA', name: 'Ghana',            fullName: 'Ghana',                        flag: '🇬🇭', playerKey: 'Ghana' },
  HAI: { code: 'HAI', name: 'Haiti',            fullName: 'Haiti',                        flag: '🇭🇹', playerKey: 'Haiti' },
  IRN: { code: 'IRN', name: 'Iran',             fullName: 'Iran',                         flag: '🇮🇷', playerKey: 'Iran' },
  IRQ: { code: 'IRQ', name: 'Iraq',             fullName: 'Iraq',                         flag: '🇮🇶', playerKey: 'Iraq' },
  JOR: { code: 'JOR', name: 'Jordan',           fullName: 'Jordan',                       flag: '🇯🇴', playerKey: 'Jordan' },
  JPN: { code: 'JPN', name: 'Japan',            fullName: 'Japan',                        flag: '🇯🇵', playerKey: 'Japan' },
  KOR: { code: 'KOR', name: 'South Korea',      fullName: 'Republic of Korea',            flag: '🇰🇷', playerKey: 'South Korea' },
  KSA: { code: 'KSA', name: 'Saudi Arabia',     fullName: 'Saudi Arabia',                 flag: '🇸🇦', playerKey: 'Saudi Arabia' },
  MAR: { code: 'MAR', name: 'Morocco',          fullName: 'Morocco',                      flag: '🇲🇦', playerKey: 'Morocco' },
  MEX: { code: 'MEX', name: 'Mexico',           fullName: 'Mexico',                       flag: '🇲🇽', playerKey: 'Mexico' },
  NED: { code: 'NED', name: 'Netherlands',      fullName: 'Netherlands',                  flag: '🇳🇱', playerKey: 'Netherlands' },
  NOR: { code: 'NOR', name: 'Norway',           fullName: 'Norway',                       flag: '🇳🇴', playerKey: 'Norway' },
  NZL: { code: 'NZL', name: 'New Zealand',      fullName: 'New Zealand',                  flag: '🇳🇿', playerKey: 'New Zealand' },
  PAN: { code: 'PAN', name: 'Panama',           fullName: 'Panama',                       flag: '🇵🇦', playerKey: 'Panama' },
  PAR: { code: 'PAR', name: 'Paraguay',         fullName: 'Paraguay',                     flag: '🇵🇾', playerKey: 'Paraguay' },
  POR: { code: 'POR', name: 'Portugal',         fullName: 'Portugal',                     flag: '🇵🇹', playerKey: 'Portugal' },
  QAT: { code: 'QAT', name: 'Qatar',            fullName: 'Qatar',                        flag: '🇶🇦', playerKey: 'Qatar' },
  RSA: { code: 'RSA', name: 'South Africa',     fullName: 'South Africa',                 flag: '🇿🇦', playerKey: 'South Africa' },
  SCO: { code: 'SCO', name: 'Scotland',         fullName: 'Scotland',                     flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', playerKey: 'Scotland' },
  SEN: { code: 'SEN', name: 'Senegal',          fullName: 'Senegal',                      flag: '🇸🇳', playerKey: 'Senegal' },
  SUI: { code: 'SUI', name: 'Switzerland',      fullName: 'Switzerland',                  flag: '🇨🇭', playerKey: 'Switzerland' },
  SWE: { code: 'SWE', name: 'Sweden',           fullName: 'Sweden',                       flag: '🇸🇪', playerKey: 'Sweden' },
  TUN: { code: 'TUN', name: 'Tunisia',          fullName: 'Tunisia',                      flag: '🇹🇳', playerKey: 'Tunisia' },
  TUR: { code: 'TUR', name: 'Turkey',           fullName: 'Türkiye',                      flag: '🇹🇷', playerKey: 'Turkey' },
  URU: { code: 'URU', name: 'Uruguay',          fullName: 'Uruguay',                      flag: '🇺🇾', playerKey: 'Uruguay' },
  USA: { code: 'USA', name: 'USA',              fullName: 'United States',                flag: '🇺🇸', playerKey: 'United States' },
  UZB: { code: 'UZB', name: 'Uzbekistan',       fullName: 'Uzbekistan',                   flag: '🇺🇿', playerKey: 'Uzbekistan' },
}

export function getTeam(code: string): TeamInfo {
  return TEAMS[code] ?? {
    code,
    name: code,
    fullName: code,
    flag: '🏳️',
    playerKey: code,
  }
}

export function teamFlag(code: string): string {
  return getTeam(code).flag
}

export function teamName(code: string): string {
  return getTeam(code).name
}

export function teamFullName(code: string): string {
  return getTeam(code).fullName
}

// football-data.org uses 'Defence'/'Midfield'/'Offence' — normalise to display labels
export function normalisePosition(raw: string | null): string {
  if (!raw) return 'Unknown'
  switch (raw) {
    case 'Goalkeeper': return 'Goalkeeper'
    case 'Defence':    return 'Defender'
    case 'Midfield':   return 'Midfielder'
    case 'Offence':    return 'Forward'
    case 'Coach':      return 'Coach'
    default:           return raw
  }
}

export const POSITION_ORDER: Record<string, number> = {
  Goalkeeper: 0,
  Defender:   1,
  Midfielder: 2,
  Forward:    3,
  Coach:      99,
  Unknown:    98,
}

export const POSITION_BADGE: Record<string, string> = {
  Goalkeeper: 'bg-yellow-100 text-yellow-800',
  Defender:   'bg-blue-100   text-blue-800',
  Midfielder: 'bg-green-100  text-green-800',
  Forward:    'bg-red-100    text-red-800',
}

export const POSITION_ABBR: Record<string, string> = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD', Coach: 'COACH',
}
