'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionBar from '@components/ActionBar';
import ActionButton from '@components/ActionButton';
import Badge from '@components/Badge';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import DefaultLayout from '@components/page/DefaultLayout';
import DropdownMenuTrigger from '@components/DropdownMenuTrigger';
import Grid from '@components/Grid';
import Input from '@components/Input';
import Navigation from '@components/Navigation';
import Row from '@components/Row';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { defaultPricingData } from '@components/PricingProvider';
import { CostBreakdown, GlassSpecification, calculateCost, getAvailableGlassTypes } from '@utils/calculations';
import {
  Customer,
  CustomerProduct,
  ORDER_STATUS_OPTIONS,
  OrderStatus,
  ParsedLineNotes,
  PricingSource,
  Product,
  PurchaseOrder,
  PurchaseOrderLine,
  USER_ROLE_OPTIONS,
  UserRole,
  calculateLineTotal,
  calculateOrderTotal,
  formatCurrency,
  parseCustomerProductNotes,
  parseLineNotes,
  serializeLineNotes,
  statusLabel,
  todayISODate,
} from '@utils/order-management';
import { createClient } from '@utils/supabase/client';

const TABLE_CUSTOMERS = 'customers';
const TABLE_PRODUCTS = 'products';
const TABLE_CUSTOMER_PRODUCTS = 'customer_products';
const TABLE_PURCHASE_ORDERS = 'purchase_orders';
const TABLE_PURCHASE_ORDER_LINES = 'purchase_order_lines';

const navigationItems = [
  { icon: '⊹', children: 'Glass Costing', href: '/' },
  { icon: '⊹', children: 'Order Management', href: '/doors' },
  { icon: '⊹', children: 'Customers', href: '/doors/clients' },
  { icon: '⊹', children: 'Products', href: '/doors/templates' },
  { icon: '⊹', children: 'Pricing Settings', href: '/settings' },
];

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

interface PricingShape {
  basePrices: typeof defaultPricingData.basePrices;
  edgeworkPrices: typeof defaultPricingData.edgeworkPrices;
  otherPrices: typeof defaultPricingData.otherPrices;
}

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
  productId: string;
  quantityOrdered: number;
  quantityFulfilled: number;
  unitPriceAtOrder: number;
  lineNote: string;
  pricingSource: PricingSource;
  customerProductId: string;
  adhocSpec: GlassSpecification;
  markupPercent: number;
}

function createLineDraft(partial?: Partial<LineDraft>): LineDraft {
  return {
    localId: partial?.localId || `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    id: partial?.id,
    productId: partial?.productId || '',
    quantityOrdered: partial?.quantityOrdered ?? 1,
    quantityFulfilled: partial?.quantityFulfilled ?? 0,
    unitPriceAtOrder: partial?.unitPriceAtOrder ?? 0,
    lineNote: partial?.lineNote || '',
    pricingSource: partial?.pricingSource || 'existing_config',
    customerProductId: partial?.customerProductId || '',
    adhocSpec: partial?.adhocSpec || { ...defaultAdhocSpec },
    markupPercent: partial?.markupPercent ?? 20,
  };
}

function numberOrFallback(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function orderDateInRange(order: PurchaseOrder, dateFrom: string, dateTo: string): boolean {
  const orderDate = order.received_date || '';
  if (dateFrom && orderDate < dateFrom) {
    return false;
  }
  if (dateTo && orderDate > dateTo) {
    return false;
  }
  return true;
}

function parsePricingDataFromStorage(): PricingShape {
  if (typeof window === 'undefined') {
    return defaultPricingData;
  }

  const raw = localStorage.getItem('glassPricingData');
  if (!raw) {
    return defaultPricingData;
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      basePrices: parsed.basePrices || defaultPricingData.basePrices,
      edgeworkPrices: parsed.edgeworkPrices || defaultPricingData.edgeworkPrices,
      otherPrices: parsed.otherPrices || defaultPricingData.otherPrices,
    };
  } catch {
    return defaultPricingData;
  }
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

export default function OrderManagementPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('admin');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerProducts, setCustomerProducts] = useState<CustomerProduct[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [orderLines, setOrderLines] = useState<PurchaseOrderLine[]>([]);

  const [pricingData, setPricingData] = useState<PricingShape>(defaultPricingData);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [customerFilter, setCustomerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

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
  const [lineFulfillmentDrafts, setLineFulfillmentDrafts] = useState<Record<string, number>>({});

  const [isEditingOrder, setIsEditingOrder] = useState(false);

  const canEditOrders = role !== 'readonly';
  const canManageMasterData = role === 'admin';

  const customerMap = useMemo(() => {
    const map: Record<string, Customer> = {};
    customers.forEach((customer) => {
      map[customer.id] = customer;
    });
    return map;
  }, [customers]);

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    products.forEach((product) => {
      map[product.id] = product;
    });
    return map;
  }, [products]);

  const linesByOrder = useMemo(() => {
    const map: Record<string, PurchaseOrderLine[]> = {};
    orderLines.forEach((line) => {
      if (!map[line.purchase_order_id]) {
        map[line.purchase_order_id] = [];
      }
      map[line.purchase_order_id].push(line);
    });
    return map;
  }, [orderLines]);

  const activeCustomers = useMemo(() => customers.filter((customer) => customer.is_active !== false), [customers]);
  const activeProducts = useMemo(() => products.filter((product) => product.is_active !== false), [products]);

  const customerConfigsForForm = useMemo(() => customerProducts.filter((config) => config.customer_id === orderForm.customerId), [customerProducts, orderForm.customerId]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (customerFilter && order.customer_id !== customerFilter) {
        return false;
      }
      if (statusFilter && order.status !== statusFilter) {
        return false;
      }
      if (!orderDateInRange(order, dateFromFilter, dateToFilter)) {
        return false;
      }
      return true;
    });
  }, [orders, customerFilter, statusFilter, dateFromFilter, dateToFilter]);

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) || null, [orders, selectedOrderId]);

  const selectedOrderLines = useMemo(() => {
    if (!selectedOrder) {
      return [];
    }
    return linesByOrder[selectedOrder.id] || [];
  }, [selectedOrder, linesByOrder]);

  const openOrdersByCustomer = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((order) => {
      if (order.status !== 'open') {
        return;
      }
      counts[order.customer_id] = (counts[order.customer_id] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([customerId, count]) => ({
        customerId,
        count,
        name: customerMap[customerId]?.name || 'Unknown Customer',
      }));
  }, [orders, customerMap]);

  const dueInSevenDays = useMemo(() => {
    const today = todayISODate();
    const inSevenDays = new Date();
    inSevenDays.setDate(inSevenDays.getDate() + 7);
    const maxDate = inSevenDays.toISOString().split('T')[0];

    return orders.filter((order) => {
      const requiredDate = order.required_date || '';
      if (!requiredDate) {
        return false;
      }
      if (order.status === 'fulfilled' || order.status === 'cancelled') {
        return false;
      }
      return requiredDate >= today && requiredDate <= maxDate;
    });
  }, [orders]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => {
        const aDate = a.updated_at || a.created_at || a.received_date || '';
        const bDate = b.updated_at || b.created_at || b.received_date || '';
        return bDate.localeCompare(aDate);
      })
      .slice(0, 5);
  }, [orders]);

  async function loadData() {
    setIsLoading(true);
    setSchemaError(null);

    try {
      const supabase = createClient();
      const [customerRes, productRes, customerProductRes, orderRes, lineRes] = await Promise.all([
        supabase.from(TABLE_CUSTOMERS).select('*').order('name', { ascending: true }),
        supabase.from(TABLE_PRODUCTS).select('*').order('name', { ascending: true }),
        supabase.from(TABLE_CUSTOMER_PRODUCTS).select('*'),
        supabase.from(TABLE_PURCHASE_ORDERS).select('*').order('received_date', { ascending: false }),
        supabase.from(TABLE_PURCHASE_ORDER_LINES).select('*'),
      ]);

      if (customerRes.error) throw customerRes.error;
      if (productRes.error) throw productRes.error;
      if (customerProductRes.error) throw customerProductRes.error;
      if (orderRes.error) throw orderRes.error;
      if (lineRes.error) throw lineRes.error;

      setCustomers((customerRes.data as Customer[]) || []);
      setProducts((productRes.data as Product[]) || []);
      setCustomerProducts((customerProductRes.data as CustomerProduct[]) || []);
      setOrders((orderRes.data as PurchaseOrder[]) || []);
      setOrderLines((lineRes.data as PurchaseOrderLine[]) || []);
    } catch (error: any) {
      setSchemaError(error?.message || 'Unable to load order management tables.');
      setCustomers([]);
      setProducts([]);
      setCustomerProducts([]);
      setOrders([]);
      setOrderLines([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setPricingData(parsePricingDataFromStorage());

    if (typeof window !== 'undefined') {
      const savedRole = localStorage.getItem('orderManagementRole') as UserRole | null;
      if (savedRole && USER_ROLE_OPTIONS.includes(savedRole)) {
        setRole(savedRole);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    if (!selectedOrder) {
      setLineFulfillmentDrafts({});
      return;
    }

    const nextDrafts: Record<string, number> = {};
    selectedOrderLines.forEach((line) => {
      if (line.id) {
        nextDrafts[line.id] = line.quantity_fulfilled || 0;
      }
    });
    setLineFulfillmentDrafts(nextDrafts);
  }, [selectedOrder, selectedOrderLines]);

  function persistRole(nextRole: UserRole) {
    setRole(nextRole);
    if (typeof window !== 'undefined') {
      localStorage.setItem('orderManagementRole', nextRole);
    }
  }

  function resetOrderForm() {
    setOrderForm({
      id: null,
      customerId: '',
      poNumber: '',
      receivedDate: todayISODate(),
      requiredDate: '',
      status: 'open',
      notes: '',
    });
    setLineDrafts([createLineDraft()]);
    setIsEditingOrder(false);
    setFormError(null);
  }

  function addLineDraft() {
    setLineDrafts((prev) => [...prev, createLineDraft()]);
  }

  function removeLineDraft(localId: string) {
    setLineDrafts((prev) => (prev.length === 1 ? prev : prev.filter((line) => line.localId !== localId)));
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

  function applyCustomerConfig(lineId: string, customerProductId: string) {
    const config = customerProducts.find((entry) => entry.id === customerProductId);
    if (!config) {
      return;
    }

    const product = productMap[config.product_id];
    const parsedNotes = parseCustomerProductNotes(config.notes);

    const unitPriceFromRecord = Number((config as any).negotiated_price || (config as any).unit_price || 0);
    const unitPriceFromNotes = parsedNotes.unitPrice || 0;
    const unitPrice = unitPriceFromNotes || unitPriceFromRecord || Number(product?.unit_price || 0);

    updateLineDraft(lineId, (line) => {
      return {
        ...line,
        customerProductId,
        productId: config.product_id,
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
      if (!line.productId) {
        setFormError('Each line item must have a product selected.');
        return;
      }
    }

    setIsSaving(true);

    try {
      const supabase = createClient();

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
        const { error } = await supabase.from(TABLE_PURCHASE_ORDERS).update(orderPayload).eq('id', orderForm.id);
        if (error) throw error;

        const { error: deleteLinesError } = await supabase.from(TABLE_PURCHASE_ORDER_LINES).delete().eq('purchase_order_id', orderForm.id);
        if (deleteLinesError) throw deleteLinesError;
      } else {
        const { data, error } = await supabase
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

      const linePayload = lineDrafts.map((line) => ({
        purchase_order_id: orderId,
        product_id: line.productId,
        quantity_ordered: Math.max(1, Number(line.quantityOrdered) || 1),
        quantity_fulfilled: Math.max(0, Number(line.quantityFulfilled) || 0),
        unit_price_at_order: Number(line.unitPriceAtOrder) || 0,
        line_notes: serializeLineNotes({
          note: line.lineNote,
          pricingSource: line.pricingSource,
          customerProductId: line.customerProductId || null,
          adhocSpecification: line.pricingSource === 'adhoc_calculator' ? line.adhocSpec : null,
          markupPercent: line.pricingSource === 'adhoc_calculator' ? line.markupPercent : null,
          productLabel: productMap[line.productId]?.name || null,
        }),
      }));

      const { error: insertLineError } = await supabase.from(TABLE_PURCHASE_ORDER_LINES).insert(linePayload);
      if (insertLineError) throw insertLineError;

      await loadData();
      setSelectedOrderId(orderId);
      resetOrderForm();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to save purchase order.');
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingOrder(order: PurchaseOrder) {
    const existingLines = linesByOrder[order.id] || [];

    setOrderForm({
      id: order.id,
      customerId: order.customer_id,
      poNumber: order.po_number,
      receivedDate: order.received_date,
      requiredDate: order.required_date || '',
      status: order.status,
      notes: order.notes || '',
    });

    const mappedLines = existingLines.map((line) => {
      const parsedNotes = parseLineNotes(line.line_notes);
      const productFromMetadata = parsedNotes.productLabel || '';

      return createLineDraft({
        localId: line.id || `line-${Math.random().toString(36).slice(2, 9)}`,
        id: line.id,
        productId: line.product_id || '',
        quantityOrdered: line.quantity_ordered || 1,
        quantityFulfilled: line.quantity_fulfilled || 0,
        unitPriceAtOrder: line.unit_price_at_order || 0,
        lineNote: normalizeLineNote(parsedNotes, line.line_notes),
        pricingSource: parsedNotes.pricingSource || 'existing_config',
        customerProductId: parsedNotes.customerProductId || '',
        adhocSpec: parsedNotes.adhocSpecification || { ...defaultAdhocSpec },
        markupPercent: parsedNotes.markupPercent ?? 20,
      });
    });

    setLineDrafts(mappedLines.length ? mappedLines : [createLineDraft()]);
    setIsEditingOrder(true);
    setFormError(null);
    setSelectedOrderId(order.id);
  }

  async function updateOrderStatus(orderId: string, status: OrderStatus) {
    if (!canEditOrders) {
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.from(TABLE_PURCHASE_ORDERS).update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
      if (error) throw error;

      setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status, updated_at: new Date().toISOString() } : order)));

      if (orderForm.id === orderId) {
        setOrderForm((prev) => ({ ...prev, status }));
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  }

  async function saveFulfillmentUpdates() {
    if (!selectedOrder || !canEditOrders) {
      return;
    }

    try {
      const supabase = createClient();
      const updates = Object.entries(lineFulfillmentDrafts).map(([lineId, qty]) =>
        supabase
          .from(TABLE_PURCHASE_ORDER_LINES)
          .update({ quantity_fulfilled: Math.max(0, Number(qty) || 0) })
          .eq('id', lineId)
          .eq('purchase_order_id', selectedOrder.id)
      );

      const results = await Promise.all(updates);
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        throw failed.error;
      }

      await loadData();
    } catch (error) {
      console.error('Failed to update line fulfillment:', error);
    }
  }

  async function handleSignOut() {
    try {
      await fetch('/api/signout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <DefaultLayout previewPixelSRC="/pixel.gif">
      <br />
      <br />
      <Navigation
        logo="⬡"
        left={
          <DropdownMenuTrigger items={navigationItems}>
            <ActionButton>ORDER MANAGEMENT</ActionButton>
          </DropdownMenuTrigger>
        }
        right={<ActionButton onClick={handleSignOut}>SIGN OUT</ActionButton>}
      />

      <Grid>
        <Row>
          INBOUND PURCHASE ORDERS <Badge>{orders.length} TOTAL</Badge>
        </Row>

        <ActionBar
          items={[
            {
              hotkey: '⌘+N',
              body: 'New PO',
              onClick: () => resetOrderForm(),
            },
            {
              hotkey: '⌘+R',
              body: 'Reload Data',
              onClick: () => loadData(),
            },
            {
              hotkey: '⌘+C',
              body: 'Customers',
              onClick: () => router.push('/doors/clients'),
            },
            {
              hotkey: '⌘+P',
              body: 'Products',
              onClick: () => router.push('/doors/templates'),
            },
          ]}
        />

        <Card title="SESSION ROLE">
          <Text>Role controls access level for this session.</Text>
          <br />
          <select
            value={role}
            onChange={(event) => persistRole(event.target.value as UserRole)}
            style={{ width: '100%', padding: '0.6rem' }}
          >
            {USER_ROLE_OPTIONS.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {roleOption.toUpperCase()}
              </option>
            ))}
          </select>
          <br />
          <Text>
            {role === 'admin' && 'Admin: full access to orders, customers, and products.'}
            {role === 'standard' && 'Standard: can create/edit orders and update statuses.'}
            {role === 'readonly' && 'Read-only: can view orders only.'}
          </Text>
        </Card>

        {!canManageMasterData && (
          <Card title="ACCESS NOTE">
            <Text>Master data management is admin-only. Use admin role to edit customers and products.</Text>
          </Card>
        )}

        {schemaError && (
          <Card title="DATABASE ERROR">
            <Text>{schemaError}</Text>
            <br />
            <Text>Run `docs/order-management-schema.sql` against Supabase, then reload.</Text>
          </Card>
        )}

        <CardDouble title={isEditingOrder ? 'EDIT PURCHASE ORDER' : 'NEW PURCHASE ORDER'}>
          <Text>PO HEADER</Text>
          <br />
          <select
            value={orderForm.customerId}
            disabled={!canEditOrders}
            onChange={(event) => {
              const nextCustomerId = event.target.value;
              setOrderForm((prev) => ({ ...prev, customerId: nextCustomerId }));
              setLineDrafts([createLineDraft()]);
            }}
            style={{ width: '100%', padding: '0.6rem' }}
          >
            <option value="">Select customer...</option>
            {activeCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          <br />
          <Input label="PO NUMBER" name="po_number" value={orderForm.poNumber} onChange={(event) => setOrderForm((prev) => ({ ...prev, poNumber: event.target.value }))} disabled={!canEditOrders} />
          <Input label="RECEIVED DATE" type="date" name="received_date" value={orderForm.receivedDate} onChange={(event) => setOrderForm((prev) => ({ ...prev, receivedDate: event.target.value }))} disabled={!canEditOrders} />
          <Input label="REQUIRED DATE" type="date" name="required_date" value={orderForm.requiredDate} onChange={(event) => setOrderForm((prev) => ({ ...prev, requiredDate: event.target.value }))} disabled={!canEditOrders} />
          <br />
          <Text>STATUS</Text>
          <select
            value={orderForm.status}
            disabled={!canEditOrders}
            onChange={(event) => setOrderForm((prev) => ({ ...prev, status: event.target.value as OrderStatus }))}
            style={{ width: '100%', padding: '0.6rem' }}
          >
            {ORDER_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
          <br />
          <Input label="ORDER NOTES" name="order_notes" value={orderForm.notes} onChange={(event) => setOrderForm((prev) => ({ ...prev, notes: event.target.value }))} disabled={!canEditOrders} />

          <br />
          <RowSpaceBetween>
            <Text>LINE ITEMS</Text>
            <ActionButton onClick={addLineDraft}>+ Add Line</ActionButton>
          </RowSpaceBetween>

          {lineDrafts.map((line, index) => {
            const lineCost = getLineCost(line);
            const availableConfigOptions = customerConfigsForForm.map((config) => {
              const product = productMap[config.product_id];
              const parsedNotes = parseCustomerProductNotes(config.notes);
              const price =
                parsedNotes.unitPrice ||
                Number((config as any).negotiated_price || (config as any).unit_price || 0) ||
                Number(product?.unit_price || 0);
              const configLabel = config.customer_part_ref || product?.name || 'Unnamed configuration';
              return {
                id: config.id,
                label: `${configLabel} (${formatCurrency(price)})`,
              };
            });

            const availableGlassTypes = getAvailableGlassTypes(line.adhocSpec.thickness);

            return (
              <Card key={line.localId} title={`LINE ${index + 1}`}>
                <Text>PRICING SOURCE</Text>
                <select
                  value={line.pricingSource}
                  disabled={!canEditOrders}
                  onChange={(event) => {
                    const nextSource = event.target.value as PricingSource;
                    updateLineDraft(line.localId, (current) => ({ ...current, pricingSource: nextSource }));
                  }}
                  style={{ width: '100%', padding: '0.6rem' }}
                >
                  <option value="existing_config">Existing Customer Configuration</option>
                  <option value="adhoc_calculator">Ad Hoc Calculator</option>
                </select>
                <br />

                {line.pricingSource === 'existing_config' && (
                  <>
                    <Text>EXISTING CONFIGURATION</Text>
                    <select
                      value={line.customerProductId}
                      disabled={!canEditOrders}
                      onChange={(event) => applyCustomerConfig(line.localId, event.target.value)}
                      style={{ width: '100%', padding: '0.6rem' }}
                    >
                      <option value="">Select existing configuration...</option>
                      {availableConfigOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <br />
                  </>
                )}

                <Text>PRODUCT</Text>
                <select
                  value={line.productId}
                  disabled={!canEditOrders}
                  onChange={(event) => {
                    const nextProductId = event.target.value;
                    updateLineDraft(line.localId, (current) => ({
                      ...current,
                      productId: nextProductId,
                      unitPriceAtOrder: current.pricingSource === 'existing_config' ? Number(productMap[nextProductId]?.unit_price || current.unitPriceAtOrder || 0) : current.unitPriceAtOrder,
                    }));
                  }}
                  style={{ width: '100%', padding: '0.6rem' }}
                >
                  <option value="">Select product...</option>
                  {activeProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                <br />

                <Input
                  label="QUANTITY ORDERED"
                  type="number"
                  name={`quantity_ordered_${line.localId}`}
                  value={String(line.quantityOrdered)}
                  onChange={(event) =>
                    updateLineDraft(line.localId, (current) => ({
                      ...current,
                      quantityOrdered: Math.max(1, numberOrFallback(event.target.value, 1)),
                    }))
                  }
                  disabled={!canEditOrders}
                />

                <Input
                  label="UNIT PRICE AT ORDER ($)"
                  type="number"
                  name={`unit_price_${line.localId}`}
                  value={String(line.unitPriceAtOrder)}
                  onChange={(event) =>
                    updateLineDraft(line.localId, (current) => ({
                      ...current,
                      unitPriceAtOrder: Math.max(0, numberOrFallback(event.target.value, 0)),
                    }))
                  }
                  disabled={!canEditOrders}
                />

                {line.pricingSource === 'adhoc_calculator' && (
                  <>
                    <br />
                    <Text>AD HOC CALCULATOR</Text>
                    <Input
                      label="WIDTH (MM)"
                      type="number"
                      name={`width_${line.localId}`}
                      value={String(line.adhocSpec.width)}
                      onChange={(event) =>
                        updateLineDraft(line.localId, (current) => ({
                          ...current,
                          adhocSpec: {
                            ...current.adhocSpec,
                            width: Math.max(0, numberOrFallback(event.target.value, 0)),
                          },
                        }))
                      }
                      disabled={!canEditOrders}
                    />
                    <Input
                      label="HEIGHT (MM)"
                      type="number"
                      name={`height_${line.localId}`}
                      value={String(line.adhocSpec.height)}
                      onChange={(event) =>
                        updateLineDraft(line.localId, (current) => ({
                          ...current,
                          adhocSpec: {
                            ...current.adhocSpec,
                            height: Math.max(0, numberOrFallback(event.target.value, 0)),
                          },
                        }))
                      }
                      disabled={!canEditOrders}
                    />

                    <Text>THICKNESS</Text>
                    <select
                      value={String(line.adhocSpec.thickness)}
                      disabled={!canEditOrders}
                      onChange={(event) => {
                        const nextThickness = Number(event.target.value) as GlassSpecification['thickness'];
                        updateLineDraft(line.localId, (current) => {
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
                      style={{ width: '100%', padding: '0.6rem' }}
                    >
                      {[4, 5, 6, 8, 10, 12].map((thickness) => (
                        <option key={thickness} value={thickness}>
                          {thickness}mm
                        </option>
                      ))}
                    </select>
                    <br />

                    <Text>GLASS TYPE</Text>
                    <select
                      value={line.adhocSpec.glassType}
                      disabled={!canEditOrders}
                      onChange={(event) =>
                        updateLineDraft(line.localId, (current) => ({
                          ...current,
                          adhocSpec: {
                            ...current.adhocSpec,
                            glassType: event.target.value as GlassSpecification['glassType'],
                          },
                        }))
                      }
                      style={{ width: '100%', padding: '0.6rem' }}
                    >
                      {availableGlassTypes.map((glassType) => (
                        <option key={glassType} value={glassType}>
                          {glassType}
                        </option>
                      ))}
                    </select>
                    <br />

                    <Text>EDGEWORK</Text>
                    <select
                      value={line.adhocSpec.edgework}
                      disabled={!canEditOrders}
                      onChange={(event) =>
                        updateLineDraft(line.localId, (current) => ({
                          ...current,
                          adhocSpec: {
                            ...current.adhocSpec,
                            edgework: event.target.value as GlassSpecification['edgework'],
                          },
                        }))
                      }
                      style={{ width: '100%', padding: '0.6rem' }}
                    >
                      {['ROUGH ARRIS', 'FLAT GRIND - STRAIGHT', 'FLAT GRIND - CURVED', 'FLAT POLISH - STRAIGHT', 'FLAT POLISH - CURVED'].map((edgework) => (
                        <option key={edgework} value={edgework}>
                          {edgework}
                        </option>
                      ))}
                    </select>
                    <br />

                    <Text>SHAPE</Text>
                    <select
                      value={line.adhocSpec.shape}
                      disabled={!canEditOrders}
                      onChange={(event) =>
                        updateLineDraft(line.localId, (current) => ({
                          ...current,
                          adhocSpec: {
                            ...current.adhocSpec,
                            shape: event.target.value as GlassSpecification['shape'],
                          },
                        }))
                      }
                      style={{ width: '100%', padding: '0.6rem' }}
                    >
                      {['RECTANGLE', 'TRIANGLE', 'SIMPLE', 'COMPLEX'].map((shape) => (
                        <option key={shape} value={shape}>
                          {shape}
                        </option>
                      ))}
                    </select>
                    <br />

                    <RowSpaceBetween>
                      <Text>HOLES</Text>
                      <input
                        type="checkbox"
                        checked={line.adhocSpec.holes}
                        disabled={!canEditOrders}
                        onChange={(event) =>
                          updateLineDraft(line.localId, (current) => ({
                            ...current,
                            adhocSpec: {
                              ...current.adhocSpec,
                              holes: event.target.checked,
                              numHoles: event.target.checked ? Math.max(1, current.adhocSpec.numHoles || 4) : 0,
                            },
                          }))
                        }
                      />
                    </RowSpaceBetween>

                    {line.adhocSpec.holes && (
                      <Input
                        label="NUMBER OF HOLES"
                        type="number"
                        name={`holes_${line.localId}`}
                        value={String(line.adhocSpec.numHoles)}
                        onChange={(event) =>
                          updateLineDraft(line.localId, (current) => ({
                            ...current,
                            adhocSpec: {
                              ...current.adhocSpec,
                              numHoles: Math.max(1, numberOrFallback(event.target.value, 1)),
                            },
                          }))
                        }
                        disabled={!canEditOrders}
                      />
                    )}

                    <RowSpaceBetween>
                      <Text>CERAMIC BAND</Text>
                      <input
                        type="checkbox"
                        checked={line.adhocSpec.ceramicBand}
                        disabled={!canEditOrders}
                        onChange={(event) =>
                          updateLineDraft(line.localId, (current) => ({
                            ...current,
                            adhocSpec: {
                              ...current.adhocSpec,
                              ceramicBand: event.target.checked,
                            },
                          }))
                        }
                      />
                    </RowSpaceBetween>

                    <RowSpaceBetween>
                      <Text>SCANNING</Text>
                      <input
                        type="checkbox"
                        checked={line.adhocSpec.scanning}
                        disabled={!canEditOrders}
                        onChange={(event) =>
                          updateLineDraft(line.localId, (current) => ({
                            ...current,
                            adhocSpec: {
                              ...current.adhocSpec,
                              scanning: event.target.checked,
                            },
                          }))
                        }
                      />
                    </RowSpaceBetween>

                    <Input
                      label="MARKUP %"
                      type="number"
                      name={`markup_${line.localId}`}
                      value={String(line.markupPercent)}
                      onChange={(event) =>
                        updateLineDraft(line.localId, (current) => ({
                          ...current,
                          markupPercent: Math.max(0, numberOrFallback(event.target.value, 0)),
                        }))
                      }
                      disabled={!canEditOrders}
                    />

                    <br />
                    {lineCost.error ? (
                      <Text>{lineCost.error}</Text>
                    ) : (
                      <>
                        <RowSpaceBetween>
                          <Text>CALCULATED UNIT COST</Text>
                          <Text>{formatCurrency(lineCost.breakdown?.total || 0)}</Text>
                        </RowSpaceBetween>
                        <RowSpaceBetween>
                          <Text>CALCULATED UNIT PRICE (WITH MARKUP)</Text>
                          <Text>{formatCurrency(lineCost.recommendedUnitPrice)}</Text>
                        </RowSpaceBetween>
                        <br />
                        <ActionButton
                          onClick={() => {
                            updateLineDraft(line.localId, (current) => ({
                              ...current,
                              unitPriceAtOrder: Number(lineCost.recommendedUnitPrice.toFixed(2)),
                            }));
                          }}
                        >
                          Apply Calculator Price
                        </ActionButton>
                      </>
                    )}
                  </>
                )}

                <br />
                <Input
                  label="LINE NOTES"
                  name={`line_notes_${line.localId}`}
                  value={line.lineNote}
                  onChange={(event) => updateLineDraft(line.localId, (current) => ({ ...current, lineNote: event.target.value }))}
                  disabled={!canEditOrders}
                />

                <br />
                <RowSpaceBetween>
                  <Text>LINE TOTAL</Text>
                  <Text>{formatCurrency(line.quantityOrdered * line.unitPriceAtOrder)}</Text>
                </RowSpaceBetween>

                <br />
                <ActionButton onClick={() => removeLineDraft(line.localId)}>Remove Line</ActionButton>
              </Card>
            );
          })}

          <br />
          <RowSpaceBetween>
            <Text>ORDER TOTAL</Text>
            <Text>
              {formatCurrency(
                lineDrafts.reduce((sum, line) => {
                  return sum + line.quantityOrdered * line.unitPriceAtOrder;
                }, 0)
              )}
            </Text>
          </RowSpaceBetween>

          {formError && (
            <>
              <br />
              <Text>{formError}</Text>
            </>
          )}

          <br />
          <RowSpaceBetween>
            <ActionButton onClick={handleSaveOrder}>{isSaving ? 'Saving...' : isEditingOrder ? 'Update Purchase Order' : 'Save Purchase Order'}</ActionButton>
            <ActionButton onClick={resetOrderForm}>Reset</ActionButton>
          </RowSpaceBetween>
        </CardDouble>

        <Card title="ORDER LIST FILTERS">
          <Text>CUSTOMER</Text>
          <select
            value={customerFilter}
            onChange={(event) => setCustomerFilter(event.target.value)}
            style={{ width: '100%', padding: '0.6rem' }}
          >
            <option value="">All customers</option>
            {activeCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          <br />

          <Text>STATUS</Text>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as OrderStatus | '')}
            style={{ width: '100%', padding: '0.6rem' }}
          >
            <option value="">All statuses</option>
            {ORDER_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
          <br />

          <Input label="RECEIVED DATE FROM" type="date" name="received_from" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} />
          <Input label="RECEIVED DATE TO" type="date" name="received_to" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} />
        </Card>

        <Card title="PURCHASE ORDERS">
          {isLoading ? (
            <Text>Loading order data...</Text>
          ) : (
            <Table>
              <TableRow>
                <TableColumn style={{ width: '16ch' }}>PO NUMBER</TableColumn>
                <TableColumn style={{ width: '24ch' }}>CUSTOMER</TableColumn>
                <TableColumn style={{ width: '14ch' }}>RECEIVED</TableColumn>
                <TableColumn style={{ width: '14ch' }}>REQUIRED</TableColumn>
                <TableColumn style={{ width: '16ch' }}>STATUS</TableColumn>
                <TableColumn style={{ width: '12ch' }}>LINES</TableColumn>
                <TableColumn>TOTAL</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableRow>

              {filteredOrders.map((order) => {
                const lines = linesByOrder[order.id] || [];
                const total = calculateOrderTotal(lines);

                return (
                  <TableRow key={order.id}>
                    <TableColumn onClick={() => setSelectedOrderId(order.id)}>{order.po_number}</TableColumn>
                    <TableColumn onClick={() => setSelectedOrderId(order.id)}>{customerMap[order.customer_id]?.name || 'Unknown Customer'}</TableColumn>
                    <TableColumn onClick={() => setSelectedOrderId(order.id)}>{order.received_date || '—'}</TableColumn>
                    <TableColumn onClick={() => setSelectedOrderId(order.id)}>{order.required_date || '—'}</TableColumn>
                    <TableColumn onClick={() => setSelectedOrderId(order.id)}>{statusLabel(order.status)}</TableColumn>
                    <TableColumn onClick={() => setSelectedOrderId(order.id)}>{lines.length}</TableColumn>
                    <TableColumn onClick={() => setSelectedOrderId(order.id)}>{formatCurrency(total)}</TableColumn>
                    <TableColumn>
                      <RowSpaceBetween>
                        <ActionButton onClick={() => startEditingOrder(order)}>Edit</ActionButton>
                        <ActionButton onClick={() => updateOrderStatus(order.id, 'cancelled')}>Cancel</ActionButton>
                      </RowSpaceBetween>
                    </TableColumn>
                  </TableRow>
                );
              })}

              {!filteredOrders.length && (
                <TableRow>
                  <TableColumn colSpan={8} style={{ textAlign: 'center' }}>
                    No purchase orders match your current filters.
                  </TableColumn>
                </TableRow>
              )}
            </Table>
          )}
        </Card>

        {selectedOrder && (
          <CardDouble title={`ORDER DETAIL — ${selectedOrder.po_number}`}>
            <RowSpaceBetween>
              <Text>CUSTOMER</Text>
              <Text>{customerMap[selectedOrder.customer_id]?.name || 'Unknown Customer'}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>STATUS</Text>
              <Text>{statusLabel(selectedOrder.status)}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>RECEIVED DATE</Text>
              <Text>{selectedOrder.received_date || '—'}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>REQUIRED DATE</Text>
              <Text>{selectedOrder.required_date || '—'}</Text>
            </RowSpaceBetween>
            <RowSpaceBetween>
              <Text>ORDER TOTAL</Text>
              <Text>{formatCurrency(calculateOrderTotal(selectedOrderLines))}</Text>
            </RowSpaceBetween>

            <br />
            <Text>UPDATE STATUS</Text>
            <select
              value={selectedOrder.status}
              onChange={(event) => updateOrderStatus(selectedOrder.id, event.target.value as OrderStatus)}
              disabled={!canEditOrders}
              style={{ width: '100%', padding: '0.6rem' }}
            >
              {ORDER_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>

            <br />
            <Text>LINE ITEMS</Text>
            <Table>
              <TableRow>
                <TableColumn style={{ width: '24ch' }}>PRODUCT</TableColumn>
                <TableColumn style={{ width: '10ch' }}>QTY</TableColumn>
                <TableColumn style={{ width: '14ch' }}>UNIT PRICE</TableColumn>
                <TableColumn style={{ width: '16ch' }}>LINE TOTAL</TableColumn>
                <TableColumn style={{ width: '12ch' }}>FULFILLED</TableColumn>
                <TableColumn>NOTES</TableColumn>
              </TableRow>

              {selectedOrderLines.map((line) => {
                const parsedNotes = parseLineNotes(line.line_notes);
                const productName = productMap[line.product_id || '']?.name || parsedNotes.productLabel || 'Unknown Product';

                return (
                  <TableRow key={line.id}>
                    <TableColumn>{productName}</TableColumn>
                    <TableColumn>{line.quantity_ordered}</TableColumn>
                    <TableColumn>{formatCurrency(line.unit_price_at_order || 0)}</TableColumn>
                    <TableColumn>{formatCurrency(calculateLineTotal(line))}</TableColumn>
                    <TableColumn>
                      <input
                        type="number"
                        value={lineFulfillmentDrafts[line.id] ?? line.quantity_fulfilled ?? 0}
                        min={0}
                        disabled={!canEditOrders}
                        onChange={(event) => {
                          const nextValue = Math.max(0, numberOrFallback(event.target.value, 0));
                          setLineFulfillmentDrafts((prev) => ({ ...prev, [line.id]: nextValue }));
                        }}
                        style={{ width: '100%', padding: '0.4rem' }}
                      />
                    </TableColumn>
                    <TableColumn>{normalizeLineNote(parsedNotes, line.line_notes) || '—'}</TableColumn>
                  </TableRow>
                );
              })}

              {!selectedOrderLines.length && (
                <TableRow>
                  <TableColumn colSpan={6} style={{ textAlign: 'center' }}>
                    No lines found on this purchase order.
                  </TableColumn>
                </TableRow>
              )}
            </Table>

            <br />
            <RowSpaceBetween>
              <ActionButton onClick={saveFulfillmentUpdates}>Save Fulfillment</ActionButton>
              <ActionButton onClick={() => startEditingOrder(selectedOrder)}>Edit Order</ActionButton>
            </RowSpaceBetween>
          </CardDouble>
        )}

        <Card title="ORDER DASHBOARD">
          <RowSpaceBetween>
            <Text>OPEN ORDERS</Text>
            <Text>{orders.filter((order) => order.status === 'open').length}</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>IN PRODUCTION</Text>
            <Text>{orders.filter((order) => order.status === 'in_production').length}</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>DUE WITHIN 7 DAYS</Text>
            <Text>{dueInSevenDays.length}</Text>
          </RowSpaceBetween>

          <br />
          <Text>OPEN ORDERS BY CUSTOMER</Text>
          <Table>
            <TableRow>
              <TableColumn style={{ width: '26ch' }}>CUSTOMER</TableColumn>
              <TableColumn>OPEN ORDERS</TableColumn>
            </TableRow>
            {openOrdersByCustomer.map((entry) => (
              <TableRow key={entry.customerId}>
                <TableColumn>{entry.name}</TableColumn>
                <TableColumn>{entry.count}</TableColumn>
              </TableRow>
            ))}
            {!openOrdersByCustomer.length && (
              <TableRow>
                <TableColumn colSpan={2} style={{ textAlign: 'center' }}>
                  No open orders.
                </TableColumn>
              </TableRow>
            )}
          </Table>

          <br />
          <Text>RECENTLY UPDATED ORDERS</Text>
          <Table>
            <TableRow>
              <TableColumn style={{ width: '16ch' }}>PO</TableColumn>
              <TableColumn style={{ width: '22ch' }}>CUSTOMER</TableColumn>
              <TableColumn style={{ width: '16ch' }}>STATUS</TableColumn>
              <TableColumn>UPDATED</TableColumn>
            </TableRow>
            {recentOrders.map((order) => (
              <TableRow key={order.id}>
                <TableColumn>{order.po_number}</TableColumn>
                <TableColumn>{customerMap[order.customer_id]?.name || 'Unknown'}</TableColumn>
                <TableColumn>{statusLabel(order.status)}</TableColumn>
                <TableColumn>{(order.updated_at || order.created_at || '').replace('T', ' ').slice(0, 16) || '—'}</TableColumn>
              </TableRow>
            ))}
          </Table>
        </Card>
      </Grid>
    </DefaultLayout>
  );
}
