/**
 * Static team registry for the 2026 F1 season.
 *
 * Provides slug, color, logo URL, and DB name matching patterns for each
 * constructor. The slug is the stable key used in URLs, DB storage, and
 * logo paths. DB name matching is case-insensitive substring matching.
 */

export type TeamSlug =
  | 'alpine'
  | 'aston-martin'
  | 'audi'
  | 'cadillac'
  | 'ferrari'
  | 'haas'
  | 'mclaren'
  | 'mercedes'
  | 'racing-bulls'
  | 'red-bull'
  | 'williams'

export type TeamInfo = {
  slug: TeamSlug
  name: string
  color: string
  logoUrl: string
  /** Substrings that appear in the DB Constructor name or shortName (case-insensitive) */
  dbMatch: string[]
}

export const TEAMS: Record<TeamSlug, TeamInfo> = {
  alpine: {
    slug: 'alpine',
    name: 'Alpine',
    color: '#FF87BC',
    logoUrl: '/teamlogos/alpine.webp',
    dbMatch: ['alpine'],
  },
  'aston-martin': {
    slug: 'aston-martin',
    name: 'Aston Martin',
    color: '#229971',
    logoUrl: '/teamlogos/aston-martin.webp',
    dbMatch: ['aston'],
  },
  audi: {
    slug: 'audi',
    name: 'Audi',
    color: '#C0C0C0',
    logoUrl: '/teamlogos/audi.webp',
    dbMatch: ['audi', 'sauber', 'kick'],
  },
  cadillac: {
    slug: 'cadillac',
    name: 'Cadillac',
    color: '#2B2B2B',
    logoUrl: '/teamlogos/cadillac.webp',
    dbMatch: ['cadillac'],
  },
  ferrari: {
    slug: 'ferrari',
    name: 'Ferrari',
    color: '#E8002D',
    logoUrl: '/teamlogos/ferrari.webp',
    dbMatch: ['ferrari'],
  },
  haas: {
    slug: 'haas',
    name: 'Haas',
    color: '#B6BABD',
    logoUrl: '/teamlogos/haas.webp',
    dbMatch: ['haas'],
  },
  mclaren: {
    slug: 'mclaren',
    name: 'McLaren',
    color: '#FF8000',
    logoUrl: '/teamlogos/mclaren.webp',
    dbMatch: ['mclaren'],
  },
  mercedes: {
    slug: 'mercedes',
    name: 'Mercedes',
    color: '#6CD3BF',
    logoUrl: '/teamlogos/mercedes.webp',
    dbMatch: ['mercedes'],
  },
  'racing-bulls': {
    slug: 'racing-bulls',
    name: 'Racing Bulls',
    color: '#6692FF',
    logoUrl: '/teamlogos/racing-bulls.webp',
    dbMatch: ['racing bull', 'cashapp', 'visa cash'],
  },
  'red-bull': {
    slug: 'red-bull',
    name: 'Red Bull',
    color: '#3671C6',
    logoUrl: '/teamlogos/red-bull.webp',
    dbMatch: ['red bull'],
  },
  williams: {
    slug: 'williams',
    name: 'Williams',
    color: '#64C4FF',
    logoUrl: '/teamlogos/williams.webp',
    dbMatch: ['williams'],
  },
}

export const TEAM_LIST = Object.values(TEAMS)

/**
 * Resolve a Constructor DB name/shortName to a TeamInfo, or null if unknown.
 */
export function resolveTeam(constructorName: string): TeamInfo | null {
  const lower = constructorName.toLowerCase()
  return TEAM_LIST.find((t) => t.dbMatch.some((m) => lower.includes(m))) ?? null
}

/** Map driver number → photo path (2026 grid, numbers from DB) */
export const DRIVER_PHOTOS: Record<number, string> = {
  1:  '/drivers/norris.png',
  3:  '/drivers/verstappen.png',
  5:  '/drivers/bortoleto.png',
  6:  '/drivers/hadjar.png',
  43: '/drivers/colapinto.png',
  10: '/drivers/gasly.png',
  12: '/drivers/antonelli.png',
  14: '/drivers/alonso.png',
  16: '/drivers/leclerc.png',
  18: '/drivers/stroll.png',
  // 22: tsunoda — no photo available, falls back to team color
  23: '/drivers/albon.png',
  27: '/drivers/hulkenberg.png',
  30: '/drivers/lawson.png',
  31: '/drivers/ocon.png',
  44: '/drivers/hamilton.png',
  55: '/drivers/sainz.png',
  63: '/drivers/russell.png',
  81: '/drivers/piastri.png',
  87: '/drivers/bearman.png',
}
