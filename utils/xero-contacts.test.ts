// Checks the reading of a Xero contacts export. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ExistingCustomer, XeroCustomerFields, customerNameKey, parseCsv, planCustomerImport, readXeroContacts } from './xero-contacts';

// The columns of the real export, in the order Xero writes them. The file names 73 and a data row
// carries 53, 57 or 61, so the tail is here to be left off by the short rows below.
const HEADER = ['*ContactName', 'AccountNumber', 'EmailAddress', 'FirstName', 'LastName', 'POAttentionTo', 'POAddressLine1', 'POAddressLine2', 'POAddressLine3', 'POAddressLine4', 'POCity', 'PORegion', 'POPostalCode', 'POCountry', 'SAAttentionTo', 'SAAddressLine1', 'SAAddressLine2', 'SAAddressLine3', 'SAAddressLine4', 'SACity', 'SARegion', 'SAPostalCode', 'SACountry', 'PhoneNumber', 'FaxNumber', 'MobileNumber', 'Person1FirstName', 'Person1LastName', 'Person1Email'];

function row(values: Record<string, string>): string {
  const fields = HEADER.map((column) => {
    const value = values[column.replace(/^\*/, '')] || '';
    return value.includes(',') ? `"${value}"` : value;
  });

  // Xero drops the trailing empty columns. Every row here is written short, as the real file is.
  while (fields.length && fields[fields.length - 1] === '') {
    fields.pop();
  }

  return fields.join(',');
}

function file(...rows: Record<string, string>[]): string {
  return [HEADER.join(','), ...rows.map(row)].join('\r\n') + '\r\n';
}

function customer(over: Partial<ExistingCustomer> = {}): ExistingCustomer {
  return { id: 'c1', name: 'Harbour Marine', contact_name: null, contact_email: null, phone: null, delivery_address: null, ...over };
}

function contact(over: Partial<XeroCustomerFields> = {}): XeroCustomerFields {
  return { name: 'Harbour Marine', contact_name: null, contact_email: null, phone: null, delivery_address: null, ...over };
}

test('a quoted field holds its commas, and two quotes mean one', () => {
  assert.deepEqual(parseCsv('a,"b,c",d'), [['a', 'b,c', 'd']]);
  assert.deepEqual(parseCsv('"say ""yes""",b'), [['say "yes"', 'b']]);
});

test('a row ends at CRLF, at LF, and at the end of the file', () => {
  assert.deepEqual(parseCsv('a,b\r\nc,d\r\n'), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
  assert.deepEqual(parseCsv('a,b\nc,d'), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
  // A file that ends with a line break must not gain an empty row from it.
  assert.equal(parseCsv('a,b\r\n').length, 1);
});

test('a line break inside a quoted field stays in the field', () => {
  assert.deepEqual(parseCsv('a,"two\r\nlines",c'), [['a', 'two\r\nlines', 'c']]);
});

test('a byte order mark does not become part of the first column name', () => {
  const reading = readXeroContacts('﻿' + file({ ContactName: 'Harbour Marine' }));
  assert.equal(reading.contacts.length, 1);
  assert.equal(reading.contacts[0].name, 'Harbour Marine');
});

test('a short row reads, because every real row is short', () => {
  // The header names 29 columns here; this row carries 1. The rest must read as empty, not throw.
  const text = HEADER.join(',') + '\r\n' + 'Harbour Marine\r\n';
  const reading = readXeroContacts(text);
  assert.equal(reading.contacts.length, 1);
  assert.deepEqual(reading.contacts[0], contact());
});

test('a row with no contact name is skipped and reported by line', () => {
  const reading = readXeroContacts(file({ ContactName: 'Harbour Marine' }, { EmailAddress: 'nobody@example.com' }));
  assert.equal(reading.contacts.length, 1);
  assert.deepEqual(reading.skipped, [{ line: 3, reason: 'The row has no contact name.' }]);
});

test('the person comes from the first of the three places Xero keeps one', () => {
  const first = readXeroContacts(file({ ContactName: 'A', FirstName: 'Nick', LastName: 'Reid', SAAttentionTo: 'Store', Person1FirstName: 'Jo' }));
  assert.equal(first.contacts[0].contact_name, 'Nick Reid');

  const attention = readXeroContacts(file({ ContactName: 'A', SAAttentionTo: 'Store', POAttentionTo: 'Accounts' }));
  assert.equal(attention.contacts[0].contact_name, 'Store');

  const postal = readXeroContacts(file({ ContactName: 'A', POAttentionTo: 'Accounts' }));
  assert.equal(postal.contacts[0].contact_name, 'Accounts');

  const person = readXeroContacts(file({ ContactName: 'A', Person1FirstName: 'Jo', Person1LastName: 'Bell' }));
  assert.equal(person.contacts[0].contact_name, 'Jo Bell');

  // A surname on its own is still a name, and a contact with none reads as none.
  assert.equal(readXeroContacts(file({ ContactName: 'A', LastName: 'Reid' })).contacts[0].contact_name, 'Reid');
  assert.equal(readXeroContacts(file({ ContactName: 'A' })).contacts[0].contact_name, null);
});

test('the landline is taken before the mobile, and the account address before a person of it', () => {
  assert.equal(readXeroContacts(file({ ContactName: 'A', PhoneNumber: '03 9459 1333', MobileNumber: '0400 000 000' })).contacts[0].phone, '03 9459 1333');
  assert.equal(readXeroContacts(file({ ContactName: 'A', MobileNumber: '0400 000 000' })).contacts[0].phone, '0400 000 000');

  assert.equal(readXeroContacts(file({ ContactName: 'A', EmailAddress: 'orders@x.com', Person1Email: 'jo@x.com' })).contacts[0].contact_email, 'orders@x.com');
  assert.equal(readXeroContacts(file({ ContactName: 'A', Person1Email: 'jo@x.com' })).contacts[0].contact_email, 'jo@x.com');
});

test('the truck is sent to the street address, not the postal one', () => {
  const both = readXeroContacts(
    file({
      ContactName: 'A',
      POAddressLine1: 'PO Box 55',
      POCity: 'Heidelberg West',
      PORegion: 'VIC',
      POPostalCode: '3081',
      SAAddressLine1: '130 Bamfield Road',
      SACity: 'Heidelberg West',
      SARegion: 'VIC',
      SAPostalCode: '3081',
    })
  );
  assert.equal(both.contacts[0].delivery_address, '130 Bamfield Road, Heidelberg West VIC 3081');
  assert.equal(both.postalFallback, 0);
});

test('with no street address the postal one is used, and a box is counted', () => {
  const box = readXeroContacts(file({ ContactName: 'A', POAddressLine1: 'PO Box 55', POCity: 'Heidelberg West', PORegion: 'VIC', POPostalCode: '3081' }));
  assert.equal(box.contacts[0].delivery_address, 'PO Box 55, Heidelberg West VIC 3081');
  assert.equal(box.postalFallback, 1);
  assert.equal(box.postalFallbackLooksLikeBox, 1);

  const street = readXeroContacts(file({ ContactName: 'A', POAddressLine1: '12 Smith Street', POCity: 'Preston', PORegion: 'VIC', POPostalCode: '3072' }));
  assert.equal(street.postalFallback, 1);
  assert.equal(street.postalFallbackLooksLikeBox, 0);
});

test('every address line is kept, and the country last', () => {
  const reading = readXeroContacts(file({ ContactName: 'A', SAAddressLine1: 'Unit 4', SAAddressLine2: '12 Smith Street', SACity: 'Preston', SARegion: 'VIC', SAPostalCode: '3072', SACountry: 'AUSTRALIA' }));
  assert.equal(reading.contacts[0].delivery_address, 'Unit 4, 12 Smith Street, Preston VIC 3072, AUSTRALIA');
});

test('a contact the database has not got is created', () => {
  const plan = planCustomerImport([contact({ contact_email: 'orders@x.com' })], []);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.create[0].contact_email, 'orders@x.com');
});

test('a name matches whatever its case and spacing', () => {
  assert.equal(customerNameKey('  HARBOUR   Marine '), 'harbour marine');
  const plan = planCustomerImport([contact({ name: 'HARBOUR  MARINE', phone: '03 9459 1333' })], [customer({ name: 'Harbour Marine' })]);
  assert.equal(plan.create.length, 0);
  assert.deepEqual(plan.update, [{ id: 'c1', name: 'Harbour Marine', changes: { phone: '03 9459 1333' }, replaced: [] }]);
});

test('an import never empties a field the app already holds', () => {
  // Xero has no email for 64 of the 663 contacts. A value typed in here must survive the import.
  const plan = planCustomerImport([contact({ phone: '03 9459 1333' })], [customer({ contact_email: 'typed@byhand.com', delivery_address: '130 Bamfield Road' })]);
  assert.deepEqual(plan.update, [{ id: 'c1', name: 'Harbour Marine', changes: { phone: '03 9459 1333' }, replaced: [] }]);
});

test('a contact that says nothing new changes nothing', () => {
  const plan = planCustomerImport([contact({ contact_email: 'orders@x.com', phone: '03 9459 1333' })], [customer({ contact_email: 'orders@x.com', phone: '03 9459 1333' })]);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.create.length, 0);
});

test('two customers of the same name are left alone and reported', () => {
  const plan = planCustomerImport([contact({ phone: '03 9459 1333' })], [customer({ id: 'c1' }), customer({ id: 'c2' })]);
  assert.deepEqual(plan.ambiguous, ['Harbour Marine']);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.create.length, 0);
});

test('the whole file reads, and reads the same the second time', () => {
  const text = file({ ContactName: 'Harbour Marine', EmailAddress: 'orders@harbour.com', PhoneNumber: '03 9459 1333' }, { ContactName: 'Bay Glass', SAAddressLine1: '12 Smith Street', SACity: 'Preston', SARegion: 'VIC', SAPostalCode: '3072' }, { ContactName: 'Pier Aluminium, Pty Ltd', FirstName: 'Jo', LastName: 'Bell' });
  const reading = readXeroContacts(text);
  assert.equal(reading.contacts.length, 3);
  // A comma in the name is why the field is quoted; it must come back whole.
  assert.equal(reading.contacts[2].name, 'Pier Aluminium, Pty Ltd');

  const first = planCustomerImport(reading.contacts, []);
  assert.equal(first.create.length, 3);

  // Running the same file against the rows it would have made must change nothing.
  const saved = first.create.map((made, index) => ({ id: `c${index}`, ...made }));
  const second = planCustomerImport(reading.contacts, saved);
  assert.equal(second.unchanged, 3);
  assert.equal(second.create.length, 0);
  assert.equal(second.update.length, 0);
});

test('a field Xero disagrees with is replaced, and counted as replaced', () => {
  // Xero is where the customer list is kept, so Xero wins. What the operator needs is to see how
  // much would be written over before pressing the button, not to find out afterwards.
  const plan = planCustomerImport([contact({ contact_email: 'orders@x.com', phone: '03 9459 1333' })], [customer({ contact_email: 'old@x.com' })]);
  assert.equal(plan.update.length, 1);
  assert.deepEqual(plan.update[0].changes, { contact_email: 'orders@x.com', phone: '03 9459 1333' });
  // The email was held and differs, so it is replaced. The phone was empty, so it is only filled.
  assert.deepEqual(plan.update[0].replaced, ['contact_email']);
});
