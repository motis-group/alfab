// Checks finding a customer by what is typed. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SearchableCustomer, customerMatchDetail, searchCustomers } from './customer-search';

function customer(over: Partial<SearchableCustomer> & { name: string }): SearchableCustomer {
  return { id: over.name, contact_name: null, contact_email: null, phone: null, is_active: true, ...over };
}

const LIST: SearchableCustomer[] = [customer({ name: 'Bay Glass', contact_name: 'Jo Bell', phone: '03 9459 1333' }), customer({ name: 'Glass Works Pty Ltd' }), customer({ name: 'Harbour Marine', contact_email: 'orders@harbour.com.au' }), customer({ name: 'Northside Glazing', contact_name: 'Glenda Ross' }), customer({ name: 'Status Houseboats', is_active: false })];

const names = (result: { matches: { customer: SearchableCustomer }[] }) => result.matches.map((m) => m.customer.name);

test('nothing typed gives the head of the list, and the count of the whole', () => {
  const result = searchCustomers(LIST, '', { limit: 2 });
  assert.deepEqual(names(result), ['Bay Glass', 'Glass Works Pty Ltd']);
  assert.equal(result.total, 5);
});

test('a name that begins with what was typed comes before one that merely holds it', () => {
  // Typing one letter matches hundreds of 663 names, so the order is the whole value of this.
  const result = searchCustomers(LIST, 'glass');
  assert.deepEqual(names(result), ['Glass Works Pty Ltd', 'Bay Glass']);
});

test('a word inside the name counts as a beginning', () => {
  // "Bay Glass" begins its second word with the query; "Northside Glazing" only holds "gla".
  const result = searchCustomers(LIST, 'gla');
  assert.deepEqual(names(result), ['Glass Works Pty Ltd', 'Bay Glass', 'Northside Glazing']);
});

test('the company is searched before the person at it', () => {
  const result = searchCustomers(LIST, 'gle');
  // Northside Glazing matches on its contact Glenda Ross, and nothing matches on a name.
  assert.deepEqual(names(result), ['Northside Glazing']);
  assert.equal(result.matches[0].on, 'contact');
});

test('an address finds the company that writes from it', () => {
  const result = searchCustomers(LIST, 'orders@harbour');
  assert.deepEqual(names(result), ['Harbour Marine']);
  assert.equal(result.matches[0].on, 'email');
});

test('a number is found however it is written', () => {
  // The number is held as "03 9459 1333". None of these spacings should matter.
  assert.deepEqual(names(searchCustomers(LIST, '0394591333')), ['Bay Glass']);
  assert.deepEqual(names(searchCustomers(LIST, '9459 1333')), ['Bay Glass']);
  assert.deepEqual(names(searchCustomers(LIST, '03-9459-1333')), ['Bay Glass']);
});

test('too few digits do not search the numbers', () => {
  // "03" opens most landlines in this state. Matching on it would return the whole list.
  const result = searchCustomers(LIST, '03');
  assert.equal(result.total, 0);
});

test('case and spare spaces do not matter', () => {
  assert.deepEqual(names(searchCustomers(LIST, '  HARBOUR   marine ')), ['Harbour Marine']);
});

test('the inactive are left out when asked', () => {
  assert.deepEqual(names(searchCustomers(LIST, 'status')), ['Status Houseboats']);
  assert.deepEqual(names(searchCustomers(LIST, 'status', { activeOnly: true })), []);
});

test('the total counts every match, not the ones returned', () => {
  const many = Array.from({ length: 30 }, (unused, index) => customer({ name: `Glass ${index}` }));
  const result = searchCustomers(many, 'glass', { limit: 8 });
  assert.equal(result.matches.length, 8);
  assert.equal(result.total, 30);
});

test('what is typed but matches nothing gives nothing', () => {
  const result = searchCustomers(LIST, 'zzzz');
  assert.deepEqual(result.matches, []);
  assert.equal(result.total, 0);
});

test('the second line says why the row is in the list', () => {
  assert.equal(customerMatchDetail(searchCustomers(LIST, 'gle').matches[0]), 'Glenda Ross');
  assert.equal(customerMatchDetail(searchCustomers(LIST, 'orders@harbour').matches[0]), 'orders@harbour.com.au');
  // Matched on the name, so the line falls back to who and how to ring them.
  assert.equal(customerMatchDetail(searchCustomers(LIST, 'bay').matches[0]), 'Jo Bell · 03 9459 1333');
  assert.equal(customerMatchDetail(searchCustomers(LIST, 'glass works').matches[0]), '');
});
