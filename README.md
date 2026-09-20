# Pied-à-terre tax lookup (Manhattan)

Static site: type an address or building name, pick the building, pick the unit (condos), and
see the annual pied-à-terre surcharge for that unit next to the DOF market value it is based on.

No backend, no framework, no build step for the page. All data is a pre-built index committed
under `data/` and served by GitHub Pages.

## Layout

```
index.html                  the whole app (imports lib/ as ES modules)
lib/normalize.js            address normalization; shared by page and build script
lib/tax.js                  pied-à-terre surcharge schedule and math, with statute citations
lib/classes.js              co-op / condo building-class knowledge, tax-class labels
lib/*.test.js               unit tests (node --test)
scripts/build-index.mjs     roll + PAD -> data/addresses.json + data/blocks/*.json
scripts/build-classes.mjs   DOF building-class list -> data/building-classes.json
data/addresses.json         tier 1: one entry per address (roll addresses plus aliases); ~4.8 MB, ~700 KB gzipped
data/blocks/1-01114.json    tier 2: every lot on that block; fetched when a building is picked
data/building-classes.json  DOF building-class code -> description
data/meta.json              what roll the index was built from
raw/                        downloaded source files; gitignored, never committed
```

## The tax

`lib/tax.js` encodes NY Tax Law Article 30-C (§§1351–1354), enacted in the FY2027 state budget,
in force July 1, 2026 through June 30, 2031. Verified against the statute text on nysenate.gov
on 2026-09-19:

- **Base**: for a condo unit, the DOF market value of the unit's tax lot (`FINMKTTOT`). For a
  co-op apartment, the building's DOF market value × unit shares ÷ total shares; the page has
  inputs for the two share numbers and remembers them in the link.
- **Phase one** (through June 30, 2028): 4% at $1M–$3M, 5.25% at $3M–$5M, 6.5% above $5M. The
  rate applies to the whole value, not the excess over the threshold.
- **Phase two** (from July 1, 2028): $5M threshold and the class-one rates (0.8% / 1.05% / 1.3%)
  on a new DOF sales-based value. The module switches schedules by date automatically.

Primary residences are exempt; the page does not try to determine that.

## Yearly refresh

DOF publishes the tentative roll in January and the final roll in May/June. City Planning
updates PAD (the Property Address Directory, source of vanity addresses and building names)
a few times a year.

1. Roll: from https://www.nyc.gov/site/finance/property/property-assessments.page download the
   current **Tax Classes 2, 3, 4** zip into `raw/` and unzip it there. You get one
   `PROPMAST_TC234_T<year>_<FIN|TEN>.TXT` (about 850 MB, tab-delimited, header row, 139 columns
   matching DOF's `layout-pts-property-master.xlsx`). The CDN refuses curl's default user agent:

   ```bash
   curl -L -A "Mozilla/5.0" -o raw/fy28_tc234.zip https://www.nyc.gov/assets/finance/downloads/tar/fy28_tc234.zip
   ```

2. PAD: download the current version (the letter changes: 26c, 27a, …) and unzip into `raw/pad/`:

   ```bash
   curl -L -A "Mozilla/5.0" -o raw/pad.zip https://s-media.nyc.gov/agencies/dcp/assets/files/zip/data-tools/bytes/pad/pad_26c.zip
   unzip -o raw/pad.zip -d raw/pad
   ```

   The build only needs `raw/pad/bobaadr.txt`. Without it the index still builds, just without
   alternate addresses.

3. Rebuild and test:

   ```bash
   npm run classes   # optional: refresh building-class descriptions from DOF
   npm run build     # ~10 s
   npm test
   ```

   The build reads the roll's header row, so column reordering is harmless; a missing column
   fails with its name. Compare against the layout xlsx and adjust `scripts/build-index.mjs`.

4. Check locally (`npm run serve`, open http://localhost:8080), commit `data/`, push to `main`.

Only tax classes 2/3/4 and Manhattan are indexed. Class 1 (townhouses) would need `fy<yy>_tc1.zip`
and the class-one schedule already in `lib/tax.js`.

## How search works

Both the roll's address fields and the typed query go through the same functions in
`lib/normalize.js`: uppercase, punctuation stripped, ordinals removed (`72ND` → `72`),
directionals and street types expanded, Broadway and Avenue of the Americas variants collapsed,
apartment fragments and trailing "New York, NY 10021" dropped. Matching is token-wise: numbers
must match exactly, words may be prefixes, so `w 72`, `72 st`, and `cent park` all work.

Alternate addresses come from PAD at build time: every real, vanity, or named-building address
PAD lists for a lot in the roll becomes an extra index entry pointing at that building
(`15 Hudson Yards` → the condo the roll files under `553 West 30th Street`). The building page
lists the other names. There is no live geocoding.

## Co-ops and condos

- **Condos**: each unit is its own tax lot. The unit list shows each unit's surcharge (or a dash
  when it is under the threshold) with its market value underneath.
- **Co-ops** (building classes C6, C8, CC, D0, D4, DC, H7 per DOF's list): one tax lot for the
  building. The page shows the building value and computes the unit's share once you enter
  the apartment's shares and the corporation's total shares.

## Deployment

GitHub Pages from `main`, root directory. `.nojekyll` keeps everything under `data/` served.

## Sources

- Roll: https://www.nyc.gov/site/finance/property/property-assessments.page
- Record layout: https://www.nyc.gov/assets/finance/downloads/tar/layout-pts-property-master.xlsx
- Building classes: https://www.nyc.gov/assets/finance/jump/hlpbldgcode.html
- PAD: https://www.nyc.gov/content/planning/pages/resources/datasets/pad (zip URL pattern above)
- Statute: https://www.nysenate.gov/legislation/laws/TAX/1351 … /1354
- Per-BBL link: https://propertyinformationportal.nyc.gov/parcels/parcel/<BBL>
