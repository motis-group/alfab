import { createClient } from '@utils/db-client';
import { MeasuredLine } from '@utils/estimate-accuracy';
import { parseLineNotes } from '@utils/order-management';

const TABLE = 'purchase_order_lines';

interface LineRow {
  quantity_ordered: number | null;
  line_notes: string | null;
  actual_minutes: number | string | null;
}

/**
 * Order lines that carry both a costing spec and the minutes they really took. Lines with no
 * recorded minutes are left out rather than counted as zero, so an unmeasured shop reports as
 * unmeasured instead of reporting every estimate as perfect.
 */
export async function loadMeasuredLines(): Promise<MeasuredLine[]> {
  const db = createClient();
  const { data, error } = await db.from(TABLE).select('quantity_ordered, line_notes, actual_minutes');
  if (error) {
    throw new Error(error.message);
  }

  const lines: MeasuredLine[] = [];

  for (const row of (data as LineRow[]) || []) {
    const actualMinutes = Number(row.actual_minutes);
    if (!Number.isFinite(actualMinutes) || actualMinutes <= 0) {
      continue;
    }

    const notes = parseLineNotes(row.line_notes);
    const quantity = Math.max(1, Number(row.quantity_ordered) || 1);

    if (notes.windowSpecification) {
      lines.push({ kind: 'window', quantity, actualMinutes, windowSpec: notes.windowSpecification, label: notes.productLabel || notes.note || 'Window' });
      continue;
    }
    if (notes.awningSpecification) {
      lines.push({ kind: 'awning', quantity, actualMinutes, awningSpec: notes.awningSpecification, label: notes.productLabel || notes.note || 'Awning' });
    }
  }

  return lines;
}
