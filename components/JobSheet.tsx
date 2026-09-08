'use client';

import { Customer, PurchaseOrder, statusLabel } from '@utils/order-management';

export interface JobSheetLine {
  id: string;
  index: number;
  description: string;
  quantity: number;
  notes: string;
}

interface JobSheetProps {
  order: Pick<PurchaseOrder, 'po_number' | 'received_date' | 'required_date' | 'status' | 'notes'>;
  customer: Pick<Customer, 'name' | 'contact_name' | 'phone' | 'delivery_address'> | null;
  lines: JobSheetLine[];
}

/** The date part of a stored date or timestamp, which is all the floor needs. */
function dateOnly(value?: string | null): string {
  return (value || '').slice(0, 10) || 'not given';
}

/**
 * The works order for the floor. Carries what to make, not what it costs: no prices, no margin.
 *
 * Hidden on screen, printed by the same rules as the costing sheet.
 */
export default function JobSheet({ order, customer, lines }: JobSheetProps) {
  return (
    <section className="window-costing-sheet" aria-hidden="true">
      <article className="window-costing-sheet__window">
        <header className="window-costing-sheet__heading">
          <h1 className="window-costing-sheet__title">Job sheet</h1>
          <span>PO {order.po_number || '—'}</span>
        </header>

        <div className="window-costing-sheet__meta">
          <span>Customer: {customer?.name || '—'}</span>
          <span>Required: {dateOnly(order.required_date)}</span>
          <span>Contact: {customer?.contact_name || '—'}</span>
          <span>Received: {dateOnly(order.received_date)}</span>
          <span>Status: {statusLabel(order.status)}</span>
          <span>Lines: {lines.length}</span>
          <span>Phone: {customer?.phone || '—'}</span>
        </div>

        {customer?.delivery_address ? <p className="window-costing-sheet__note">Deliver to: {customer.delivery_address}</p> : null}

        <table className="window-costing-sheet__table">
          <thead>
            <tr>
              <th style={{ width: '4%' }}>#</th>
              <th style={{ width: '46%' }}>Make</th>
              <th style={{ width: '8%' }}>Qty</th>
              <th style={{ width: '12%' }}>Made</th>
              <th style={{ width: '12%' }}>By</th>
              <th style={{ width: '18%' }}>Checked</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.index}</td>
                <td>
                  {line.description}
                  {line.notes ? <div>{line.notes}</div> : null}
                </td>
                <td>{line.quantity}</td>
                <td />
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>

        {order.notes ? <p className="window-costing-sheet__note">Order notes: {order.notes}</p> : null}

        <footer className="window-costing-sheet__footer">Finished by: ______________________ Date: ____________ Checked by: ______________________</footer>
      </article>
    </section>
  );
}
