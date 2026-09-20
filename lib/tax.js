// NYC pied-à-terre surcharge, NY Tax Law Article 30-C (§§1351–1354), enacted in the
// FY2027 state budget (signed May 28, 2026), effective July 1, 2026, expires June 30, 2031.
//
// Verified 2026-09-19 against the statute text on nysenate.gov:
//  - §1351: for a condo unit the "phase one market value" is the market value as
//    determined by the Department of Finance (the Market Value line on the roll / NOPV),
//    not the assessed value. For a co-op unit it is the building's DOF market value
//    × (unit shares ÷ total shares in the corporation).
//  - §1353: "where the phase one market value is (A) greater than or equal to one million
//    dollars, but less than or equal to three million dollars, at a rate of 4.0 percent;
//    (B) greater than three million dollars, but less than or equal to five million dollars,
//    at a rate of 5.25 percent; (C) greater than five million dollars, at a rate of 6.5 percent."
//    The rate applies to the whole value, not the excess over the threshold.
//  - Phase two (from July 1, 2028) moves condos and co-ops to the class-one schedule on a
//    new DOF sales-based value, with a $5M threshold.
//  - §1352: not owed on a primary residence (owner, immediate family, or a lessee on a
//    lease of a year or more, occupying a majority of the year).
//  - §1351 "covered property" is only: (1) class one property other than vacant land;
//    (2) class two residential cooperative property (per dwelling unit); (3) class two
//    property that is a residential condominium dwelling unit. A class 2 rental or
//    multi-family building (a four-family walk-up in class 2A, an elevator rental) is
//    not covered at all, and neither is a commercial condo unit or class 3/4 property.

import { COOP_CLASSES, CONDO_RESIDENTIAL_CLASSES } from './classes.js';

export const PIED_A_TERRE = {
  citation: 'NY Tax Law §§1351–1354 (Article 30-C)',
  phases: [
    {
      name: 'Phase one', from: '2026-07-01', to: '2028-06-30',
      condoCoop: { threshold: 1e6, brackets: [[1e6, 3e6, 0.04], [3e6, 5e6, 0.0525], [5e6, Infinity, 0.065]] },
      classOne:  { threshold: 5e6, brackets: [[5e6, 15e6, 0.008], [15e6, 25e6, 0.0105], [25e6, Infinity, 0.013]] },
    },
    {
      name: 'Phase two', from: '2028-07-01', to: '2031-06-30',
      condoCoop: { threshold: 5e6, brackets: [[5e6, 15e6, 0.008], [15e6, 25e6, 0.0105], [25e6, Infinity, 0.013]] },
      classOne:  { threshold: 5e6, brackets: [[5e6, 15e6, 0.008], [15e6, 25e6, 0.0105], [25e6, Infinity, 0.013]] },
    },
  ],
};

/**
 * Which schedule, if any, a roll record falls under. rec needs { tc, bc }.
 * Returns { kind: 'class1' | 'condo' | 'coop' | 'none', reason }.
 */
export function coverage(rec) {
  const tc = String(rec?.tc || ''), bc = String(rec?.bc || '');
  if (COOP_CLASSES.has(bc)) return { kind: 'coop', reason: 'Co-op apartment' };
  if (tc.startsWith('1')) {
    if (bc.startsWith('V')) return { kind: 'none', reason: 'Vacant land is excluded' };
    return { kind: 'class1', reason: bc.startsWith('R') ? 'Class 1 condo unit' : '1–3 family home' };
  }
  if (tc.startsWith('2')) {
    if (bc === 'R0') return { kind: 'none', reason: 'Condo billing lot, not a unit' };
    if (CONDO_RESIDENTIAL_CLASSES.has(bc)) return { kind: 'condo', reason: 'Residential condo unit' };
    if (bc.startsWith('R')) return { kind: 'none', reason: 'Commercial condo unit — only residential units are covered' };
    return { kind: 'none', reason: 'Rental or multi-family building — only condo units, co-op apartments and 1–3 family homes are covered' };
  }
  if (tc.startsWith('3')) return { kind: 'none', reason: 'Utility property is not covered' };
  if (tc.startsWith('4')) return { kind: 'none', reason: 'Commercial property is not covered' };
  return { kind: 'none', reason: 'Not covered' };
}

/** Phase in effect on a date (ISO string or Date). Null outside the surcharge's life. */
export function phaseOn(on = new Date()) {
  const d = typeof on === 'string' ? on : on.toISOString().slice(0, 10);
  return PIED_A_TERRE.phases.find(p => d >= p.from && d <= p.to) || null;
}

/**
 * Annual surcharge on a value.
 * kind: 'condo' | 'coop' (same schedule) | 'class1' | 'none'
 * Returns { applies, tax, rate, bracket, threshold, phase, base } — tax is 0 when it does not apply.
 */
export function surcharge(value, { kind = 'condo', on = new Date() } = {}) {
  const phase = phaseOn(on);
  const base = Number(value);
  const out = { applies: false, tax: 0, rate: 0, bracket: null, threshold: null, phase: phase?.name || null, base };
  if (!phase || !Number.isFinite(base) || kind === 'none') return out;
  const sched = kind === 'class1' ? phase.classOne : phase.condoCoop;
  out.threshold = sched.threshold;
  for (let i = 0; i < sched.brackets.length; i++) {
    const [min, max, rate] = sched.brackets[i];
    const aboveMin = i === 0 ? base >= min : base > min;
    if (aboveMin && base <= max) {
      out.applies = true; out.rate = rate; out.bracket = [min, max];
      out.tax = Math.round(base * rate);
      break;
    }
  }
  return out;
}

/** Co-op unit's imputed value under §1351: building market value × shares ÷ total shares. */
export function coopUnitValue(buildingMarketValue, unitShares, totalShares) {
  const b = Number(buildingMarketValue), s = Number(unitShares), t = Number(totalShares);
  if (!(b > 0) || !(s > 0) || !(t > 0) || s > t) return null;
  return Math.round(b * s / t);
}

/** "4% · $1M–$3M" style legend for the phase in effect. */
export function bracketLegend(kind = 'condo', on = new Date()) {
  const phase = phaseOn(on); if (!phase) return [];
  const sched = kind === 'class1' ? phase.classOne : phase.condoCoop;
  return sched.brackets.map(([min, max, rate]) => ({ min, max, rate }));
}
