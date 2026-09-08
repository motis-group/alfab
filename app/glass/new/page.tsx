'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import CadImportPanel from '@components/CadImportPanel';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { usePricing } from '@components/PricingProvider';
import JobSheet from '@components/JobSheet';
import { CostBreakdown, GlassSpecification, calculateCost, describeGlassSpecification, getAvailableGlassTypes, getAvailableThicknesses } from '@utils/calculations';
import { APP_NAVIGATION_ITEMS } from '@utils/app-navigation';
import {
  Customer,
  CustomerProduct,
  ORDER_STATUS_OPTIONS,
  OrderStatus,
  ParsedLineNotes,
  PricingSource,
  PurchaseOrder,
  PurchaseOrderLine,
  UserRole,
  formatCurrency,
  parseCustomerProductNotes,
  parseLineNotes,
  serializeLineNotes,
  statusLabel,
  todayISODate,
} from '@utils/order-management';
import { QuoteToOrderDraft, buildQuoteDraftLineDescription, buildWindowLineDescription, consumeQuoteToOrderDraft } from '@utils/quote-to-order';
import { WindowCostingInput, describeWindow } from '@utils/window-costing';
import { productFullName } from '@utils/window-catalogue';
import { WindowRates, mergeWindowRates } from '@utils/window-costing-rates';
import { loadWindowRates } from '@utils/window-costing-store';
import { createClient } from '@utils/db-client';
import { fetchCurrentSessionUser } from '@utils/session-client';

const TABLE_CUSTOMERS = 'customers';
const TABLE_CUSTOMER_PRODUCTS = 'customer_products';
const TABLE_PURCHASE_ORDERS = 'purchase_orders';
const TABLE_PURCHASE_ORDER_LINES = 'purchase_order_lines';

const EDGEWORK_OPTIONS: GlassSpecification['edgework'][] = ['ROUGH ARRIS', 'FLAT GRIND - STRAIGHT', 'FLAT GRIND - CURVED', 'FLAT POLISH - STRAIGHT', 'FLAT POLISH - CURVED'];

const navigationItems = APP_NAVIGATION_ITEMS;

const defaultAdhocSpec: GlassSpecification = {
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

interface OrderFormState {
  id: string | null;
  customerId: string;
  poNumber: string;
  receivedDate: string;
  requiredDate: string;
  status: OrderStatus;
  notes: string;
}

interface LineDraft {
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
  markupPercent: number;
}

function createLineDraft(partial?: Partial<LineDraft>): LineDraft {
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
    markupPercent: partial?.markupPercent ?? 20,
  };
}

function numberOrFallback(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLineNote(parsed: ParsedLineNotes, fallbackRaw?: string | null): string {
  if (parsed.note) {
    return parsed.note;
  }
  if (parsed.isJson) {
    return '';
  }
  return fallbackRaw || '';
}

function normalizeCustomerLookupName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { pricingData } = usePricing();

  const [role, setRole] = useState<UserRole>('readonly');

  const [customers, setCustomers] = useState<Customer[]>([]);
  // Only to spell a window line out on the job sheet. Prices on the line are the ones already saved.
  const [windowRates, setWindowRates] = useState<WindowRates>(() => mergeWindowRates(null));
  const [customerProducts, setCustomerProducts] = useState<CustomerProduct[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [archivedAt, setArchivedAt] = useState<string | null>(null);
  const [orderForm, setOrderForm] = useState<OrderFormState>({
    id: null,
    customerId: '',
    poNumber: '',
    receivedDate: todayISODate(),
    requiredDate: '',
    status: 'open',
    notes: '',
  });

  const [lineDrafts, setLineDrafts] = useState<LineDraft[]>([createLineDraft()]);
  // Line ids loaded from the database. A save updates these in place rather than replacing them,
  // so anything that points at a line (a job sheet, a delivery) keeps pointing at it.
  const [loadedLineIds, setLoadedLineIds] = useState<string[]>([]);
  const [activeLineId, setActiveLineId] = useState<string>(lineDrafts[0].localId);

  const canEditOrders = role !== 'readonly';

  const activeCustomers = useMemo(() => customers.filter((customer) => customer.is_active !== false), [customers]);

  const customerConfigsForForm = useMemo(() => customerProducts.filter((config) => config.customer_id === orderForm.customerId), [customerProducts, orderForm.customerId]);

  const activeLine = useMemo(() => lineDrafts.find((line) => line.localId === activeLineId) || null, [lineDrafts, activeLineId]);

  const orderTotal = useMemo(() => {
    return lineDrafts.reduce((sum, line) => sum + line.quantityOrdered * line.unitPriceAtOrder, 0);
  }, [lineDrafts]);

  async function loadBaseData() {
    setSchemaError(null);

    const db = createClient();
    const [customerRes, customerProductRes] = await Promise.all([db.from(TABLE_CUSTOMERS).select('*').order('name', { ascending: true }), db.from(TABLE_CUSTOMER_PRODUCTS).select('*')]);

    if (customerRes.error) {
      throw customerRes.error;
    }

    if (customerProductRes.error) {
      throw customerProductRes.error;
    }

    const loadedCustomers = (customerRes.data as Customer[]) || [];
    const loadedCustomerProducts = (customerProductRes.data as CustomerProduct[]) || [];

    setCustomers(loadedCustomers);
    setCustomerProducts(loadedCustomerProducts);
    setWindowRates((await loadWindowRates()).rates);

    return {
      customers: loadedCustomers,
      customerProducts: loadedCustomerProducts,
    };
  }

  async function loadOrderForEdit(orderId: string) {
    const db = createClient();

    const { data: orderData, error: orderError } = await db.from(TABLE_PURCHASE_ORDERS).select('*').eq('id', orderId).single();
    if (orderError) {
      throw orderError;
    }

    const { data: lineData, error: lineError } = await db.from(TABLE_PURCHASE_ORDER_LINES).select('*').eq('purchase_order_id', orderId);
    if (lineError) {
      throw lineError;
    }

    const order = orderData as PurchaseOrder;
    const lines = (lineData as PurchaseOrderLine[]) || [];

    setOrderForm({
      id: order.id,
      customerId: order.customer_id,
      poNumber: order.po_number,
      receivedDate: order.received_date || todayISODate(),
      requiredDate: order.required_date || '',
      status: order.status,
      notes: order.notes || '',
    });
    setArchivedAt(order.archived_at || null);

    const mappedLines = lines.map((line) => {
      const parsedNotes = parseLineNotes(line.line_notes);

      return createLineDraft({
        localId: line.id || `line-${Math.random().toString(36).slice(2, 9)}`,
        id: line.id,
        quantityOrdered: Number(line.quantity_ordered) || 1,
        quantityFulfilled: Number(line.quantity_fulfilled) || 0,
        unitPriceAtOrder: Number(line.unit_price_at_order) || 0,
        lineNote: normalizeLineNote(parsedNotes, line.line_notes),
        pricingSource: parsedNotes.pricingSource || 'existing_config',
        customerProductId: parsedNotes.customerProductId || '',
        adhocSpec: parsedNotes.adhocSpecification || { ...defaultAdhocSpec },
        windowSpec: parsedNotes.windowSpecification || null,
        windowRatesUpdatedAt: parsedNotes.windowRatesUpdatedAt || null,
        markupPercent: parsedNotes.markupPercent ?? 20,
      });
    });

    setLoadedLineIds(lines.map((line) => line.id).filter(Boolean) as string[]);

    if (mappedLines.length) {
      setLineDrafts(mappedLines);
      setActiveLineId(mappedLines[0].localId);
    } else {
      const defaultLine = createLineDraft();
      setLineDrafts([defaultLine]);
      setActiveLineId(defaultLine.localId);
    }

    setIsEditingOrder(true);
  }

  useEffect(() => {

    (async () => {
      setIsLoading(true);
      setFormError(null);

      try {
        const user = await fetchCurrentSessionUser();
        if (!user) {
          router.push('/login');
          return;
        }

        setRole(user.effectiveRole as UserRole);
        const { customers: loadedCustomers } = await loadBaseData();

        const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const editOrderId = searchParams?.get('orderId');
        if (editOrderId) {
          await loadOrderForEdit(editOrderId);
        } else if (searchParams?.get('fromQuote') === '1') {
          const quoteDraft = consumeQuoteToOrderDraft();
          if (quoteDraft) {
            applyQuoteDraft(quoteDraft, loadedCustomers);
          }

          if (typeof window !== 'undefined') {
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.delete('fromQuote');
            window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
          }
        }
      } catch (error: any) {
        setSchemaError(error?.message || 'Unable to load order management data.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!lineDrafts.length) {
      const fallback = createLineDraft();
      setLineDrafts([fallback]);
      setActiveLineId(fallback.localId);
      return;
    }

    if (!lineDrafts.some((line) => line.localId === activeLineId)) {
      setActiveLineId(lineDrafts[0].localId);
    }
  }, [lineDrafts, activeLineId]);

  function resetOrderForm() {
    const defaultLine = createLineDraft();

    setOrderForm({
      id: null,
      customerId: '',
      poNumber: '',
      receivedDate: todayISODate(),
      requiredDate: '',
      status: 'open',
      notes: '',
    });
    setLineDrafts([defaultLine]);
    setActiveLineId(defaultLine.localId);
    setIsEditingOrder(false);
    setArchivedAt(null);
    setFormError(null);
  }

  function addLineDraft(pricingSource: PricingSource) {
    const next = createLineDraft({ pricingSource });
    setLineDrafts((prev) => [...prev, next]);
    setActiveLineId(next.localId);
  }

  function removeLineDraft(localId: string) {
    setLineDrafts((prev) => {
      if (prev.length === 1) {
        return prev;
      }
      return prev.filter((line) => line.localId !== localId);
    });
  }

  function updateLineDraft(localId: string, updater: (line: LineDraft) => LineDraft) {
    setLineDrafts((prev) => prev.map((line) => (line.localId === localId ? updater(line) : line)));
  }

  function getLineCost(line: LineDraft): { breakdown: CostBreakdown | null; recommendedUnitPrice: number; error: string | null } {
    try {
      const breakdown = calculateCost(line.adhocSpec, pricingData);
      const recommendedUnitPrice = breakdown.total * (1 + line.markupPercent / 100);
      return {
        breakdown,
        recommendedUnitPrice,
        error: null,
      };
    } catch (error: any) {
      return {
        breakdown: null,
        recommendedUnitPrice: 0,
        error: error?.message || 'Unable to calculate ad hoc price.',
      };
    }
  }

  function applyQuoteDraft(quoteDraft: QuoteToOrderDraft, availableCustomers: Customer[]) {
    const normalizedQuoteCustomer = normalizeCustomerLookupName(quoteDraft.customerName);
    const matchedCustomers = normalizedQuoteCustomer
      ? availableCustomers.filter((customer) => customer.is_active !== false && normalizeCustomerLookupName(customer.name) === normalizedQuoteCustomer)
      : [];
    const matchedCustomerId = matchedCustomers.length === 1 ? matchedCustomers[0].id : '';

    // A window quote carries one line per costed window; a glass quote carries a single line.
    const draftLines =
      quoteDraft.kind === 'window'
        ? quoteDraft.windowLines.map((line) =>
            createLineDraft({
              pricingSource: 'window_calculator',
              quantityOrdered: line.quantity,
              unitPriceAtOrder: line.unitPrice,
              lineNote: buildWindowLineDescription(quoteDraft.quoteName, line),
              windowSpec: line.windowSpec,
              windowRatesUpdatedAt: line.ratesUpdatedAt,
            })
          )
        : [
            createLineDraft({
              pricingSource: 'adhoc_calculator',
              quantityOrdered: quoteDraft.quantity,
              unitPriceAtOrder: quoteDraft.unitPrice,
              lineNote: buildQuoteDraftLineDescription(quoteDraft),
              adhocSpec: quoteDraft.spec ? { ...quoteDraft.spec } : { ...defaultAdhocSpec },
              markupPercent: quoteDraft.markupPercent,
            }),
          ];

    if (!draftLines.length) {
      return;
    }

    const draftNotes = [
      quoteDraft.quoteNotes.trim(),
      quoteDraft.customerName.trim() && !matchedCustomerId ? `Calculator customer: ${quoteDraft.customerName.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    setOrderForm((prev) => ({
      ...prev,
      customerId: matchedCustomerId,
      receivedDate: quoteDraft.quoteDate || prev.receivedDate,
      notes: draftNotes,
    }));
    setLineDrafts(draftLines);
    setActiveLineId(draftLines[0].localId);
  }

  function applyCustomerConfig(lineId: string, customerProductId: string) {
    const config = customerProducts.find((entry) => entry.id === customerProductId);
    if (!config) {
      return;
    }

    const parsedNotes = parseCustomerProductNotes(config.notes);

    const unitPriceFromRecord = Number((config as any).negotiated_price || (config as any).unit_price || 0);
    const unitPriceFromNotes = parsedNotes.unitPrice || 0;
    const unitPrice = unitPriceFromNotes || unitPriceFromRecord || 0;

    updateLineDraft(lineId, (line) => {
      return {
        ...line,
        customerProductId,
        quantityOrdered: config.default_qty || line.quantityOrdered || 1,
        unitPriceAtOrder: unitPrice,
        pricingSource: 'existing_config',
        adhocSpec: parsedNotes.savedSpecification || line.adhocSpec,
      };
    });
  }

  async function handleSaveOrder() {
    if (!canEditOrders) {
      return;
    }

    setFormError(null);

    if (!orderForm.customerId) {
      setFormError('Select a customer before saving the purchase order.');
      return;
    }

    if (!orderForm.poNumber.trim()) {
      setFormError('PO number is required.');
      return;
    }

    if (lineDrafts.length === 0) {
      setFormError('At least one line item is required.');
      return;
    }

    for (const line of lineDrafts) {
      if (line.pricingSource === 'existing_config' && !line.customerProductId) {
        setFormError('Each product line must select a product.');
        return;
      }

      if ((line.pricingSource === 'adhoc_calculator' || line.pricingSource === 'window_calculator') && !line.lineNote.trim()) {
        setFormError('Each ad hoc or window costing line needs a description.');
        return;
      }
    }

    // A line at nothing gets made, delivered and invoiced short, and no screen ever says so.
    const freeLines = lineDrafts.filter((line) => !(Number(line.unitPriceAtOrder) > 0));
    if (freeLines.length && !window.confirm(`${freeLines.length} line${freeLines.length === 1 ? ' has' : 's have'} no price. Saved like this the order is short by whatever ${freeLines.length === 1 ? 'it is' : 'they are'} worth. Save anyway?`)) {
      return;
    }

    setIsSaving(true);

    try {
      const db = createClient();

      const orderPayload = {
        customer_id: orderForm.customerId,
        po_number: orderForm.poNumber.trim(),
        received_date: orderForm.receivedDate,
        required_date: orderForm.requiredDate || null,
        status: orderForm.status,
        notes: orderForm.notes || null,
        updated_at: new Date().toISOString(),
      };

      let orderId = orderForm.id;

      if (isEditingOrder && orderForm.id) {
        const { error } = await db.from(TABLE_PURCHASE_ORDERS).update(orderPayload).eq('id', orderForm.id);
        if (error) throw error;

        // Only the lines the user actually removed are deleted. The rest keep their ids.
        const keptIds = new Set(lineDrafts.map((line) => line.id).filter(Boolean) as string[]);
        for (const removedId of loadedLineIds.filter((id) => !keptIds.has(id))) {
          const { error: deleteLineError } = await db.from(TABLE_PURCHASE_ORDER_LINES).delete().eq('id', removedId);
          if (deleteLineError) throw deleteLineError;
        }
      } else {
        const { data, error } = await db
          .from(TABLE_PURCHASE_ORDERS)
          .insert({
            ...orderPayload,
            status: 'open',
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;

        orderId = data.id;
      }

      if (!orderId) {
        throw new Error('Purchase order ID was not returned after save.');
      }

      const buildLinePayload = (line: LineDraft) => {
        const selectedCustomerProduct = customerProducts.find((entry) => entry.id === line.customerProductId);
        const selectedLabel = selectedCustomerProduct?.name || selectedCustomerProduct?.customer_part_ref || 'Customer Product';
        const isAdhoc = line.pricingSource === 'adhoc_calculator';
        const isWindow = line.pricingSource === 'window_calculator';

        return {
          purchase_order_id: orderId,
          product_id: isAdhoc || isWindow ? null : selectedCustomerProduct?.product_id || null,
          quantity_ordered: Math.max(1, Number(line.quantityOrdered) || 1),
          quantity_fulfilled: Math.max(0, Number(line.quantityFulfilled) || 0),
          unit_price_at_order: Number(line.unitPriceAtOrder) || 0,
          line_notes: serializeLineNotes({
            note: line.lineNote,
            pricingSource: line.pricingSource,
            customerProductId: line.customerProductId || null,
            adhocSpecification: isAdhoc ? line.adhocSpec : null,
            windowSpecification: isWindow ? line.windowSpec : null,
            windowRatesUpdatedAt: isWindow ? line.windowRatesUpdatedAt : null,
            markupPercent: isAdhoc ? line.markupPercent : null,
            productLabel: isAdhoc ? line.lineNote.trim() || 'Ad Hoc Item' : isWindow ? line.lineNote.trim() || 'Window Costing Item' : selectedLabel,
          }),
        };
      };

      const existingLines = lineDrafts.filter((line) => line.id && loadedLineIds.includes(line.id));
      const newLines = lineDrafts.filter((line) => !line.id || !loadedLineIds.includes(line.id));

      for (const line of existingLines) {
        const { error: updateLineError } = await db.from(TABLE_PURCHASE_ORDER_LINES).update(buildLinePayload(line)).eq('id', line.id as string);
        if (updateLineError) throw updateLineError;
      }

      if (newLines.length) {
        const { error: insertLineError } = await db.from(TABLE_PURCHASE_ORDER_LINES).insert(newLines.map(buildLinePayload));
        if (insertLineError) throw insertLineError;
      }

      router.push(`/glass?orderId=${orderId}`);
      router.refresh();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to save purchase order.');
    } finally {
      setIsSaving(false);
    }
  }

  async function updateOrderLifecycle(partial: { status?: OrderStatus; archivedAt?: string | null }) {
    if (!canEditOrders || !isEditingOrder || !orderForm.id) {
      return;
    }

    setFormError(null);

    try {
      const db = createClient();
      const payload: Record<string, string | null> = {
        updated_at: new Date().toISOString(),
      };

      if (partial.status) {
        payload.status = partial.status;
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'archivedAt')) {
        payload.archived_at = partial.archivedAt ?? null;
      }

      const { error } = await db.from(TABLE_PURCHASE_ORDERS).update(payload).eq('id', orderForm.id);
      if (error) {
        throw error;
      }

      if (partial.status) {
        setOrderForm((prev) => ({ ...prev, status: partial.status as OrderStatus }));
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'archivedAt')) {
        setArchivedAt(partial.archivedAt ?? null);
      }
    } catch (error: any) {
      setFormError(error?.message || 'Failed to update order status.');
    }
  }

  function printJobSheet() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  const customerProductSpec = (product?: CustomerProduct) => {
    const spec = product ? parseCustomerProductNotes(product.notes).savedSpecification : null;
    return spec ? describeGlassSpecification(spec) : '';
  };

  const lineSummaries = lineDrafts.map((line, index) => {
    const selectedCustomerProduct = customerProducts.find((entry) => entry.id === line.customerProductId);
    const isAdhoc = line.pricingSource === 'adhoc_calculator';
    const isWindow = line.pricingSource === 'window_calculator';

    return {
      id: line.localId,
      index: index + 1,
      type: isWindow ? 'Window Costing' : isAdhoc ? 'Ad Hoc' : 'Customer Product',
      item: isWindow ? line.lineNote || 'Window costing item' : isAdhoc ? line.lineNote || 'Ad hoc item' : selectedCustomerProduct?.name || selectedCustomerProduct?.customer_part_ref || 'Select product...',
      qty: line.quantityOrdered,
      unitPrice: line.unitPriceAtOrder,
      total: line.quantityOrdered * line.unitPriceAtOrder,
      // What the floor has to make. Without it the job sheet says "Ad hoc item" and nothing else.
      spec: isWindow && line.windowSpec
        ? describeWindow(line.windowSpec, windowRates, productFullName(line.windowSpec.productId ?? null))
        : isAdhoc && line.adhocSpec
          ? describeGlassSpecification(line.adhocSpec)
          : customerProductSpec(selectedCustomerProduct),
      note: line.lineNote,
    };
  });

  const activeLineCost = activeLine ? getLineCost(activeLine) : null;

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navigationItems={navigationItems}
      navLabel={isEditingOrder ? 'EDIT ORDER' : 'NEW ORDER'}
      navRight={<ActionButton onClick={() => router.push('/glass')}>BACK TO DASHBOARD</ActionButton>}
      heading={isEditingOrder ? 'EDIT PURCHASE ORDER' : 'CREATE PURCHASE ORDER'}
      badge={isEditingOrder ? 'EDIT MODE' : 'NEW ORDER'}
      sidebarWidthCh={44}
      sidebarMobileOrder="bottom"
      sidebar={
        <Card title="SAVE ORDER">
          <RowSpaceBetween>
            <Text>ORDER TOTAL</Text>
            <Text>{formatCurrency(orderTotal)}</Text>
          </RowSpaceBetween>
          {isEditingOrder && (
            <>
              <br />
              <RowSpaceBetween>
                <Text>ORDER STATUS</Text>
                <Text>
                  <span className={orderForm.status === 'cancelled' ? 'status-pill status-pill-error' : 'status-pill status-pill-warning'}>{statusLabel(orderForm.status)}</span>
                  {archivedAt ? <span className="status-pill status-pill-warning">ARCHIVED</span> : null}
                </Text>
              </RowSpaceBetween>
              <br />
              <RowSpaceBetween>
                <ActionButton onClick={() => updateOrderLifecycle({ status: 'cancelled' })}>Cancel Order</ActionButton>
                <ActionButton onClick={() => updateOrderLifecycle({ archivedAt: archivedAt ? null : new Date().toISOString() })}>{archivedAt ? 'Unarchive Order' : 'Archive Order'}</ActionButton>
              </RowSpaceBetween>
            </>
          )}
          <br />
          <RowSpaceBetween>
            <ActionButton onClick={handleSaveOrder}>{isSaving ? 'Saving...' : isEditingOrder ? 'Update Purchase Order' : 'Save Purchase Order'}</ActionButton>
            <ActionButton onClick={() => router.push('/glass')}>Cancel</ActionButton>
          </RowSpaceBetween>
          {isEditingOrder ? (
            <>
              <br />
              <ActionButton onClick={printJobSheet}>Print Job Sheet</ActionButton>
              <Text>What to make, for the floor. No prices on it.</Text>
            </>
          ) : null}
        </Card>
      }
      actionItems={[
        {
          hotkey: '⌘+S',
          body: isSaving ? 'Saving...' : 'Save Order',
          onClick: handleSaveOrder,
        },
        {
          hotkey: '⌘+N',
          body: 'Add Product Line',
          onClick: () => addLineDraft('existing_config'),
        },
        {
          hotkey: '⌘+A',
          body: 'Add Ad Hoc Line',
          onClick: () => addLineDraft('adhoc_calculator'),
        },
        {
          hotkey: '⌘+B',
          body: 'Back',
          onClick: () => router.push('/glass'),
        },
      ]}
    >
      {!canEditOrders && (
        <Card title="READ ONLY">
          <Text>You have read-only access. New order creation is disabled.</Text>
        </Card>
      )}

      {schemaError && (
        <Card title="DATABASE ERROR">
          <Text>
            <span className="status-error">{schemaError}</span>
          </Text>
          <br />
          <Text>
            <span className="status-warning">Run `docs/order-management-schema.sql` on your AWS PostgreSQL database, then reload.</span>
          </Text>
        </Card>
      )}

      {formError && (
        <Card title="ORDER ERROR">
          <Text>
            <span className="status-error">{formError}</span>
          </Text>
        </Card>
      )}

      <CardDouble title="PO HEADER">
        <Text>CUSTOMER</Text>
        <select
          value={orderForm.customerId}
          disabled={!canEditOrders || isLoading}
          onChange={(event) => {
            const nextCustomerId = event.target.value;
            setOrderForm((prev) => ({ ...prev, customerId: nextCustomerId }));

            setLineDrafts((prev) =>
              prev.map((line) => ({
                ...line,
                customerProductId: line.pricingSource === 'existing_config' ? '' : line.customerProductId,
              }))
            );
          }}
        >
          <option value="">Select customer...</option>
          {activeCustomers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
        <br />

        <Input label="PO NUMBER" name="po_number" value={orderForm.poNumber} onChange={(event) => setOrderForm((prev) => ({ ...prev, poNumber: event.target.value }))} disabled={!canEditOrders || isLoading} />
        <Input label="RECEIVED DATE" type="date" name="received_date" value={orderForm.receivedDate} onChange={(event) => setOrderForm((prev) => ({ ...prev, receivedDate: event.target.value }))} disabled={!canEditOrders || isLoading} />
        <Input label="REQUIRED DATE" type="date" name="required_date" value={orderForm.requiredDate} onChange={(event) => setOrderForm((prev) => ({ ...prev, requiredDate: event.target.value }))} disabled={!canEditOrders || isLoading} />

        <Text>STATUS</Text>
        <select value={orderForm.status} disabled={!canEditOrders || isLoading} onChange={(event) => setOrderForm((prev) => ({ ...prev, status: event.target.value as OrderStatus }))}>
          {ORDER_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
        <br />

        <Input label="ORDER NOTES" name="order_notes" value={orderForm.notes} onChange={(event) => setOrderForm((prev) => ({ ...prev, notes: event.target.value }))} disabled={!canEditOrders || isLoading} />
      </CardDouble>

      <Card title="LINE ITEMS OVERVIEW">
        <RowSpaceBetween>
          <Text>LINES</Text>
          <Text>{lineDrafts.length}</Text>
        </RowSpaceBetween>
        <br />

        <RowSpaceBetween>
          <ActionButton onClick={() => addLineDraft('existing_config')}>+ PRODUCT LINE</ActionButton>
          <ActionButton onClick={() => addLineDraft('adhoc_calculator')}>+ AD HOC LINE</ActionButton>
        </RowSpaceBetween>

        <br />
        <Table>
          <TableRow>
            <TableColumn style={{ width: '8ch' }}>LINE</TableColumn>
            <TableColumn style={{ width: '18ch' }}>TYPE</TableColumn>
            <TableColumn style={{ width: '24ch' }}>ITEM</TableColumn>
            <TableColumn style={{ width: '10ch' }}>QTY</TableColumn>
            <TableColumn style={{ width: '14ch' }}>UNIT</TableColumn>
            <TableColumn style={{ width: '14ch' }}>TOTAL</TableColumn>
            <TableColumn>ACTIONS</TableColumn>
          </TableRow>

          {lineSummaries.map((summary) => (
            <TableRow key={summary.id}>
              <TableColumn onClick={() => setActiveLineId(summary.id)}>
                {summary.index} {summary.id === activeLineId ? '◉' : '◌'}
              </TableColumn>
              <TableColumn onClick={() => setActiveLineId(summary.id)}>{summary.type}</TableColumn>
              <TableColumn onClick={() => setActiveLineId(summary.id)}>{summary.item}</TableColumn>
              <TableColumn onClick={() => setActiveLineId(summary.id)}>{summary.qty}</TableColumn>
              <TableColumn onClick={() => setActiveLineId(summary.id)}>{formatCurrency(summary.unitPrice)}</TableColumn>
              <TableColumn onClick={() => setActiveLineId(summary.id)}>{formatCurrency(summary.total)}</TableColumn>
              <TableColumn>
                <RowSpaceBetween>
                  <ActionButton onClick={() => setActiveLineId(summary.id)}>Edit</ActionButton>
                  <ActionButton onClick={() => removeLineDraft(summary.id)}>Remove</ActionButton>
                </RowSpaceBetween>
              </TableColumn>
            </TableRow>
          ))}
        </Table>

        <br />
        <RowSpaceBetween>
          <Text>ORDER TOTAL</Text>
          <Text>{formatCurrency(orderTotal)}</Text>
        </RowSpaceBetween>
      </Card>

      <CardDouble title={activeLine ? `LINE EDITOR — LINE ${lineSummaries.find((line) => line.id === activeLine.localId)?.index || ''}` : 'LINE EDITOR'}>
        {!activeLine ? (
          <Text>Select a line above to edit.</Text>
        ) : (
          <>
            <Text>LINE TYPE</Text>
            <select
              value={activeLine.pricingSource}
              disabled={!canEditOrders}
              onChange={(event) => {
                const nextSource = event.target.value as PricingSource;
                updateLineDraft(activeLine.localId, (current) => ({
                  ...current,
                  pricingSource: nextSource,
                  customerProductId: nextSource === 'existing_config' ? current.customerProductId : '',
                }));
              }}
            >
              <option value="existing_config">Customer Product</option>
              <option value="adhoc_calculator">Ad Hoc</option>
              <option value="window_calculator">Window Costing</option>
            </select>
            <br />

            {activeLine.pricingSource === 'existing_config' && (
              <>
                <Text>PRODUCT</Text>
                <select value={activeLine.customerProductId} disabled={!canEditOrders} onChange={(event) => applyCustomerConfig(activeLine.localId, event.target.value)}>
                  <option value="">Select product...</option>
                  {customerConfigsForForm.map((config) => {
                    const parsedNotes = parseCustomerProductNotes(config.notes);
                    const price = parsedNotes.unitPrice || Number((config as any).negotiated_price || (config as any).unit_price || 0);
                    const configLabel = config.name || config.customer_part_ref || 'Unnamed product';

                    return (
                      <option key={config.id} value={config.id}>
                        {configLabel} ({formatCurrency(price)})
                      </option>
                    );
                  })}
                </select>
                <br />
              </>
            )}

            <Input
              label="QUANTITY ORDERED"
              type="number"
              name={`quantity_ordered_${activeLine.localId}`}
              value={String(activeLine.quantityOrdered)}
              onChange={(event) =>
                updateLineDraft(activeLine.localId, (current) => ({
                  ...current,
                  quantityOrdered: Math.max(1, numberOrFallback(event.target.value, 1)),
                }))
              }
              disabled={!canEditOrders}
            />

            <Input
              label="UNIT PRICE AT ORDER ($)"
              type="number"
              name={`unit_price_${activeLine.localId}`}
              value={String(activeLine.unitPriceAtOrder)}
              onChange={(event) =>
                updateLineDraft(activeLine.localId, (current) => ({
                  ...current,
                  unitPriceAtOrder: Math.max(0, numberOrFallback(event.target.value, 0)),
                }))
              }
              disabled={!canEditOrders}
            />

            {activeLine.pricingSource === 'adhoc_calculator' && (
              <>
                <br />
                <Text>AD HOC CALCULATOR</Text>
                <br />

                <Text>CAD FILE</Text>
                <CadImportPanel
                  key={activeLine.localId}
                  spec={activeLine.adhocSpec}
                  disabled={!canEditOrders}
                  onApply={(result) => updateLineDraft(activeLine.localId, (current) => ({ ...current, adhocSpec: result.spec }))}
                  onClear={() =>
                    updateLineDraft(activeLine.localId, (current) => ({
                      ...current,
                      adhocSpec: { ...current.adhocSpec, cadOutline: null },
                    }))
                  }
                />
                <br />

                <Text>GLASS THICKNESS (MM)</Text>
                <select
                  value={String(activeLine.adhocSpec.thickness)}
                  disabled={!canEditOrders}
                  onChange={(event) => {
                    const nextThickness = Number(event.target.value) as GlassSpecification['thickness'];
                    updateLineDraft(activeLine.localId, (current) => {
                      const nextAvailableTypes = getAvailableGlassTypes(nextThickness);
                      const currentType = nextAvailableTypes.includes(current.adhocSpec.glassType) ? current.adhocSpec.glassType : nextAvailableTypes[0];

                      return {
                        ...current,
                        adhocSpec: {
                          ...current.adhocSpec,
                          thickness: nextThickness,
                          glassType: currentType,
                        },
                      };
                    });
                  }}
                >
                  {getAvailableThicknesses(activeLine.adhocSpec.glassType, pricingData.basePrices).map((thickness) => (
                    <option key={thickness} value={thickness}>
                      {thickness}
                    </option>
                  ))}
                </select>
                <br />

                <Text>GLASS TYPE</Text>
                <select
                  value={activeLine.adhocSpec.glassType}
                  disabled={!canEditOrders}
                  onChange={(event) =>
                    updateLineDraft(activeLine.localId, (current) => ({
                      ...current,
                      adhocSpec: {
                        ...current.adhocSpec,
                        glassType: event.target.value as GlassSpecification['glassType'],
                      },
                    }))
                  }
                >
                  {getAvailableGlassTypes(activeLine.adhocSpec.thickness).map((glassType) => (
                    <option key={glassType} value={glassType}>
                      {glassType}
                    </option>
                  ))}
                </select>
                <br />

                <Text>DIMENSIONS</Text>
                <Input
                  label="HEIGHT (MM)"
                  type="number"
                  name={`height_${activeLine.localId}`}
                  value={String(activeLine.adhocSpec.height)}
                  onChange={(event) =>
                    updateLineDraft(activeLine.localId, (current) => ({
                      ...current,
                      adhocSpec: {
                        ...current.adhocSpec,
                        height: Math.max(0, numberOrFallback(event.target.value, 0)),
                      },
                    }))
                  }
                  disabled={!canEditOrders}
                />
                <Input
                  label="WIDTH (MM)"
                  type="number"
                  name={`width_${activeLine.localId}`}
                  value={String(activeLine.adhocSpec.width)}
                  onChange={(event) =>
                    updateLineDraft(activeLine.localId, (current) => ({
                      ...current,
                      adhocSpec: {
                        ...current.adhocSpec,
                        width: Math.max(0, numberOrFallback(event.target.value, 0)),
                      },
                    }))
                  }
                  disabled={!canEditOrders}
                />

                <Text>PRICING</Text>
                <Input
                  label="MARKUP (%)"
                  type="number"
                  name={`markup_${activeLine.localId}`}
                  value={String(activeLine.markupPercent)}
                  onChange={(event) =>
                    updateLineDraft(activeLine.localId, (current) => ({
                      ...current,
                      markupPercent: Math.max(0, numberOrFallback(event.target.value, 0)),
                    }))
                  }
                  disabled={!canEditOrders}
                />
                <br />

                <Text>EDGEWORK</Text>
                <select
                  value={activeLine.adhocSpec.edgework}
                  disabled={!canEditOrders}
                  onChange={(event) =>
                    updateLineDraft(activeLine.localId, (current) => ({
                      ...current,
                      adhocSpec: {
                        ...current.adhocSpec,
                        edgework: event.target.value as GlassSpecification['edgework'],
                      },
                    }))
                  }
                >
                  {EDGEWORK_OPTIONS.map((edgework) => (
                    <option key={edgework} value={edgework}>
                      {edgework}
                    </option>
                  ))}
                </select>
                <br />

                <Text>ADDITIONAL OPTIONS</Text>
                <label>
                  <input
                    type="checkbox"
                    checked={activeLine.adhocSpec.ceramicBand}
                    disabled={!canEditOrders}
                    onChange={(event) =>
                      updateLineDraft(activeLine.localId, (current) => ({
                        ...current,
                        adhocSpec: {
                          ...current.adhocSpec,
                          ceramicBand: event.target.checked,
                        },
                      }))
                    }
                  />{' '}
                  Ceramic Banding
                </label>
                <br />
                <label>
                  <input
                    type="checkbox"
                    checked={activeLine.adhocSpec.holes}
                    disabled={!canEditOrders}
                    onChange={(event) =>
                      updateLineDraft(activeLine.localId, (current) => ({
                        ...current,
                        adhocSpec: {
                          ...current.adhocSpec,
                          holes: event.target.checked,
                          numHoles: event.target.checked ? Math.max(1, current.adhocSpec.numHoles || 4) : 0,
                        },
                      }))
                    }
                  />{' '}
                  Include Holes
                </label>
                <br />
                <label>
                  <input
                    type="checkbox"
                    checked={activeLine.adhocSpec.scanning}
                    disabled={!canEditOrders}
                    onChange={(event) =>
                      updateLineDraft(activeLine.localId, (current) => ({
                        ...current,
                        adhocSpec: {
                          ...current.adhocSpec,
                          scanning: event.target.checked,
                        },
                      }))
                    }
                  />{' '}
                  Scanning
                </label>
                <br />
                <label>
                  <input
                    type="checkbox"
                    checked={activeLine.adhocSpec.radiusCorners}
                    disabled={!canEditOrders}
                    onChange={(event) =>
                      updateLineDraft(activeLine.localId, (current) => ({
                        ...current,
                        adhocSpec: {
                          ...current.adhocSpec,
                          radiusCorners: event.target.checked,
                        },
                      }))
                    }
                  />{' '}
                  Radius Corners
                </label>

                <Input
                  label="NUMBER OF HOLES"
                  type="number"
                  name={`num_holes_${activeLine.localId}`}
                  value={String(activeLine.adhocSpec.numHoles)}
                  onChange={(event) =>
                    updateLineDraft(activeLine.localId, (current) => ({
                      ...current,
                      adhocSpec: {
                        ...current.adhocSpec,
                        numHoles: Math.max(0, numberOrFallback(event.target.value, 0)),
                      },
                    }))
                  }
                  disabled={!canEditOrders || !activeLine.adhocSpec.holes}
                />

                <Text>SHAPE TYPE</Text>
                <select
                  value={activeLine.adhocSpec.shape}
                  disabled={!canEditOrders}
                  onChange={(event) =>
                    updateLineDraft(activeLine.localId, (current) => ({
                      ...current,
                      adhocSpec: {
                        ...current.adhocSpec,
                        shape: event.target.value as GlassSpecification['shape'],
                      },
                    }))
                  }
                >
                  <option value="RECTANGLE">Rectangle</option>
                  <option value="TRIANGLE">Triangle</option>
                  <option value="SIMPLE">Simple Shape</option>
                  <option value="COMPLEX">Complex Shape</option>
                </select>

                <br />
                <Card title="PRICE BREAKDOWN">
                  {activeLineCost?.error ? (
                    <Text>
                      <span className="status-error">{activeLineCost.error}</span>
                    </Text>
                  ) : (
                    <>
                      <Table>
                        <TableRow>
                          <TableColumn style={{ width: '20ch' }}>COMPONENT</TableColumn>
                          <TableColumn>COST</TableColumn>
                        </TableRow>
                        <TableRow>
                          <TableColumn>Base Glass</TableColumn>
                          <TableColumn>${(activeLineCost?.breakdown?.baseGlass || 0).toFixed(2)}</TableColumn>
                        </TableRow>
                        <TableRow>
                          <TableColumn>Edgework</TableColumn>
                          <TableColumn>${(activeLineCost?.breakdown?.edgework || 0).toFixed(2)}</TableColumn>
                        </TableRow>
                        <TableRow>
                          <TableColumn>Holes</TableColumn>
                          <TableColumn>${(activeLineCost?.breakdown?.holes || 0).toFixed(2)}</TableColumn>
                        </TableRow>
                        <TableRow>
                          <TableColumn>Shape</TableColumn>
                          <TableColumn>${(activeLineCost?.breakdown?.shape || 0).toFixed(2)}</TableColumn>
                        </TableRow>
                        <TableRow>
                          <TableColumn>Ceramic</TableColumn>
                          <TableColumn>${(activeLineCost?.breakdown?.ceramic || 0).toFixed(2)}</TableColumn>
                        </TableRow>
                        <TableRow>
                          <TableColumn>Scanning</TableColumn>
                          <TableColumn>${(activeLineCost?.breakdown?.scanning || 0).toFixed(2)}</TableColumn>
                        </TableRow>
                        <TableRow>
                          <TableColumn>Subtotal</TableColumn>
                          <TableColumn>${(activeLineCost?.breakdown?.total || 0).toFixed(2)}</TableColumn>
                        </TableRow>
                        <TableRow>
                          <TableColumn>Markup ({activeLine.markupPercent}%)</TableColumn>
                          <TableColumn>${(((activeLineCost?.breakdown?.total || 0) * activeLine.markupPercent) / 100).toFixed(2)}</TableColumn>
                        </TableRow>
                        <TableRow>
                          <TableColumn>TOTAL</TableColumn>
                          <TableColumn>${(activeLineCost?.recommendedUnitPrice || 0).toFixed(2)}</TableColumn>
                        </TableRow>
                      </Table>

                      <br />
                      <ActionButton
                        onClick={() =>
                          updateLineDraft(activeLine.localId, (current) => ({
                            ...current,
                            unitPriceAtOrder: Number((activeLineCost?.recommendedUnitPrice || 0).toFixed(2)),
                          }))
                        }
                      >
                        Apply Calculator Price
                      </ActionButton>
                    </>
                  )}
                </Card>
              </>
            )}

            {activeLine.pricingSource === 'window_calculator' && (
              <>
                <br />
                <Text>WINDOW COSTING</Text>
                <Text>
                  {activeLine.windowSpec
                    ? 'Priced on the Window Costing page; the unit price above is the costing price.'
                    : 'No window costing attached. Price the window on the Window Costing page and create the order from there.'}
                </Text>
                {activeLine.windowRatesUpdatedAt ? <Text>Priced on the window rates saved {new Date(activeLine.windowRatesUpdatedAt).toLocaleString()}.</Text> : null}
                <ActionButton onClick={() => router.push('/glass/windows')}>Open Window Costing</ActionButton>
              </>
            )}

            <br />
            <Input
              label={activeLine.pricingSource === 'adhoc_calculator' ? 'AD HOC DESCRIPTION' : activeLine.pricingSource === 'window_calculator' ? 'WINDOW DESCRIPTION' : 'LINE NOTES'}
              name={`line_notes_${activeLine.localId}`}
              value={activeLine.lineNote}
              onChange={(event) => updateLineDraft(activeLine.localId, (current) => ({ ...current, lineNote: event.target.value }))}
              disabled={!canEditOrders}
            />

            <br />
            <RowSpaceBetween>
              <Text>LINE TOTAL</Text>
              <Text>{formatCurrency(activeLine.quantityOrdered * activeLine.unitPriceAtOrder)}</Text>
            </RowSpaceBetween>
          </>
        )}
      </CardDouble>
      {isEditingOrder ? (
        <JobSheet
          order={{
            po_number: orderForm.poNumber,
            received_date: orderForm.receivedDate,
            required_date: orderForm.requiredDate,
            status: orderForm.status,
            notes: orderForm.notes,
          }}
          customer={customers.find((entry) => entry.id === orderForm.customerId) || null}
          lines={lineSummaries.map((summary) => ({
            id: summary.id,
            index: summary.index,
            description: summary.item,
            quantity: summary.qty,
            // A window line's description is already the specification; only add what it does not say.
            notes: [summary.spec, summary.note].filter((part) => part && part !== summary.item).join(' — '),
          }))}
        />
      ) : null}
    </AppFrame>
  );
}
