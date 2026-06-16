'use client'

import 'flag-icons/css/flag-icons.min.css'

// FIFA / common 3-letter codes → ISO 3166-1 alpha-2 (flag-icons keys).
// Covers all 48 FIFA World Cup 2026 qualified & likely teams.
const MAP: Record<string, string> = {
  // Hosts + CONCACAF
  USA: 'us', MEX: 'mx', CAN: 'ca', CRC: 'cr', PAN: 'pa', HON: 'hn',
  JAM: 'jm', SLV: 'sv', CUW: 'cw', GLP: 'gp', HAI: 'ht', TRI: 'tt',
  // UEFA
  FRA: 'fr', ESP: 'es', ENG: 'gb-eng', GER: 'de', DEU: 'de', NED: 'nl', NLD: 'nl',
  POR: 'pt', PRT: 'pt', BEL: 'be', CRO: 'hr', HRV: 'hr', ITA: 'it', SUI: 'ch', CHE: 'ch',
  AUT: 'at', POL: 'pl', DEN: 'dk', DNK: 'dk', SCO: 'gb-sct', WAL: 'gb-wls', NIR: 'gb-nir',
  SRB: 'rs', UKR: 'ua', TUR: 'tr', SWE: 'se', NOR: 'no', CZE: 'cz', HUN: 'hu',
  GRE: 'gr', ROU: 'ro', SVK: 'sk', SVN: 'si', ALB: 'al', RUS: 'ru', IRL: 'ie',
  // CONMEBOL
  ARG: 'ar', BRA: 'br', URU: 'uy', COL: 'co', ECU: 'ec', PAR: 'py', PER: 'pe',
  CHI: 'cl', BOL: 'bo', VEN: 've',
  // CAF
  MAR: 'ma', SEN: 'sn', GHA: 'gh', NGA: 'ng', CIV: 'ci', CMR: 'cm', EGY: 'eg',
  TUN: 'tn', ALG: 'dz', DZA: 'dz', RSA: 'za', ZAF: 'za', MLI: 'ml', COD: 'cd',
  CPV: 'cv', ANG: 'ao', GAB: 'ga',
  // AFC
  JPN: 'jp', KOR: 'kr', AUS: 'au', IRN: 'ir', KSA: 'sa', SAU: 'sa', QAT: 'qa',
  IRQ: 'iq', UAE: 'ae', UZB: 'uz', JOR: 'jo', CHN: 'cn', IDN: 'id', VNM: 'vn', THA: 'th',
  // OFC
  NZL: 'nz', NCL: 'nc',
}

function toIso(code: string): string {
  const upper = code.toUpperCase()
  return MAP[upper] ?? code.toLowerCase()
}

interface FlagChipProps {
  code: string
  w?: number
  h?: number
  r?: number
  className?: string
}

export default function FlagChip({ code, w = 40, h = 27, r = 6, className = '' }: FlagChipProps) {
  const iso = toIso(code)
  return (
    <span
      className={`fi fi-${iso} ${className}`}
      style={{
        display: 'inline-block',
        width: w,
        height: h,
        borderRadius: r,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.18)',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
      role="img"
      aria-label={code}
    />
  )
}

export { toIso }
