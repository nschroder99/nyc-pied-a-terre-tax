// Address normalization shared by the build script (Node) and the page (browser).
// Both sides run the same functions, so the roll's spelling and the user's
// spelling only have to land on the same key, not on any "correct" form.
//
// Everything table-driven lives at the top. Expect to add rows.

/** Whole-token replacements applied to every token of the street part. */
export const TOKEN_MAP = {
  // directionals
  W: 'WEST', E: 'EAST', N: 'NORTH', S: 'SOUTH',
  // street types
  STR: 'STREET', STRT: 'STREET',
  AVE: 'AVENUE', AV: 'AVENUE', AVN: 'AVENUE', AVNENUE: 'AVENUE', AVENEU: 'AVENUE',
  BLVD: 'BOULEVARD', BL: 'BOULEVARD', BLV: 'BOULEVARD',
  PL: 'PLACE', PLC: 'PLACE',
  TER: 'TERRACE', TERR: 'TERRACE',
  PKWY: 'PARKWAY', PKY: 'PARKWAY', PKWAY: 'PARKWAY',
  DR: 'DRIVE', DRV: 'DRIVE',
  LN: 'LANE',
  CT: 'COURT',
  SQ: 'SQUARE',
  RD: 'ROAD',
  EXPY: 'EXPRESSWAY', EXPWY: 'EXPRESSWAY',
  HWY: 'HIGHWAY',
  PLZ: 'PLAZA',
  CIR: 'CIRCLE',
  EXT: 'EXTENSION',
  // Broadway
  BWAY: 'BROADWAY', BDWY: 'BROADWAY', BRDWY: 'BROADWAY', BRDWAY: 'BROADWAY', BROADWY: 'BROADWAY',
  // common name abbreviations
  LEX: 'LEXINGTON', MAD: 'MADISON', AMSTERDM: 'AMSTERDAM', COLUMBS: 'COLUMBUS',
  SAINT: 'SAINT', STE: 'SAINT',
};

/** Spelled-out ordinals that DOF sometimes uses for numbered streets. */
export const ORDINAL_WORDS = {
  FIRST: '1', SECOND: '2', THIRD: '3', FOURTH: '4', FIFTH: '5', SIXTH: '6',
  SEVENTH: '7', EIGHTH: '8', NINTH: '9', TENTH: '10', ELEVENTH: '11', TWELFTH: '12',
};

/** Words after which a spelled ordinal is clearly a street number. */
const ORDINAL_FOLLOWERS = new Set(['AVENUE', 'STREET', 'PLACE', 'ROAD', 'BOULEVARD']);

/** Whole-street rewrites, applied after token expansion. Order matters. */
export const PHRASE_MAP = [
  [/^AVENUE OF (THE )?AMERICAS$/, '6 AVENUE'],
  [/^FASHION AVENUE$/, '7 AVENUE'],
  [/^BROAD WAY$/, 'BROADWAY'],
  [/^CPW$/, 'CENTRAL PARK WEST'],
  [/^CPS$/, 'CENTRAL PARK SOUTH'],
  [/^PAS$/, 'PARK AVENUE SOUTH'],
  [/^F D R( DRIVE)?$/, 'FDR DRIVE'],
  [/^FDR$/, 'FDR DRIVE'],
  [/^HARLEM RIVER DRIVE$/, 'HARLEM RIVER DRIVE'],
];

/** Unit / apartment fragments people paste along with the address. */
const UNIT_RE = /\s*(?:,?\s*(?:\b(?:APT|APARTMENT|UNIT|STE|SUITE|FL|FLOOR|PH|PENTHOUSE|RM|ROOM|MAISONETTE)\b)\s*[A-Z0-9-]*).*$/;

/** Trailing city / state / country / zip noise, e.g. from a pasted GeoSearch label. */
const TRAILING_NOISE_RE = /(?:[\s,]+(?:NEW YORK CITY|NEW YORK|NYC|NY|MANHATTAN|USA|UNITED STATES|U S A)\b)+[\s,]*(?:\d{5}(?:-\d{4})?)?\s*$|[\s,]+\d{5}(?:-\d{4})?\s*$/;

/** Uppercase, strip punctuation to spaces, collapse whitespace. Hyphens survive only inside house numbers. */
export function clean(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[’'`"]/g, '')            // B'WAY -> BWAY, ST. MARK'S -> ST. MARKS
    .replace(/[^A-Z0-9/\- ]+/g, ' ')    // everything else to space
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a street name (no house number) to its index key. */
export function normalizeStreet(street) {
  let s = clean(street).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  let toks = s.split(' ');

  // 72ND -> 72, 1ST -> 1
  toks = toks.map(t => t.replace(/^(\d+)(ST|ND|RD|TH)$/, '$1'));

  // ST is SAINT when something follows it, STREET when it ends the name.
  toks = toks.map((t, i) => {
    if (t === 'ST') return i === toks.length - 1 ? 'STREET' : 'SAINT';
    return TOKEN_MAP[t] || t;
  });

  // FIFTH AVENUE -> 5 AVENUE
  toks = toks.map((t, i) => {
    const n = ORDINAL_WORDS[t];
    return n && ORDINAL_FOLLOWERS.has(toks[i + 1]) ? n : t;
  });

  s = toks.join(' ');
  for (const [re, rep] of PHRASE_MAP) s = s.replace(re, rep);
  return s;
}

/** Normalize a DOF house number field: "26", "26-28", "15A", "1 1/2". */
export function normalizeHouseNumber(h) {
  return clean(h).replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ');
}

/** Leading integer of a house number, or null. */
export function houseNumberValue(h) {
  const m = String(h || '').match(/^\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Split a free-text query into a house number and a street key.
 * Strips unit fragments and trailing city/zip noise first.
 * Returns { num, numLo, numHi, street, raw }.
 */
export function parseQuery(q) {
  // "#12B" must survive clean(), which turns # into a space.
  let s = clean(String(q || '').replace(/#\s*/g, ' APT ')).replace(TRAILING_NOISE_RE, '').replace(UNIT_RE, '').trim();
  let num = '';
  // house number: 15 | 15A | 26-28 | 1 1/2
  const m = s.match(/^(\d+[A-Z]?(?:-\d+[A-Z]?)?(?: \d\/\d)?)\b\s*(.*)$/);
  if (m) { num = normalizeHouseNumber(m[1]); s = m[2]; }
  const street = normalizeStreet(s);
  let numLo = null, numHi = null;
  if (num) {
    const parts = num.split('-');
    numLo = houseNumberValue(parts[0]);
    numHi = parts[1] ? houseNumberValue(parts[1]) : numLo;
  }
  return { num, numLo, numHi, street, raw: q };
}

/**
 * Does a typed street match an indexed street key?
 * Every query token must line up with a contiguous run of key tokens:
 * numbers must match exactly, words may be prefixes ("cent park" ~ "CENTRAL PARK WEST").
 */
export function streetMatches(queryStreet, keyStreet) {
  if (!queryStreet) return true;
  const q = queryStreet.split(' ');
  const k = keyStreet.split(' ');
  if (q.length > k.length) return false;
  outer: for (let i = 0; i + q.length <= k.length; i++) {
    for (let j = 0; j < q.length; j++) {
      const qt = q[j], kt = k[i + j];
      if (/^\d/.test(qt) ? qt !== kt : !kt.startsWith(qt)) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Does a typed house number fall on an indexed lo–hi range?
 * Exact string match always wins; otherwise the number must sit inside the
 * range and share its parity when the range itself is single-parity.
 */
export function houseNumberMatches(qNum, qLo, lo, hi) {
  if (!qNum) return true;
  if (qNum === lo || qNum === hi) return true;
  if (qLo == null) return false;
  const a = houseNumberValue(lo), b = houseNumberValue(hi || lo);
  if (a == null) return false;
  const min = Math.min(a, b), max = Math.max(a, b);
  if (qLo < min || qLo > max) return false;
  if (a !== b && (a % 2) === (b % 2) && (qLo % 2) !== (a % 2)) return false;
  return true;
}

const SMALL = new Set(['OF', 'THE', 'AND']);
function titleWord(w) {
  if (/^\d/.test(w)) return w;
  if (w === 'FDR' || w === 'NY') return w;
  if (SMALL.has(w)) return w.toLowerCase();
  return w[0] + w.slice(1).toLowerCase();
}

/** "WEST 72 STREET" -> "West 72nd Street" for display. */
export function displayStreet(key) {
  const toks = key.split(' ');
  return toks.map((t, i) => {
    const next = toks[i + 1];
    if (/^\d+$/.test(t) && ORDINAL_FOLLOWERS.has(next)) return ordinal(parseInt(t, 10));
    return titleWord(t);
  }).join(' ');
}

export function ordinal(n) {
  const r100 = n % 100, r10 = n % 10;
  const sfx = (r100 >= 11 && r100 <= 13) ? 'th' : r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th';
  return n + sfx;
}

/** "26", "28", "BEAVER STREET" -> "26-28 Beaver Street" */
export function displayAddress(lo, hi, streetKey) {
  const num = hi && hi !== lo ? `${lo}-${hi}` : lo;
  return `${num ? num + ' ' : ''}${displayStreet(streetKey)}`;
}
