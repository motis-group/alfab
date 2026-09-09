// Checks for the as-at date reader. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AGEING_MONTHS, STALE_MONTHS, describeAge, gradeAsAt, needsReview, parseAsAt } from './rate-age';

const NOW = new Date(2026, 8, 9); // 9 September 2026

test('a month and year is read as that month', () => {
  const age = parseAsAt('Oct 2021', NOW);

  assert.equal(age.oldest?.getFullYear(), 2021);
  assert.equal(age.oldest?.getMonth(), 9);
  assert.equal(age.months, 59);
  assert.equal(age.freshness, 'stale');
});

test('a bare year is read as January, so an undated month cannot look newer than it is', () => {
  const age = parseAsAt('2021', NOW);

  assert.equal(age.oldest?.getMonth(), 0);
  assert.equal(age.months, 68);
});

test('a text naming two dates is graded on the older one', () => {
  const age = parseAsAt('Apr 2010 (etch), Mar 2015 (powder coat)', NOW);

  assert.equal(age.oldest?.getFullYear(), 2010);
  assert.equal(age.oldest?.getMonth(), 3);
  assert.equal(age.freshness, 'stale');
});

test('long and short month names both read', () => {
  assert.equal(parseAsAt('July 2007', NOW).oldest?.getMonth(), 6);
  assert.equal(parseAsAt('Sept 2021', NOW).oldest?.getMonth(), 8);
  assert.equal(parseAsAt('Feb 2020', NOW).oldest?.getMonth(), 1);
});

test('a text naming no date is unknown, not fresh', () => {
  for (const text of ['unknown', '', null, undefined]) {
    assert.equal(parseAsAt(text, NOW).freshness, 'unknown', `${text}`);
    assert.equal(parseAsAt(text, NOW).months, null);
  }
});

test('the grades fall on the documented thresholds', () => {
  const ageing = new Date(NOW.getFullYear(), NOW.getMonth() - AGEING_MONTHS, 1);
  const stale = new Date(NOW.getFullYear(), NOW.getMonth() - STALE_MONTHS, 1);
  const fresh = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1);
  const asText = (date: Date) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()]} ${date.getFullYear()}`;

  assert.equal(parseAsAt(asText(fresh), NOW).freshness, 'current');
  assert.equal(parseAsAt(asText(ageing), NOW).freshness, 'ageing');
  assert.equal(parseAsAt(asText(stale), NOW).freshness, 'stale');
});

test('a date in the future does not read as negative months', () => {
  assert.equal(parseAsAt('Jan 2030', NOW).months, 0);
  assert.equal(parseAsAt('Jan 2030', NOW).freshness, 'current');
});

test('the age reads as plain English', () => {
  assert.equal(describeAge(parseAsAt('unknown', NOW)), 'never dated');
  assert.equal(describeAge(parseAsAt('Aug 2026', NOW)), 'this month');
  assert.equal(describeAge(parseAsAt('Mar 2026', NOW)), '6 months old');
  assert.equal(describeAge(parseAsAt('Sep 2024', NOW)), '2 years old');
  assert.equal(describeAge(parseAsAt('Mar 2024', NOW)), '2y 6m old');
});

test('grading sorts stale first, then undated, then ageing', () => {
  const graded = gradeAsAt({ fresh: 'Aug 2026', undated: 'unknown', ancient: 'July 2007', ageing: 'Jun 2025' }, (key) => key, NOW);

  assert.deepEqual(
    graded.map((group) => group.key),
    ['ancient', 'undated', 'ageing', 'fresh']
  );
  assert.deepEqual(
    needsReview(graded).map((group) => group.key),
    ['ancient', 'undated']
  );
});

test('every date the legacy window sheet carried wants review', () => {
  // The dates the legacy sheet carried. Every one of them is over two years old or undated.
  const graded = gradeAsAt(
    {
      labourPerHour: 'Oct 2021',
      anodising: 'Apr 2010 (etch), Mar 2015 (powder coat)',
      each: 'July 2007',
      glass: 'unknown',
    },
    (key) => key,
    NOW
  );

  assert.equal(needsReview(graded).length, 4);
  assert.equal(graded[0].key, 'each');
  assert.equal(describeAge(graded[0]), '19y 2m old');
});
