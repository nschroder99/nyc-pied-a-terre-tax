// Building-class and tax-class knowledge shared by the build script and the page.
// Source for co-op codes: DOF building classification list
// https://www.nyc.gov/assets/finance/jump/hlpbldgcode.html (fetched 2026-09-19).

/** Building classes DOF describes as cooperatives. The whole building is one tax lot. */
export const COOP_CLASSES = new Set([
  'C6', // WALK-UP COOPERATIVE
  'C8', // WALK-UP CO-OP; CONVERSION FROM LOFT/WAREHOUSE
  'CC', // WALKUP CO-OP APT LESS THAN 11 UNITS RESIDENTIAL
  'D0', // ELEVATOR CO-OP; CONVERSION FROM LOFT/WAREHOUSE
  'D4', // ELEVATOR COOPERATIVE
  'DC', // ELEVATOR CO-OP APT LESS THAN 11 UNITS RESIDENTIAL
  'H7', // APARTMENT HOTEL - COOPERATIVELY OWNED
]);

/** Condo unit classes that are residential apartments. */
export const CONDO_RESIDENTIAL_CLASSES = new Set(['R1', 'R2', 'R3', 'R4', 'R6', 'R9', 'RR']);

/** The condo billing lot (75xx). Not a unit anyone lives in. */
export const CONDO_BILLING_CLASS = 'R0';

export function isCoop(bc) { return COOP_CLASSES.has(bc); }
export function isCondoUnit(bc) { return typeof bc === 'string' && bc[0] === 'R' && bc !== CONDO_BILLING_CLASS; }
export function isCondoResidential(bc) { return CONDO_RESIDENTIAL_CLASSES.has(bc); }

/** Plain-English tax class labels. */
export const TAX_CLASS_LABELS = {
  '1': 'Class 1: 1–3 family homes',
  '2': 'Class 2: residential with 4+ units, including co-ops and condos',
  '2A': 'Class 2A: residential, 4–6 units',
  '2B': 'Class 2B: residential, 7–10 units',
  '2C': 'Class 2C: co-op or condo with 2–10 units',
  '3': 'Class 3: utility property',
  '4': 'Class 4: commercial or industrial',
};

export const PERIOD_LABELS = {
  0: 'Roll not yet published',
  1: 'Tentative roll',
  2: 'After change-by-notice period',
  3: 'Final roll',
  4: 'Final roll, with a later remission',
};
