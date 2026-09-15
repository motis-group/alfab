'use client';

import styles from '@components/CustomerPicker.module.scss';

import * as React from 'react';
import * as Utilities from '@common/utilities';

import { CustomerMatch, SearchableCustomer, customerMatchDetail, searchCustomers } from '@utils/customer-search';

interface CustomerPickerProps<T extends SearchableCustomer> {
  customers: T[];
  /** The id of the customer now attached, or '' for none. */
  value: string;
  /** Called with the id and the customer, so a caller that also holds the name can set it. */
  onChange: (customerId: string, customer: T | null) => void;
  label?: string;
  /** The row that attaches no customer. The select this replaced carried the same words. */
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  activeOnly?: boolean;
  id?: string;
}

const SHOWN = 8;

/**
 * Attaches a customer to a quote by typing instead of scrolling.
 *
 * The list holds 663 names since it came from Xero. A select of that length is opened, scrolled and
 * read; this is typed into and narrows as it is.
 *
 * It is a combobox, so it is built as one: the input owns the focus and the keys, and the list is
 * pointed at by aria-activedescendant rather than taking focus itself. A person on the keyboard
 * moves through the rows with the arrows, attaches with Enter, and leaves it as it was with Escape.
 */
function CustomerPicker<T extends SearchableCustomer>({ customers, value, onChange, label, emptyLabel = 'Walk-in / not on file', placeholder = 'Type a name, person, address or number', disabled, activeOnly, id }: CustomerPickerProps<T>) {
  const generatedId = React.useId();
  const rootId = id || generatedId;
  const listId = `${rootId}-list`;

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const blurTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // null means nothing is being typed, so the input shows the attached customer instead.
  const [query, setQuery] = React.useState<string | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);

  const selected = React.useMemo(() => customers.find((customer) => customer.id === value) || null, [customers, value]);

  const result = React.useMemo(() => searchCustomers(customers, query ?? '', { limit: SHOWN, activeOnly }), [customers, query, activeOnly]);

  // The row that attaches nobody sits at the top, where the select kept it.
  const rows: (CustomerMatch<T> | null)[] = React.useMemo(() => [null, ...result.matches], [result]);

  React.useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  function close() {
    setIsOpen(false);
    setQuery(null);
    setHighlighted(0);
  }

  function pick(row: CustomerMatch<T> | null) {
    onChange(row ? row.customer.id : '', row ? row.customer : null);
    close();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // The list owns the arrows while it is open. Input moves focus between fields with them, so
      // without this the page would jump to the next field instead of the next name.
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((at) => (at + step + rows.length) % rows.length);
      return;
    }

    if (event.key === 'Enter') {
      if (!isOpen) return;
      event.preventDefault();
      pick(rows[highlighted] ?? null);
      return;
    }

    if (event.key === 'Escape') {
      if (!isOpen) return;
      event.preventDefault();
      close();
      return;
    }

    if (event.key === 'Tab') {
      close();
    }
  }

  const shownValue = query === null ? selected?.name || '' : query;
  const hiddenCount = result.total - result.matches.length;

  return (
    <div className={styles.root}>
      {label ? (
        <label htmlFor={rootId} className={styles.label}>
          {label}
        </label>
      ) : null}

      <input
        id={rootId}
        ref={inputRef}
        className={styles.field}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen ? `${rootId}-row-${highlighted}` : undefined}
        placeholder={selected ? selected.name : placeholder}
        value={shownValue}
        disabled={disabled}
        onFocus={(event) => {
          setIsOpen(true);
          setHighlighted(0);
          event.target.select();
        }}
        onBlur={() => {
          // A click on a row fires after the blur, so closing waits long enough to hear it.
          blurTimer.current = setTimeout(close, 120);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          setHighlighted(0);
        }}
        onKeyDown={onKeyDown}
      />

      {isOpen ? (
        <ul className={styles.list} id={listId} role="listbox" aria-label={label || 'Customers'}>
          {rows.map((row, index) => {
            const detail = row ? customerMatchDetail(row) : '';
            return (
              <li
                key={row ? row.customer.id : 'none'}
                id={`${rootId}-row-${index}`}
                role="option"
                aria-selected={index === highlighted}
                className={Utilities.classNames(styles.row, index === highlighted ? styles.highlighted : null)}
                // Keeps the focus on the input, so the blur above never races the click.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => pick(row)}
              >
                <span className={styles.name}>{row ? row.customer.name : emptyLabel}</span>
                {detail ? <span className={styles.detail}>{detail}</span> : null}
              </li>
            );
          })}

          {!result.matches.length && query ? <li className={styles.empty}>No customer of that name. The row above leaves the quote without one.</li> : null}

          {hiddenCount > 0 ? <li className={styles.empty}>{hiddenCount} more. Type more of the name to narrow it.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export default CustomerPicker;
