'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import AppFrame from '@components/page/AppFrame';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { Customer, CustomerProduct, Product, UserRole, formatCurrency, parseCustomerProductNotes, serializeCustomerProductNotes, todayISODate } from '@utils/order-management';
import { createClient } from '@utils/db-client';

const TABLE_CUSTOMERS = 'customers';
const TABLE_PRODUCTS = 'products';
const TABLE_CUSTOMER_PRODUCTS = 'customer_products';

const navigationItems = [
  { icon: '⊹', children: 'Glass Costing', href: '/' },
  { icon: '⊹', children: 'Order Management', href: '/doors' },
  { icon: '⊹', children: 'Customers', href: '/doors/clients' },
  { icon: '⊹', children: 'Products', href: '/doors/templates' },
  { icon: '⊹', children: 'Pricing Settings', href: '/settings' },
  { icon: '⊹', children: 'Billing', href: '/settings/billing' },
];

interface CustomerFormState {
  id: string | null;
  name: string;
  contactName: string;
  contactEmail: string;
  isActive: boolean;
}

interface CustomerConfigFormState {
  id: string | null;
  productId: string;
  customerPartRef: string;
  defaultQty: number;
  unitPrice: number;
  note: string;
}

function numberOrDefault(value: string, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function createDefaultCustomerForm(): CustomerFormState {
  return {
    id: null,
    name: '',
    contactName: '',
    contactEmail: '',
    isActive: true,
  };
}

function createDefaultConfigForm(): CustomerConfigFormState {
  return {
    id: null,
    productId: '',
    customerPartRef: '',
    defaultQty: 1,
    unitPrice: 0,
    note: '',
  };
}

function activeStatusClassName(isActive?: boolean | null): string {
  return isActive === false ? 'status-pill status-pill-warning' : 'status-pill status-pill-success';
}

export default function CustomersPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('admin');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerProducts, setCustomerProducts] = useState<CustomerProduct[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createDefaultCustomerForm());
  const [configForm, setConfigForm] = useState<CustomerConfigFormState>(createDefaultConfigForm());

  const canEdit = role === 'admin';

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    products.forEach((product) => {
      map[product.id] = product;
    });
    return map;
  }, [products]);

  const customerConfigs = useMemo(() => {
    return customerProducts.filter((config) => config.customer_id === selectedCustomerId);
  }, [customerProducts, selectedCustomerId]);

  async function loadData() {
    setIsLoading(true);
    setError(null);

    try {
      const db = createClient();
      const [customerRes, productRes, customerProductRes] = await Promise.all([
        db.from(TABLE_CUSTOMERS).select('*').order('name', { ascending: true }),
        db.from(TABLE_PRODUCTS).select('*').order('name', { ascending: true }),
        db.from(TABLE_CUSTOMER_PRODUCTS).select('*'),
      ]);

      if (customerRes.error) throw customerRes.error;
      if (productRes.error) throw productRes.error;
      if (customerProductRes.error) throw customerProductRes.error;

      const loadedCustomers = (customerRes.data as Customer[]) || [];
      setCustomers(loadedCustomers);
      setProducts((productRes.data as Product[]) || []);
      setCustomerProducts((customerProductRes.data as CustomerProduct[]) || []);

      if (!selectedCustomerId && loadedCustomers.length) {
        const firstActiveCustomer = loadedCustomers.find((customer) => customer.is_active !== false) || loadedCustomers[0];
        setSelectedCustomerId(firstActiveCustomer.id);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load customers and configurations.');
      setCustomers([]);
      setProducts([]);
      setCustomerProducts([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedRole = localStorage.getItem('orderManagementRole') as UserRole | null;
      if (savedRole) {
        setRole(savedRole);
      }
    }

    loadData();
  }, []);

  function resetCustomerForm() {
    setCustomerForm(createDefaultCustomerForm());
  }

  function resetConfigForm() {
    setConfigForm(createDefaultConfigForm());
  }

  function editCustomer(customer: Customer) {
    setCustomerForm({
      id: customer.id,
      name: customer.name,
      contactName: customer.contact_name || '',
      contactEmail: customer.contact_email || '',
      isActive: customer.is_active !== false,
    });
  }

  function editCustomerConfig(config: CustomerProduct) {
    const parsedNotes = parseCustomerProductNotes(config.notes);

    setConfigForm({
      id: config.id,
      productId: config.product_id,
      customerPartRef: config.customer_part_ref || '',
      defaultQty: config.default_qty || 1,
      unitPrice: parsedNotes.unitPrice || Number((config as any).negotiated_price || (config as any).unit_price || 0),
      note: parsedNotes.note || '',
    });
  }

  async function saveCustomer() {
    if (!canEdit) {
      return;
    }

    if (!customerForm.name.trim()) {
      setError('Customer name is required.');
      return;
    }

    setError(null);
    setIsSavingCustomer(true);

    try {
      const db = createClient();
      const payload = {
        name: customerForm.name.trim(),
        contact_name: customerForm.contactName.trim() || null,
        contact_email: customerForm.contactEmail.trim() || null,
        is_active: customerForm.isActive,
      };

      if (customerForm.id) {
        const { error: updateError } = await db.from(TABLE_CUSTOMERS).update(payload).eq('id', customerForm.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await db
          .from(TABLE_CUSTOMERS)
          .insert({
            ...payload,
            created_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;
      }

      await loadData();
      resetCustomerForm();
    } catch (saveError: any) {
      setError(saveError?.message || 'Unable to save customer.');
    } finally {
      setIsSavingCustomer(false);
    }
  }

  async function toggleCustomerActive(customer: Customer) {
    if (!canEdit) {
      return;
    }

    try {
      const db = createClient();
      const { error: updateError } = await db.from(TABLE_CUSTOMERS).update({ is_active: customer.is_active === false }).eq('id', customer.id);
      if (updateError) throw updateError;

      await loadData();
    } catch (toggleError: any) {
      setError(toggleError?.message || 'Unable to update customer status.');
    }
  }

  async function saveCustomerConfig() {
    if (!canEdit) {
      return;
    }

    if (!selectedCustomerId) {
      setError('Select a customer before saving configurations.');
      return;
    }

    if (!configForm.productId) {
      setError('Product is required for customer configuration.');
      return;
    }

    setError(null);
    setIsSavingConfig(true);

    try {
      const db = createClient();
      const payload = {
        customer_id: selectedCustomerId,
        product_id: configForm.productId,
        customer_part_ref: configForm.customerPartRef.trim() || null,
        default_qty: Math.max(1, Number(configForm.defaultQty) || 1),
        notes: serializeCustomerProductNotes({
          note: configForm.note.trim(),
          unitPrice: Number(configForm.unitPrice) || 0,
          savedSpecification: null,
        }),
      };

      if (configForm.id) {
        const { error: updateError } = await db.from(TABLE_CUSTOMER_PRODUCTS).update(payload).eq('id', configForm.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await db.from(TABLE_CUSTOMER_PRODUCTS).insert(payload);
        if (insertError) throw insertError;
      }

      await loadData();
      resetConfigForm();
    } catch (saveError: any) {
      setError(saveError?.message || 'Unable to save customer configuration.');
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function deleteCustomerConfig(configId: string) {
    if (!canEdit) {
      return;
    }

    try {
      const db = createClient();
      const { error: deleteError } = await db.from(TABLE_CUSTOMER_PRODUCTS).delete().eq('id', configId);
      if (deleteError) throw deleteError;

      await loadData();
    } catch (deleteConfigError: any) {
      setError(deleteConfigError?.message || 'Unable to delete customer configuration.');
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
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navigationItems={navigationItems}
      navLabel="CUSTOMERS"
      navRight={<ActionButton onClick={handleSignOut}>SIGN OUT</ActionButton>}
      heading="CUSTOMER MANAGEMENT"
      badge={`${customers.filter((customer) => customer.is_active !== false).length} ACTIVE`}
      showThemeControls
      actionItems={[
        {
          hotkey: '⌘+S',
          body: 'Save Customer',
          onClick: saveCustomer,
        },
        {
          hotkey: '⌘+N',
          body: 'New Customer',
          onClick: resetCustomerForm,
        },
        {
          hotkey: '⌘+B',
          body: 'Back to Orders',
          onClick: () => router.push('/doors'),
        },
      ]}
    >

        {!canEdit && (
          <Card title="READ ONLY">
            <Text>Customer and configuration management requires admin role.</Text>
          </Card>
        )}

        {error && (
          <Card title="ERROR">
            <Text>
              <span className="status-error">{error}</span>
            </Text>
          </Card>
        )}

        <CardDouble title={customerForm.id ? 'EDIT CUSTOMER' : 'NEW CUSTOMER'}>
          <Input label="CUSTOMER NAME" name="customer_name" value={customerForm.name} onChange={(event) => setCustomerForm((prev) => ({ ...prev, name: event.target.value }))} disabled={!canEdit} />
          <Input label="CONTACT NAME" name="contact_name" value={customerForm.contactName} onChange={(event) => setCustomerForm((prev) => ({ ...prev, contactName: event.target.value }))} disabled={!canEdit} />
          <Input label="CONTACT EMAIL" name="contact_email" value={customerForm.contactEmail} onChange={(event) => setCustomerForm((prev) => ({ ...prev, contactEmail: event.target.value }))} disabled={!canEdit} />

          <Text>STATUS</Text>
          <select
            value={customerForm.isActive ? 'active' : 'inactive'}
            onChange={(event) => setCustomerForm((prev) => ({ ...prev, isActive: event.target.value === 'active' }))}
            disabled={!canEdit}
          >
            <option value="active">ACTIVE</option>
            <option value="inactive">INACTIVE</option>
          </select>

          <br />
          <RowSpaceBetween>
            <ActionButton onClick={saveCustomer}>{isSavingCustomer ? 'Saving...' : customerForm.id ? 'Update Customer' : 'Create Customer'}</ActionButton>
            <ActionButton onClick={resetCustomerForm}>Reset</ActionButton>
          </RowSpaceBetween>
        </CardDouble>

        <Card title="CUSTOMER LIST">
          {isLoading ? (
            <Text>Loading customers...</Text>
          ) : (
            <Table>
              <TableRow>
                <TableColumn style={{ width: '24ch' }}>CUSTOMER</TableColumn>
                <TableColumn style={{ width: '20ch' }}>CONTACT</TableColumn>
                <TableColumn style={{ width: '26ch' }}>EMAIL</TableColumn>
                <TableColumn style={{ width: '12ch' }}>STATUS</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableRow>

              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableColumn>{customer.name}</TableColumn>
                  <TableColumn>{customer.contact_name || '—'}</TableColumn>
                  <TableColumn>{customer.contact_email || '—'}</TableColumn>
                  <TableColumn>
                    <span className={activeStatusClassName(customer.is_active)}>{customer.is_active === false ? 'INACTIVE' : 'ACTIVE'}</span>
                  </TableColumn>
                  <TableColumn>
                    <RowSpaceBetween>
                      <ActionButton
                        onClick={() => {
                          setSelectedCustomerId(customer.id);
                          editCustomer(customer);
                        }}
                      >
                        Edit
                      </ActionButton>
                      <ActionButton
                        onClick={() => {
                          setSelectedCustomerId(customer.id);
                        }}
                      >
                        Configure
                      </ActionButton>
                      <ActionButton onClick={() => toggleCustomerActive(customer)}>{customer.is_active === false ? 'Activate' : 'Deactivate'}</ActionButton>
                    </RowSpaceBetween>
                  </TableColumn>
                </TableRow>
              ))}

              {!customers.length && (
                <TableRow>
                  <TableColumn colSpan={5} style={{ textAlign: 'center' }}>
                    No customers found.
                  </TableColumn>
                </TableRow>
              )}
            </Table>
          )}
        </Card>

        <CardDouble title="CUSTOMER CONFIGURATIONS">
          <Text>Selected customer:</Text>
          <br />
          <select
            value={selectedCustomerId}
            onChange={(event) => {
              setSelectedCustomerId(event.target.value);
              resetConfigForm();
            }}
          >
            <option value="">Select customer...</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>

          <br />
          <Text>PRODUCT</Text>
          <select
            value={configForm.productId}
            onChange={(event) => setConfigForm((prev) => ({ ...prev, productId: event.target.value }))}
            disabled={!canEdit}
          >
            <option value="">Select product...</option>
            {products
              .filter((product) => product.is_active !== false)
              .map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
          </select>

          <br />
          <Input label="CUSTOMER PART REF" name="customer_part_ref" value={configForm.customerPartRef} onChange={(event) => setConfigForm((prev) => ({ ...prev, customerPartRef: event.target.value }))} disabled={!canEdit} />
          <Input
            label="DEFAULT QTY"
            type="number"
            name="default_qty"
            value={String(configForm.defaultQty)}
            onChange={(event) => setConfigForm((prev) => ({ ...prev, defaultQty: Math.max(1, numberOrDefault(event.target.value, 1)) }))}
            disabled={!canEdit}
          />
          <Input
            label="DEFAULT UNIT PRICE ($)"
            type="number"
            name="default_price"
            value={String(configForm.unitPrice)}
            onChange={(event) => setConfigForm((prev) => ({ ...prev, unitPrice: Math.max(0, numberOrDefault(event.target.value, 0)) }))}
            disabled={!canEdit}
          />
          <Input label="NOTES" name="config_notes" value={configForm.note} onChange={(event) => setConfigForm((prev) => ({ ...prev, note: event.target.value }))} disabled={!canEdit} />

          <br />
          <RowSpaceBetween>
            <ActionButton onClick={saveCustomerConfig}>{isSavingConfig ? 'Saving...' : configForm.id ? 'Update Configuration' : 'Add Configuration'}</ActionButton>
            <ActionButton onClick={resetConfigForm}>Reset</ActionButton>
          </RowSpaceBetween>
        </CardDouble>

        <Card title="CONFIGURATION LIST">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '24ch' }}>PRODUCT</TableColumn>
              <TableColumn style={{ width: '18ch' }}>PART REF</TableColumn>
              <TableColumn style={{ width: '10ch' }}>DEFAULT QTY</TableColumn>
              <TableColumn style={{ width: '16ch' }}>DEFAULT PRICE</TableColumn>
              <TableColumn style={{ width: '24ch' }}>NOTES</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>

            {customerConfigs.map((config) => {
              const parsedNotes = parseCustomerProductNotes(config.notes);
              const fallbackPrice = Number((config as any).negotiated_price || (config as any).unit_price || 0) || Number(productMap[config.product_id]?.unit_price || 0);
              const price = parsedNotes.unitPrice || fallbackPrice;

              return (
                <TableRow key={config.id}>
                  <TableColumn>{productMap[config.product_id]?.name || 'Unknown Product'}</TableColumn>
                  <TableColumn>{config.customer_part_ref || '—'}</TableColumn>
                  <TableColumn>{config.default_qty || 1}</TableColumn>
                  <TableColumn>{formatCurrency(price)}</TableColumn>
                  <TableColumn>{parsedNotes.note || '—'}</TableColumn>
                  <TableColumn>
                    <RowSpaceBetween>
                      <ActionButton onClick={() => editCustomerConfig(config)}>Edit</ActionButton>
                      <ActionButton onClick={() => deleteCustomerConfig(config.id)}>Delete</ActionButton>
                    </RowSpaceBetween>
                  </TableColumn>
                </TableRow>
              );
            })}

            {!selectedCustomerId && (
              <TableRow>
                <TableColumn colSpan={6} style={{ textAlign: 'center' }}>
                  Select a customer to view configurations.
                </TableColumn>
              </TableRow>
            )}

            {selectedCustomerId && !customerConfigs.length && (
              <TableRow>
                <TableColumn colSpan={6} style={{ textAlign: 'center' }}>
                  No configurations defined for this customer.
                </TableColumn>
              </TableRow>
            )}
          </Table>
        </Card>

        <Card title="SUMMARY">
          <RowSpaceBetween>
            <Text>ACTIVE CUSTOMERS</Text>
            <Text>
              <span className="status-success">{customers.filter((customer) => customer.is_active !== false).length}</span>
            </Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>TOTAL CONFIGURATIONS</Text>
            <Text>{customerProducts.length}</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>UPDATED</Text>
            <Text>{todayISODate()}</Text>
          </RowSpaceBetween>
        </Card>
    </AppFrame>
  );
}
