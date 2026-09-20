// Turn the DOF assessment roll (tab-delimited PROPMAST_*.TXT) into the two-tier
// static index the page reads:
//   data/addresses.json          one entry per (address, block); loads on page open
//   data/blocks/1-01114.json     every lot on that block; fetched on demand
//
// Alternate addresses (vanity addresses like 15 Hudson Yards for 553 West 30th Street,
// and building names) come from City Planning's Property Address Directory, expected at
// raw/pad/bobaadr.txt. They become extra tier-1 entries that point at the same building.
//
// Usage: node scripts/build-index.mjs [raw/PROPMAST_TC234_T2027_FIN.TXT]
// Field names come from DOF's layout-pts-property-master.xlsx (139 columns,
// header row present in the file). The parser reads the header, so column
// order changes are harmless; a renamed field fails loudly below.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { normalizeStreet, normalizeHouseNumber, houseNumberValue } from '../lib/normalize.js';
import { isCoop, isCondoUnit, isCondoResidential, CONDO_BILLING_CLASS, PERIOD_LABELS } from '../lib/classes.js';

const BORO = '1'; // Manhattan
const RAW_DIR = 'raw';
const OUT_DIR = 'data';
const PAD_FILE = path.join(RAW_DIR, 'pad', 'bobaadr.txt');
// PAD addrtype: blank = real address, V = vanity address, N/X = name of a building (NAP),
// G = name of a complex. Q (pseudo-address ranges for vacant frontage) and the rest are skipped.
const PAD_TYPES = new Set(['', 'V', 'N', 'X', 'G']);

const file = process.argv[2] || findRoll();
console.log(`reading ${file}`);

const REQUIRED = [
  'BORO', 'BLOCK', 'LOT', 'EASE', 'TAXYR', 'PERIOD', 'EXTRACTDT',
  'FINMKTLAND', 'FINMKTTOT', 'FINACTLAND', 'FINACTTOT', 'FINACTEXTOT',
  'FINTRNLAND', 'FINTRNTOT', 'FINTRNEXTOT', 'FINTXBTOT', 'FINTXBEXTOT', 'FINTAXCLASS', 'FINTAXFLAG',
  'CURMKTLAND', 'CURMKTTOT', 'CURACTLAND', 'CURACTTOT', 'CURACTEXTOT',
  'CURTRNLAND', 'CURTRNTOT', 'CURTRNEXTOT', 'CURTXBTOT', 'CURTXBEXTOT', 'CURTAXCLASS', 'CURTAXFLAG',
  'BLDG_CLASS', 'OWNER', 'ZONING', 'HOUSENUM_LO', 'HOUSENUM_HI', 'STREET_NAME', 'ZIP_CODE',
  'LOT_FRT', 'LOT_DEP', 'LOT_IRREG', 'BLD_FRT', 'BLD_DEP', 'BLD_STORY', 'LAND_AREA', 'NUM_BLDGS',
  'YRBUILT', 'YRBUILT_RANGE', 'YRALT1', 'YRALT2', 'COOP_APTS', 'UNITS', 'APTNO', 'COOP_NUM',
  'CONDO_NUMBER', 'CONDO_SFX1', 'UAF_LAND', 'UAF_BLDG', 'GROSS_SQFT', 'RESIDENTIAL_AREA_GROSS',
  'NEWDROP', 'NOAV', 'VALREF', 'GEOSUPPORT_RC',
];

const num = s => { s = s.trim(); if (!s) return null; const v = Number(s.replace(/^\+/, '')); return Number.isFinite(v) ? v : null; };
const str = s => s.trim();
const clean = o => { for (const k in o) if (o[k] === null || o[k] === '' || o[k] === undefined) delete o[k]; return o; };

const blocks = new Map();   // "01114" -> [lot records]
const byBbl = new Map();    // "1011141308" -> lot record
const groups = new Map();   // "sk|lo|hi|block" -> aggregate for tier 1
const meta = { rollYear: null, period: null, extractDate: null };
let idx = null, total = 0, kept = 0, skippedNoAddr = 0;

const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'latin1' }), crlfDelay: Infinity });
for await (const line of rl) {
  if (!idx) {
    const hdr = line.split('\t').map(h => h.trim());
    idx = Object.fromEntries(hdr.map((h, i) => [h, i]));
    const missing = REQUIRED.filter(f => !(f in idx));
    if (missing.length) throw new Error(`roll header is missing fields: ${missing.join(', ')} — check layout-pts-property-master.xlsx`);
    continue;
  }
  total++;
  const r = line.split('\t');
  const g = f => r[idx[f]] ?? '';
  if (str(g('BORO')) !== BORO) continue;
  kept++;

  const block = str(g('BLOCK')).padStart(5, '0');
  const lot = str(g('LOT')).padStart(4, '0');
  const bbl = `${BORO}${block}${lot}`;
  const lo = normalizeHouseNumber(g('HOUSENUM_LO'));
  const hi = normalizeHouseNumber(g('HOUSENUM_HI'));
  const stRaw = str(g('STREET_NAME'));
  const sk = normalizeStreet(stRaw);
  const bc = str(g('BLDG_CLASS'));
  const yr = num(g('TAXYR')), per = num(g('PERIOD'));

  meta.rollYear ??= yr; meta.period ??= per; meta.extractDate ??= str(g('EXTRACTDT'));
  if (yr !== meta.rollYear || per !== meta.period) console.warn(`mixed roll year/period on ${bbl}: ${yr}/${per}`);

  const fin = {
    mkt: [num(g('FINMKTLAND')), num(g('FINMKTTOT'))],
    av: [num(g('FINACTLAND')), num(g('FINACTTOT')), num(g('FINACTEXTOT'))],
    tr: [num(g('FINTRNLAND')), num(g('FINTRNTOT')), num(g('FINTRNEXTOT'))],
    txb: [num(g('FINTXBTOT')), num(g('FINTXBEXTOT'))],
    tc: str(g('FINTAXCLASS')), tf: str(g('FINTAXFLAG')),
  };
  const cur = {
    mkt: [num(g('CURMKTLAND')), num(g('CURMKTTOT'))],
    av: [num(g('CURACTLAND')), num(g('CURACTTOT')), num(g('CURACTEXTOT'))],
    tr: [num(g('CURTRNLAND')), num(g('CURTRNTOT')), num(g('CURTRNEXTOT'))],
    txb: [num(g('CURTXBTOT')), num(g('CURTXBEXTOT'))],
    tc: str(g('CURTAXCLASS')), tf: str(g('CURTAXFLAG')),
  };

  const rec = clean({
    bbl, lot: Number(lot), ease: str(g('EASE')),
    lo, hi, st: stRaw, sk, zip: str(g('ZIP_CODE')).slice(0, 5),
    bc, ...fin, yr, per,
    cur: JSON.stringify(fin) === JSON.stringify(cur) ? null : clean(cur),
    owner: str(g('OWNER')), zoning: str(g('ZONING')),
    stories: num(g('BLD_STORY')), bldF: num(g('BLD_FRT')), bldD: num(g('BLD_DEP')),
    lotF: num(g('LOT_FRT')), lotD: num(g('LOT_DEP')), lotIrreg: str(g('LOT_IRREG')), landArea: num(g('LAND_AREA')),
    bldgs: num(g('NUM_BLDGS')), yb: num(g('YRBUILT')) || null, ybRange: num(g('YRBUILT_RANGE')) || null,
    alt1: num(g('YRALT1')) || null, alt2: num(g('YRALT2')) || null,
    units: num(g('UNITS')), resUnits: num(g('COOP_APTS')),
    gsf: num(g('GROSS_SQFT')), resSf: num(g('RESIDENTIAL_AREA_GROSS')),
    apt: str(g('APTNO')), condo: str(g('CONDO_NUMBER')), condoSfx: str(g('CONDO_SFX1')),
    coop: num(g('COOP_NUM')) || null, uafB: num(g('UAF_BLDG')) || null, uafL: num(g('UAF_LAND')) || null,
    newdrop: str(g('NEWDROP')) === '1' ? 1 : null, noav: str(g('NOAV')) === 'Y' ? 1 : null,
    valref: str(g('VALREF')) === 'Y' ? 1 : null, geo: str(g('GEOSUPPORT_RC')),
  });

  if (!blocks.has(block)) blocks.set(block, []);
  blocks.get(block).push(rec);
  byBbl.set(bbl, rec);

  if (!lo || !sk) { skippedNoAddr++; continue; }
  // Group on street + low house number + block. The high number is dropped from
  // the key because DOF leaves it blank on some lots of the same building.
  const gk = `${sk}|${lo}|${block}`;
  let a = groups.get(gk);
  if (!a) groups.set(gk, a = { sk, lo, his: new Map(), block, zips: new Map(), lots: [], condos: new Set() });
  a.lots.push(rec);
  if (hi) a.his.set(hi, (a.his.get(hi) || 0) + 1);
  if (rec.zip) a.zips.set(rec.zip, (a.zips.get(rec.zip) || 0) + 1);
  if (rec.condo) a.condos.add(rec.condo);
}

// ---- tier 1 -------------------------------------------------------------
// A "building" is a condo (all lots sharing CONDO_NUMBER, possibly across several
// roll addresses) or a single address group. Aliases attach at that level.
const buildingKey = rec => rec.condo ? `c|${rec.condo}` : (rec.lo && rec.sk) ? `a|${rec.sk}|${rec.lo}|${rec.bbl.slice(1, 6)}` : null;
const buildings = new Map();   // buildingKey -> { groups: [..], addrs: Set("sk|lo") }
for (const a of groups.values()) {
  for (const l of a.lots) {
    const bk = buildingKey(l); if (!bk) continue;
    let b = buildings.get(bk); if (!b) buildings.set(bk, b = { groups: new Set(), addrs: new Set() });
    b.groups.add(a); b.addrs.add(`${a.sk}|${a.lo}`);
  }
}

const entries = [];
const summaries = new Map();   // group -> summary array (without alias fields)
for (const a of groups.values()) {
  const coopLot = a.lots.find(l => isCoop(l.bc));
  let type, cls, units;
  if (coopLot) {
    type = 'coop'; cls = coopLot.bc; units = coopLot.resUnits || coopLot.units || 0;
  } else if (a.condos.size || a.lots.some(l => l.bc?.[0] === 'R')) {
    type = 'condo';
    const res = a.lots.filter(l => isCondoResidential(l.bc));
    cls = mode(res.map(l => l.bc)) || mode(a.lots.filter(l => isCondoUnit(l.bc)).map(l => l.bc)) || a.lots[0].bc;
    units = res.length;
  } else {
    type = 'other';
    const big = a.lots.reduce((m, l) => ((l.mkt?.[1] || 0) > (m.mkt?.[1] || 0) ? l : m), a.lots[0]);
    cls = big.bc; units = a.lots.reduce((s, l) => s + (l.units || 0), 0);
  }
  const zip = [...a.zips.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || '';
  const hi = [...a.his.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || '';
  // [streetKey, lo, hi, block, zip, type, class, lotCount, unitCount, condoNumbers, rollAddress]
  const e = [a.sk, a.lo, hi, Number(a.block), zip, type, cls, a.lots.length, units, a.condos.size ? [...a.condos] : 0, 0];
  entries.push(e); summaries.set(a, e);
}

// ---- aliases from PAD ---------------------------------------------------
const aka = new Map();        // block -> { buildingKey -> [[lo, hi, sk], ...] } for the shard header
let aliasCount = 0;
if (fs.existsSync(PAD_FILE)) {
  const seen = new Set();     // `${buildingKey}|${sk}|${lo}` already emitted
  const padRl = readline.createInterface({ input: fs.createReadStream(PAD_FILE, { encoding: 'latin1' }), crlfDelay: Infinity });
  let padHdr = null;
  for await (const line of padRl) {
    const f = line.replace(/^"|"$/g, '').split('","');
    if (!padHdr) { padHdr = Object.fromEntries(f.map((h, i) => [h, i])); continue; }
    if (f[padHdr.boro] !== BORO) continue;
    if (!PAD_TYPES.has(f[padHdr.addrtype].trim())) continue;
    const rec = byBbl.get(`${BORO}${f[padHdr.block]}${f[padHdr.lot]}`);
    if (!rec) continue;
    const bk = buildingKey(rec); if (!bk) continue;
    const b = buildings.get(bk); if (!b) continue;
    const sk = normalizeStreet(f[padHdr.stname]);
    const lo = normalizeHouseNumber(f[padHdr.lhnd]);
    const hi = normalizeHouseNumber(f[padHdr.hhnd]);
    if (!sk) continue;
    // Skip what the roll already lists for this building, and NAP names that collide with a real street.
    if (b.addrs.has(`${sk}|${lo}`)) continue;
    const dedupe = `${bk}|${sk}|${lo}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const primary = [...b.groups].reduce((m, g) => (g.lots.length > m.lots.length ? g : m));
    const ps = summaries.get(primary);
    const zip = f[padHdr.zipcode].trim() || ps[4];
    const lots = [...b.groups].reduce((n, g) => n + g.lots.length, 0);
    const units = [...b.groups].reduce((n, g) => n + (summaries.get(g)[8] || 0), 0);
    entries.push([sk, lo, hi, Number(primary.block), zip, ps[5], ps[6], lots, units, ps[9], [primary.lo, ps[2], primary.sk]]);
    aliasCount++;
    const blk = primary.block;
    if (!aka.has(blk)) aka.set(blk, {});
    (aka.get(blk)[bk] ||= []).push([lo, hi, sk]);
  }
} else {
  console.warn(`${PAD_FILE} not found — building aliases (vanity addresses, building names) skipped. See README.`);
}

entries.sort((x, y) => x[0].localeCompare(y[0]) || (houseNumberValue(x[1]) ?? 0) - (houseNumberValue(y[1]) ?? 0) || x[1].localeCompare(y[1]));

// ---- write --------------------------------------------------------------
const blocksDir = path.join(OUT_DIR, 'blocks');
fs.rmSync(blocksDir, { recursive: true, force: true });
fs.mkdirSync(blocksDir, { recursive: true });
const blockMeta = { yr: meta.rollYear, per: meta.period, extract: meta.extractDate };
let biggest = [];
for (const [block, lots] of blocks) {
  lots.sort((x, y) => x.lot - y.lot);
  const out = JSON.stringify({ boro: Number(BORO), block, ...blockMeta, aka: aka.get(block) || {}, lots });
  fs.writeFileSync(path.join(blocksDir, `${BORO}-${block}.json`), out);
  biggest.push([block, out.length, lots.length]);
}
biggest.sort((x, y) => y[1] - x[1]);

let classes = {};
try { classes = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'building-classes.json'), 'utf8')); }
catch { console.warn('data/building-classes.json missing — run `npm run classes` first'); }

const fullMeta = {
  borough: Number(BORO), boroughName: 'Manhattan',
  rollYear: meta.rollYear, period: meta.period, periodLabel: PERIOD_LABELS[meta.period] || `period ${meta.period}`,
  extractDate: meta.extractDate, sourceFile: path.basename(file), built: new Date().toISOString().slice(0, 10),
  counts: { rowsInFile: total, lots: kept, addresses: entries.length - aliasCount, aliases: aliasCount, blocks: blocks.size, lotsWithoutAddress: skippedNoAddr },
  schema: { entry: ['streetKey', 'houseLo', 'houseHi', 'block', 'zip', 'type', 'bldgClass', 'lots', 'units', 'condoNumbers', 'rollAddress [lo, hi, streetKey] when this entry is an alias, else 0'] },
};
fs.writeFileSync(path.join(OUT_DIR, 'addresses.json'), JSON.stringify({ meta: fullMeta, classes, e: entries }));
fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(fullMeta, null, 2) + '\n');

console.log(JSON.stringify(fullMeta.counts));
console.log(`addresses.json ${(fs.statSync(path.join(OUT_DIR, 'addresses.json')).size / 1e6).toFixed(2)} MB`);
console.log('largest blocks (bytes, lots):', biggest.slice(0, 6).map(b => `${b[0]}:${(b[1] / 1e6).toFixed(2)}MB/${b[2]}`).join(' '));

function findRoll() {
  const f = fs.readdirSync(RAW_DIR).find(n => /^PROPMAST.*\.TXT$/i.test(n));
  if (!f) throw new Error(`no PROPMAST_*.TXT in ${RAW_DIR}/ — unzip the DOF roll there first (see README)`);
  return path.join(RAW_DIR, f);
}
function mode(arr) {
  const c = new Map(); let best = null, bn = 0;
  for (const v of arr) { const n = (c.get(v) || 0) + 1; c.set(v, n); if (n > bn) { bn = n; best = v; } }
  return best;
}
