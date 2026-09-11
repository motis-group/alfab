/**
 * The order as it is being edited, before it is saved.
 *
 * These shapes used to live inside the order page. They moved here so a calculator can be handed a
 * line to edit and hand it back: both ends need to agree on what a line is, and an unsaved order
 * has to survive the trip. See utils/line-editing.ts.
 */

import { AwningCostingInput } from '@utils/awning-costing';
import { GlassSpecification } from '@utils/calculations';
import { OrderStatus, PricingSource, todayISODate } from '@utils/order-management';
import { WindowCostingInput } from '@utils/window-costing';

export const defaultAdhocSpec: GlassSpecification = {
  width: 1000,
  height: 1000,
  thickness: 4,
  glassType: 'Clear',
  edgework: 'ROUGH ARRIS',
  ceramicBand: false,
  shape: 'RECTANGLE',
  holes: false,
  numHoles: 0,
  radiusCorners: false,
  scanning: false,
};

export interface OrderFormState {
  id: string | null;
  customerId: string;
  poNumber: string;
  receivedDate: string;
  requiredDate: string;
  status: OrderStatus;
  notes: string;
  /** The saved quotes a new order is made from. Saving the order links them, which makes them won. */
  quoteIds: string[];
}

export interface LineDraft {
  localId: string;
  id?: string;
  quantityOrdered: number;
  quantityFulfilled: number;
  unitPriceAtOrder: number;
  lineNote: string;
  pricingSource: PricingSource;
  customerProductId: string;
  adhocSpec: GlassSpecification;
  windowSpec: WindowCostingInput | null;
  windowRatesUpdatedAt: string | null;
  awningSpec: AwningCostingInput | null;
  awningRatesUpdatedAt: string | null;
  /** Minutes the line really took, for the whole line. Empty until the job is done. */
  actualMinutes: number | null;
  markupPercent: number;
}

export function createLineDraft(partial?: Partial<LineDraft>): LineDraft {
  return {
    localId: partial?.localId || `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    id: partial?.id,
    quantityOrdered: partial?.quantityOrdered ?? 1,
    quantityFulfilled: partial?.quantityFulfilled ?? 0,
    unitPriceAtOrder: partial?.unitPriceAtOrder ?? 0,
    lineNote: partial?.lineNote || '',
    pricingSource: partial?.pricingSource || 'existing_config',
    customerProductId: partial?.customerProductId || '',
    adhocSpec: partial?.adhocSpec || { ...defaultAdhocSpec },
    windowSpec: partial?.windowSpec ?? null,
    windowRatesUpdatedAt: partial?.windowRatesUpdatedAt ?? null,
    awningSpec: partial?.awningSpec ?? null,
    awningRatesUpdatedAt: partial?.awningRatesUpdatedAt ?? null,
    actualMinutes: partial?.actualMinutes ?? null,
    markupPercent: partial?.markupPercent ?? 20,
  };
}

export function emptyOrderForm(): OrderFormState {
  return { id: null, customerId: '', poNumber: '', receivedDate: todayISODate(), requiredDate: '', status: 'open', notes: '', quoteIds: [] };
}
