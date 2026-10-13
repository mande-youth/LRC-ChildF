'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, membersFromCsv } = require('./server');

test('parses quoted commas and escaped quotes', () => {
  assert.deepEqual(parseCsv('Name,Role\n"Doe, Jane","Lead ""A"""\n'), [
    ['Name', 'Role'],
    ['Doe, Jane', 'Lead "A"']
  ]);
});

test('accepts the required member format and normalizes phone punctuation', () => {
  const members = membersFromCsv('Name,Phone,Team,Role description\nJane,+961 70 123 456,Registration,Team lead\n');
  assert.equal(members.length, 1);
  assert.equal(members[0].phone, '96170123456');
  assert.equal(members[0].team, 'Registration');
});

test('reports missing required headers', () => {
  assert.throws(() => membersFromCsv('Name,Phone\nJane,96170123456\n'), /Missing required columns: Team, Role description/);
});
