/**
 * Reads the CSV that Xero writes from Contacts, and turns it into customer rows.
 *
 * Xero holds the customer list. Until the app talks to the Xero API, the way across is the export
 * file: Contacts, Export, then the file lands here.
 *
 * Three things about the real file decide how this is written.
 *
 * The header names 73 columns. A data row carries 53, 57 or 61. Xero drops the trailing Person2 to
 * Person5 columns when nobody filled them in, so a row is read as short and the missing columns
 * read as empty. A parser that demands the header's column count rejects every row.
 *
 * The file has no ContactID column. The customer name is therefore the only key between an export
 * and the rows already in the database. The export of 663 contacts holds no repeated name, and no
 * repeat when compared without case, so the name serves. Matching ignores case and repeated spaces
 * because a name typed into this app by hand will not match Xero's spacing.
 *
 * The file holds two addresses. PO is the postal address and SA is the street address. Of 336
 * postal addresses, 34 read as a post office box or a locked bag, against 9 of 284 street
 * addresses. A truck is sent to the street address, so the street address is taken first and the
 * postal address only when there is no street address.
 */

export interface XeroCustomerFields {
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  delivery_address: string | null;
}

export interface XeroContactsReading {
  contacts: XeroCustomerFields[];
  /** A row that carries no name cannot become a customer. The line number is the one in the file. */
  skipped: { line: number; reason: string }[];
  /** Rows whose delivery address had to come from the postal block, and how many read as a box. */
  postalFallback: number;
  postalFallbackLooksLikeBox: number;
}

const ADDRESS_LINES = ['AddressLine1', 'AddressLine2', 'AddressLine3', 'AddressLine4'];

// A box or a bag takes no delivery. The count is reported so the operator can look at those rows.
const BOX_ADDRESS = /^\s*(p\.?\s*o\.?\s*box|locked bag|gpo\b|private bag)/i;

/**
 * Splits CSV text into rows of fields, to RFC 4180.
 *
 * A field is quoted when it holds a comma, and two quotes inside a quoted field mean one quote.
 * The export uses CRLF, and a quoted field may hold a line ending of its own, so the line break is
 * read inside the loop rather than by splitting the text first.
 */
export function parseCsv(text: string): string[][] {
  // A file written on Windows may start with a byte order mark, which would otherwise become part
  // of the first column name.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };

  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < input.length) {
    const character = input[index];

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = true;
      index += 1;
      continue;
    }

    if (character === ',') {
      endField();
      index += 1;
      continue;
    }

    if (character === '\r' || character === '\n') {
      endRow();
      index += character === '\r' && input[index + 1] === '\n' ? 2 : 1;
      continue;
    }

    field += character;
    index += 1;
  }

  // A file that does not end with a line break still holds a last row. A file that does end with
  // one must not gain an empty row from it.
  if (field !== '' || row.length) {
    endRow();
  }

  return rows;
}

function clean(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

/** The name as a key: no case, no repeated space. */
export function customerNameKey(name: string): string {
  return clean(name).toLowerCase();
}

function joinName(first: string, last: string): string {
  return clean(`${first} ${last}`);
}

function readAddress(get: (column: string) => string, prefix: 'PO' | 'SA'): string {
  const lines = ADDRESS_LINES.map((line) => get(`${prefix}${line}`)).filter(Boolean);
  const locality = [get(`${prefix}City`), get(`${prefix}Region`), get(`${prefix}PostalCode`)].filter(Boolean).join(' ');
  return [...lines, locality, get(`${prefix}Country`)].filter(Boolean).join(', ');
}

/**
 * Reads an exported contacts file.
 *
 * Xero marks a required column with a leading asterisk, as in *ContactName. The asterisk is part of
 * the column name in the file and is removed here, so that a later export that drops the mark still
 * reads.
 */
export function readXeroContacts(text: string): XeroContactsReading {
  const rows = parseCsv(text).filter((row) => row.some((field) => field.trim() !== ''));
  if (!rows.length) {
    return { contacts: [], skipped: [], postalFallback: 0, postalFallbackLooksLikeBox: 0 };
  }

  const header = rows[0].map((column) => clean(column).replace(/^\*/, ''));
  const contacts: XeroCustomerFields[] = [];
  const skipped: { line: number; reason: string }[] = [];
  let postalFallback = 0;
  let postalFallbackLooksLikeBox = 0;

  rows.slice(1).forEach((row, offset) => {
    // A short row is the normal case, so a column past the end of the row reads as empty.
    const get = (column: string): string => {
      const at = header.indexOf(column);
      return at === -1 ? '' : clean(row[at]);
    };

    const name = get('ContactName');
    if (!name) {
      skipped.push({ line: offset + 2, reason: 'The row has no contact name.' });
      return;
    }

    const street = readAddress(get, 'SA');
    const postal = readAddress(get, 'PO');
    const delivery = street || postal;

    if (!street && postal) {
      postalFallback += 1;
      if (BOX_ADDRESS.test(postal)) {
        postalFallbackLooksLikeBox += 1;
      }
    }

    contacts.push({
      name,
      // Xero holds a person in three places, and uses whichever the operator reached for.
      contact_name: joinName(get('FirstName'), get('LastName')) || get('SAAttentionTo') || get('POAttentionTo') || joinName(get('Person1FirstName'), get('Person1LastName')) || null,
      contact_email: get('EmailAddress') || get('Person1Email') || null,
      phone: get('PhoneNumber') || get('MobileNumber') || null,
      delivery_address: delivery || null,
    });
  });

  return { contacts, skipped, postalFallback, postalFallbackLooksLikeBox };
}

export interface ExistingCustomer {
  id: string;
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  delivery_address?: string | null;
}

export type CustomerField = 'contact_name' | 'contact_email' | 'phone' | 'delivery_address';

export interface PlannedUpdate {
  id: string;
  name: string;
  changes: Partial<Record<CustomerField, string>>;
  /**
   * The changed fields that already held a different value. The rest were empty and are only being
   * filled. Replacing is counted separately because the operator should see, before the import
   * runs, how much of what is held would be written over.
   */
  replaced: CustomerField[];
}

export interface CustomerImportPlan {
  create: XeroCustomerFields[];
  update: PlannedUpdate[];
  unchanged: number;
  /** Two customers already in the database whose names match the same contact. Neither is touched. */
  ambiguous: string[];
}

const UPDATABLE: CustomerField[] = ['contact_name', 'contact_email', 'phone', 'delivery_address'];

/**
 * Works out what an import would do, without doing it.
 *
 * An import never empties a field. Xero holds no email for 64 of the 663 contacts, and no phone for
 * 277. Where a value was typed into this app by hand, an export that has nothing to say about it
 * must leave it alone. So a field is written only when Xero has something in it, and then only when
 * it differs from what is held.
 *
 * Where both hold a value and they differ, Xero wins. Xero is where the customer list is kept, and
 * this app takes a copy of it. The count of such fields is reported as `replaced`, so that the
 * operator sees the size of that before the import runs rather than after.
 *
 * A name that matches two customers already in the database is reported and left alone, because
 * there is no way to tell which one the contact is.
 */
export function planCustomerImport(contacts: XeroCustomerFields[], existing: ExistingCustomer[]): CustomerImportPlan {
  const byKey = new Map<string, ExistingCustomer[]>();
  existing.forEach((customer) => {
    const key = customerNameKey(customer.name);
    const held = byKey.get(key);
    if (held) {
      held.push(customer);
      return;
    }
    byKey.set(key, [customer]);
  });

  const create: XeroCustomerFields[] = [];
  const update: PlannedUpdate[] = [];
  const ambiguous: string[] = [];
  let unchanged = 0;

  contacts.forEach((contact) => {
    const matches = byKey.get(customerNameKey(contact.name));

    if (!matches || !matches.length) {
      create.push(contact);
      return;
    }

    if (matches.length > 1) {
      ambiguous.push(contact.name);
      return;
    }

    const held = matches[0];
    const changes: Partial<Record<CustomerField, string>> = {};
    const replaced: CustomerField[] = [];

    UPDATABLE.forEach((field) => {
      const value = contact[field];
      if (!value) {
        return;
      }
      const current = clean(held[field] || '');
      if (current === value) {
        return;
      }
      changes[field] = value;
      if (current) {
        replaced.push(field);
      }
    });

    if (Object.keys(changes).length) {
      update.push({ id: held.id, name: held.name, changes, replaced });
      return;
    }

    unchanged += 1;
  });

  return { create, update, unchanged, ambiguous };
}
