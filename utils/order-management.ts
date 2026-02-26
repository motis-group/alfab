import { GlassSpecification } from '@utils/calculations';

export type UserRole = 'superadmin' | 'admin' | 'standard' | 'readonly';
export type OrderStatus = 'open' | 'in_production' | 'fulfilled' | 'cancelled';
export type PricingSource = 'existing_config' | 'adhoc_calculator';

export interface Customer {
  id: string;
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
}

export interface ProductCategory {
  id: string;
  name: string;
  description?: string | null;
}

export interface Product {
  id: string;
  name: string;
  category_id?: string | null;
  sku?: string | null;
  unit_price?: number | null;
  is_active?: boolean | null;
  created_at?: string | null;
}

export interface CustomerProduct {
  id: string;
  customer_id: string;
  name: string;
  product_id?: string | null;
  customer_part_ref?: string | null;
  default_qty?: number | null;
  notes?: string | null;
}

export interface PurchaseOrder {
  id: string;
  customer_id: string;
  po_number: string;
  received_date: string;
  required_date?: string | null;
  status: OrderStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  product_id?: string | null;
  quantity_ordered: number;
  quantity_fulfilled?: number | null;
  unit_price_at_order?: number | null;
  line_notes?: string | null;
}

export interface CustomerProductNotes {
  note: string;
  unitPrice?: number | null;
  savedSpecification?: GlassSpecification | null;
}

export interface ParsedCustomerProductNotes extends CustomerProductNotes {
  isJson: boolean;
}

export interface LineNotesPayload {
  note: string;
  pricingSource?: PricingSource;
  customerProductId?: string | null;
  adhocSpecification?: GlassSpecification | null;
  markupPercent?: number | null;
  productLabel?: string | null;
}

export interface ParsedLineNotes extends LineNotesPayload {
  isJson: boolean;
}

export const ORDER_STATUS_OPTIONS: OrderStatus[] = ['open', 'in_production', 'fulfilled', 'cancelled'];
export const USER_ROLE_OPTIONS: UserRole[] = ['superadmin', 'admin', 'standard', 'readonly'];

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function todayISODate(): string {
  return new Date().toISOString().split('T')[0];
}

export function formatCurrency(value: number | null | undefined): string {
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `$${amount.toFixed(2)}`;
}

export function statusLabel(status: OrderStatus): string {
  switch (status) {
    case 'open':
      return 'OPEN';
    case 'in_production':
      return 'IN PRODUCTION';
    case 'fulfilled':
      return 'FULFILLED';
    case 'cancelled':
      return 'CANCELLED';
  }
}

export function calculateLineTotal(line: Pick<PurchaseOrderLine, 'quantity_ordered' | 'unit_price_at_order'>): number {
  const qty = Number(line.quantity_ordered || 0);
  const unitPrice = Number(line.unit_price_at_order || 0);
  return qty * unitPrice;
}

export function calculateOrderTotal(lines: Array<Pick<PurchaseOrderLine, 'quantity_ordered' | 'unit_price_at_order'>>): number {
  return lines.reduce((sum, line) => sum + calculateLineTotal(line), 0);
}

function tryParseJSON(value: string | null | undefined): any | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseCustomerProductNotes(rawValue: string | null | undefined): ParsedCustomerProductNotes {
  const parsed = tryParseJSON(rawValue);
  if (!parsed || typeof parsed !== 'object') {
    return {
      note: rawValue || '',
      isJson: false,
    };
  }

  return {
    note: typeof parsed.note === 'string' ? parsed.note : '',
    unitPrice: toNumber((parsed as any).unitPrice),
    savedSpecification: typeof (parsed as any).savedSpecification === 'object' ? ((parsed as any).savedSpecification as GlassSpecification) : null,
    isJson: true,
  };
}

export function serializeCustomerProductNotes(input: CustomerProductNotes): string {
  return JSON.stringify({
    note: input.note || '',
    unitPrice: toNumber(input.unitPrice),
    savedSpecification: input.savedSpecification ?? null,
  });
}

export function parseLineNotes(rawValue: string | null | undefined): ParsedLineNotes {
  const parsed = tryParseJSON(rawValue);
  if (!parsed || typeof parsed !== 'object') {
    return {
      note: rawValue || '',
      isJson: false,
    };
  }

  const pricingSource = (parsed as any).pricingSource;
  const validPricingSource: PricingSource | undefined = pricingSource === 'existing_config' || pricingSource === 'adhoc_calculator' ? pricingSource : undefined;

  return {
    note: typeof parsed.note === 'string' ? parsed.note : '',
    pricingSource: validPricingSource,
    customerProductId: typeof (parsed as any).customerProductId === 'string' ? (parsed as any).customerProductId : null,
    adhocSpecification: typeof (parsed as any).adhocSpecification === 'object' ? ((parsed as any).adhocSpecification as GlassSpecification) : null,
    markupPercent: toNumber((parsed as any).markupPercent),
    productLabel: typeof (parsed as any).productLabel === 'string' ? (parsed as any).productLabel : null,
    isJson: true,
  };
}

export function serializeLineNotes(input: LineNotesPayload): string {
  return JSON.stringify({
    note: input.note || '',
    pricingSource: input.pricingSource || null,
    customerProductId: input.customerProductId || null,
    adhocSpecification: input.adhocSpecification ?? null,
    markupPercent: toNumber(input.markupPercent),
    productLabel: input.productLabel || null,
  });
}
