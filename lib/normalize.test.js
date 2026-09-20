import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStreet, parseQuery, streetMatches, houseNumberMatches, displayStreet, displayAddress, normalizeHouseNumber } from './normalize.js';

test('roll spellings and user spellings land on the same key', () => {
  const same = [
    ['WEST 72ND ST', 'w 72 street', 'West 72nd Street', 'W. 72nd St.'],
    ['EAST 85TH ST.', 'E 85 STREET', 'e 85th st'],
    ['5TH AVNENUE', 'FIFTH AVE', '5 AVENUE', '5th Avenue'],
    ['AVENUE OF THE AMERICAS', 'AVENUE OF AMERICAS', '6TH AVE', 'Sixth Avenue', '6 AVENUE'],
    ['ST MARKS PLACE', 'SAINT MARKS PLACE', "St. Mark's Pl"],
    ['ST. NICHOLAS AVENUE', 'ST NICHOLAS AVE', 'Saint Nicholas Avenue'],
    ['BROADWAY', 'BWAY', "B'way", 'Broad Way', 'BDWY'],
    ['CENTRAL PARK WEST', 'CPW', 'Central Park W'],
    ['PARK AVENUE SOUTH', 'PAS', 'Park Ave S'],
    ['WASHINGTON SQUARE S', 'Washington Square South'],
    ['RIVERSIDE BLVD', 'Riverside Boulevard'],
    ['LEXINGTON AVE', 'Lex Ave', 'Lexington Avenue'],
    ['TARAS SHEVCHENKO PL', 'Taras Shevchenko Place'],
    ['LITTLE WEST 12 ST', 'Little W 12th Street'],
    ['FASHION AVENUE', '7th Ave', '7 AVENUE'],
  ];
  for (const group of same) {
    const keys = group.map(normalizeStreet);
    assert.equal(new Set(keys).size, 1, `expected one key for ${JSON.stringify(group)} got ${JSON.stringify(keys)}`);
  }
});

test('specific canonical keys', () => {
  assert.equal(normalizeStreet('WEST 72ND ST'), 'WEST 72 STREET');
  assert.equal(normalizeStreet('1ST AVENUE'), '1 AVENUE');
  assert.equal(normalizeStreet('Avenue of the Americas'), '6 AVENUE');
  assert.equal(normalizeStreet('St Marks Pl'), 'SAINT MARKS PLACE');
  assert.equal(normalizeStreet('Rector St'), 'RECTOR STREET');
  assert.equal(normalizeStreet('AVENUE A'), 'AVENUE A');
  assert.equal(normalizeStreet('EAST END AVE'), 'EAST END AVENUE');
});

test('parseQuery splits house number, strips units and city noise', () => {
  assert.deepEqual(pick(parseQuery('15 Central Park West Apt 12B')), { num: '15', street: 'CENTRAL PARK WEST' });
  assert.deepEqual(pick(parseQuery('15 central park west #12B')), { num: '15', street: 'CENTRAL PARK WEST' });
  assert.deepEqual(pick(parseQuery('200 E 72nd St, New York, NY 10021')), { num: '200', street: 'EAST 72 STREET' });
  assert.deepEqual(pick(parseQuery('15 CENTRAL PARK WEST, New York, NY, USA')), { num: '15', street: 'CENTRAL PARK WEST' });
  assert.deepEqual(pick(parseQuery('26-28 Beaver St')), { num: '26-28', street: 'BEAVER STREET' });
  assert.deepEqual(pick(parseQuery('1 1/2 King Street')), { num: '1 1/2', street: 'KING STREET' });
  assert.deepEqual(pick(parseQuery('101A West 12th Street PH')), { num: '101A', street: 'WEST 12 STREET' });
  assert.deepEqual(pick(parseQuery('Beaver St')), { num: '', street: 'BEAVER STREET' });
  assert.deepEqual(pick(parseQuery('345 e 80 unit 4c')), { num: '345', street: 'EAST 80' });
  const p = parseQuery('26-28 Beaver St');
  assert.equal(p.numLo, 26); assert.equal(p.numHi, 28);
});

test('streetMatches: exact numbers, prefix words, contiguous tokens', () => {
  assert.ok(streetMatches('72', 'WEST 72 STREET'));
  assert.ok(streetMatches('72 STREET', 'WEST 72 STREET'));
  assert.ok(streetMatches('WEST 72', 'WEST 72 STREET'));
  assert.ok(streetMatches('CENT PARK', 'CENTRAL PARK WEST'));
  assert.ok(streetMatches('LEX AVENUE', 'LEXINGTON AVENUE'));
  assert.ok(!streetMatches('7', 'WEST 72 STREET'));
  assert.ok(!streetMatches('PARK WEST CENTRAL', 'CENTRAL PARK WEST'));
  assert.ok(!streetMatches('EAST 72', 'WEST 72 STREET'));
  assert.ok(streetMatches('', 'ANYTHING'));
});

test('houseNumberMatches: exact, range, parity', () => {
  assert.ok(houseNumberMatches('26', 26, '26', '28'));
  assert.ok(houseNumberMatches('28', 28, '26', '28'));
  assert.ok(!houseNumberMatches('27', 27, '26', '28'));
  assert.ok(houseNumberMatches('27', 27, '25', '28'));
  assert.ok(!houseNumberMatches('30', 30, '26', '28'));
  assert.ok(houseNumberMatches('15', 15, '15', ''));
  assert.ok(houseNumberMatches('15A', 15, '15A', '15A'));
  assert.ok(houseNumberMatches('15', 15, '15A', '15A'));
  assert.ok(!houseNumberMatches('16', 16, '15', '15'));
});

test('display', () => {
  assert.equal(displayStreet('WEST 72 STREET'), 'West 72nd Street');
  assert.equal(displayStreet('1 AVENUE'), '1st Avenue');
  assert.equal(displayStreet('6 AVENUE'), '6th Avenue');
  assert.equal(displayStreet('AVENUE A'), 'Avenue A');
  assert.equal(displayStreet('FDR DRIVE'), 'FDR Drive');
  assert.equal(displayAddress('26', '28', 'BEAVER STREET'), '26-28 Beaver Street');
  assert.equal(displayAddress('15', '15', 'CENTRAL PARK WEST'), '15 Central Park West');
  assert.equal(displayAddress('15', '', 'CENTRAL PARK WEST'), '15 Central Park West');
  assert.equal(normalizeHouseNumber('152- 152A'), '152-152A');
});

function pick(p) { return { num: p.num, street: p.street }; }
