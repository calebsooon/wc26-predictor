// Complete mapping for all 48 WC 2026 teams
// code      = 3-letter code used in matches table
// name      = short display name
// fullName  = official full name
// flag      = emoji flag (kept for accessibility/aria-label only)
// playerKey = team_name used in the players table (from football-data.org)

export interface TeamInfo {
  code: string
  name: string
  fullName: string
  flag: string
  playerKey: string  // matches team_name in players table
}

// CSS gradient flags — simple stripe/band approximations keyed by team code.
// Render as a <div> with background: FLAG_GRADIENTS[code] rather than emoji.
export const FLAG_GRADIENTS: Record<string, string> = {
  ARG: 'linear-gradient(180deg,#6CACE4 34%,#fff 34% 66%,#6CACE4 66%)',
  ALG: 'linear-gradient(90deg,#fff 50%,#006233 50%)',
  AUS: 'linear-gradient(135deg,#00008B 55%,#CC0001 55%)',
  AUT: 'linear-gradient(180deg,#ED2939 34%,#fff 34% 66%,#ED2939 66%)',
  BEL: 'linear-gradient(90deg,#000 34%,#FAE042 34% 66%,#EF3340 66%)',
  BIH: 'linear-gradient(145deg,#002395 55%,#FECB00 55%)',
  BRA: 'linear-gradient(160deg,#009C3B 34%,#FFDF00 34% 66%,#009C3B 66%)',
  CAN: 'linear-gradient(90deg,#FF0000 24%,#fff 24% 76%,#FF0000 76%)',
  CIV: 'linear-gradient(90deg,#F77F00 34%,#fff 34% 66%,#009A44 66%)',
  COD: 'linear-gradient(135deg,#007FFF 50%,#CE1126 50%)',
  COL: 'linear-gradient(180deg,#FCD116 40%,#003087 40% 72%,#CE1126 72%)',
  CPV: 'linear-gradient(90deg,#003893 60%,#CF2027 60%)',
  CRO: 'linear-gradient(180deg,#FF0000 34%,#fff 34% 66%,#003087 66%)',
  CUW: 'linear-gradient(150deg,#002B7F 58%,#F9E300 58%)',
  CZE: 'linear-gradient(135deg,#11457E 40%,#fff 40% 70%,#D7141A 70%)',
  ECU: 'linear-gradient(180deg,#FFD100 40%,#003087 40% 72%,#CE1126 72%)',
  EGY: 'linear-gradient(180deg,#CE1126 34%,#fff 34% 66%,#000 66%)',
  ENG: 'linear-gradient(90deg,#fff 36%,#CF142B 36% 64%,#fff 64%)',
  ESP: 'linear-gradient(180deg,#c60b1e 28%,#ffc400 28% 72%,#c60b1e 72%)',
  FRA: 'linear-gradient(90deg,#0055A4 34%,#fff 34% 66%,#EF4135 66%)',
  GER: 'linear-gradient(180deg,#000 34%,#DD0000 34% 66%,#FFCE00 66%)',
  GHA: 'linear-gradient(180deg,#CE1126 34%,#FCD116 34% 66%,#006B3F 66%)',
  HAI: 'linear-gradient(180deg,#00209F 50%,#D21034 50%)',
  IRN: 'linear-gradient(180deg,#239F40 34%,#fff 34% 66%,#DA0000 66%)',
  IRQ: 'linear-gradient(180deg,#CE1126 34%,#fff 34% 66%,#000 66%)',
  JOR: 'linear-gradient(90deg,#000 34%,#fff 34% 66%,#007A3D 66%)',
  JPN: 'linear-gradient(90deg,#fff 28%,#BC002D 28% 72%,#fff 72%)',
  KOR: 'linear-gradient(180deg,#fff 50%,#C60C30 50%)',
  KSA: 'linear-gradient(90deg,#165E26,#165E26)',
  MAR: 'linear-gradient(90deg,#C1272D,#C1272D)',
  MEX: 'linear-gradient(90deg,#006847 34%,#fff 34% 66%,#CE1126 66%)',
  NED: 'linear-gradient(180deg,#AE1C28 34%,#fff 34% 66%,#21468B 66%)',
  NOR: 'linear-gradient(90deg,#EF2B2D 30%,#fff 30% 37%,#002868 37% 50%,#EF2B2D 50%)',
  NZL: 'linear-gradient(135deg,#00247D 58%,#CC142B 58%)',
  PAN: 'linear-gradient(180deg,#fff 50%,#D21034 50%)',
  PAR: 'linear-gradient(180deg,#D52B1E 34%,#fff 34% 66%,#0038A8 66%)',
  POR: 'linear-gradient(90deg,#006600 40%,#FF0000 40%)',
  QAT: 'linear-gradient(90deg,#8D1B3D 60%,#fff 60%)',
  RSA: 'linear-gradient(90deg,#007A4D 34%,#FFB81C 34% 66%,#DE3831 66%)',
  SCO: 'linear-gradient(135deg,#003078 50%,#fff 50%)',
  SEN: 'linear-gradient(90deg,#00853F 34%,#FDEF42 34% 66%,#E31B23 66%)',
  SUI: 'linear-gradient(90deg,#FF0000,#FF0000)',
  SWE: 'linear-gradient(90deg,#006AA7 32%,#FECC02 32% 44%,#006AA7 44%)',
  TUN: 'linear-gradient(90deg,#E70013,#E70013)',
  TUR: 'linear-gradient(90deg,#E30A17,#E30A17)',
  URU: 'linear-gradient(180deg,#fff 20%,#5EB6E4 20% 37%,#fff 37% 53%,#5EB6E4 53% 70%,#fff 70%)',
  USA: 'linear-gradient(90deg,#002868 34%,#BF0A30 34%)',
  UZB: 'linear-gradient(180deg,#1EB53A 34%,#fff 34% 66%,#0099B5 66%)',
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
