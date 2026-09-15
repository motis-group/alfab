/**
 * Finds a customer by what the operator types.
 *
 * The customer list came from Xero and holds 663 names. A list of that length cannot be scrolled
 * to find one name, so the operator types instead and the list narrows.
 *
 * What is typed may be the company, the person at it, the address it writes from, or the number the
 * office rings. All four are searched, because the operator on the telephone has whichever of them
 * the caller gave.
 *
 * Order matters more than the match itself. Typing one letter matches hundreds of the 663, so a
 * name that begins with what was typed is put above a name that merely holds it somewhere, and a
 * match on the company above a match on the person.
 */

export interface SearchableCustomer {
  id: string;
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  is_active?: boolean | null;
}

/** Which field matched, so the list can say why a row is in it. */
export type CustomerMatchField = 'name' | 'contact' | 'email' | 'phone';

export interface CustomerMatch<T extends SearchableCustomer = SearchableCustomer> {
  customer: T;
  on: CustomerMatchField;
}

export interface CustomerSearchResult<T extends SearchableCustomer = SearchableCustomer> {
  matches: CustomerMatch<T>[];
  /** How many matched in all. More than `matches.length` means the list is cut short. */
  total: number;
}

function normalise(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** A telephone number is written many ways. Comparing only the digits matches all of them. */
function digits(value: string | null | undefined): string {
  return (value || '').replace(/\D+/g, '');
}

// Lower sorts first.
const STARTS_NAME = 0;
const STARTS_WORD = 1;
const HOLDS_NAME = 2;
const HOLDS_OTHER = 3;
const NO_MATCH = 9;

function rankOf(customer: SearchableCustomer, query: string, queryDigits: string): { rank: number; on: CustomerMatchField } {
  const name = normalise(customer.name);

  if (name.startsWith(query)) {
    return { rank: STARTS_NAME, on: 'name' };
  }

  // "glass" should find "Bay Glass", not only names opening with it.
  if (name.split(' ').some((word) => word.startsWith(query))) {
    return { rank: STARTS_WORD, on: 'name' };
  }

  if (name.includes(query)) {
    return { rank: HOLDS_NAME, on: 'name' };
  }

  if (normalise(customer.contact_name).includes(query)) {
    return { rank: HOLDS_OTHER, on: 'contact' };
  }

  if (normalise(customer.contact_email).includes(query)) {
    return { rank: HOLDS_OTHER, on: 'email' };
  }

  // A number is only searched when digits were typed, or "03" would match every landline.
  if (queryDigits.length >= 3 && digits(customer.phone).includes(queryDigits)) {
    return { rank: HOLDS_OTHER, on: 'phone' };
  }

  return { rank: NO_MATCH, on: 'name' };
}

export interface CustomerSearchOptions {
  /** How many to return. The rest are counted in `total` and not built. */
  limit?: number;
  /** Leave out the customers marked inactive. */
  activeOnly?: boolean;
}

export function searchCustomers<T extends SearchableCustomer>(customers: T[], query: string, options: CustomerSearchOptions = {}): CustomerSearchResult<T> {
  const limit = options.limit ?? 8;
  const pool = options.activeOnly ? customers.filter((customer) => customer.is_active !== false) : customers;

  const wanted = normalise(query);

  // Nothing typed: the head of the list in the order it was given, which the pages sort by name.
  if (!wanted) {
    return {
      matches: pool.slice(0, limit).map((customer) => ({ customer, on: 'name' as CustomerMatchField })),
      total: pool.length,
    };
  }

  const wantedDigits = digits(query);

  const ranked = pool
    .map((customer) => ({ customer, ...rankOf(customer, wanted, wantedDigits) }))
    .filter((entry) => entry.rank !== NO_MATCH)
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return normalise(left.customer.name).localeCompare(normalise(right.customer.name));
    });

  return {
    matches: ranked.slice(0, limit).map((entry) => ({ customer: entry.customer, on: entry.on })),
    total: ranked.length,
  };
}

/** The second line of a row: what to show so two alike names can be told apart. */
export function customerMatchDetail(match: CustomerMatch): string {
  const { customer, on } = match;

  if (on === 'contact' && customer.contact_name) {
    return customer.contact_name;
  }

  if (on === 'email' && customer.contact_email) {
    return customer.contact_email;
  }

  if (on === 'phone' && customer.phone) {
    return customer.phone;
  }

  return [customer.contact_name, customer.phone].filter(Boolean).join(' · ');
}
