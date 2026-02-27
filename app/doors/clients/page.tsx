'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APP_NAVIGATION_ITEMS } from '@utils/app-navigation';

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

import { Customer, CustomerProduct, UserRole, formatCurrency, parseCustomerProductNotes, serializeCustomerProductNotes, todayISODate } from '@utils/order-management';
import { createClient } from '@utils/db-client';
import { fetchCurrentSessionUser } from '@utils/session-client';

const TABLE_CUSTOMERS = 'customers';
const TABLE_CUSTOMER_PRODUCTS = 'customer_products';

const navigationItems = APP_NAVIGATION_ITEMS;

interface CustomerFormState {
  id: string | null;
  name: string;
  contactName: string;
  contactEmail: string;
  isActive: boolean;
}

interface CustomerProductFormState {
  id: string | null;
  name: string;
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

function createDefaultProductForm(): CustomerProductFormState {
  return {
    id: null,
    name: '',
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

  const [role, setRole] = useState<UserRole>('readonly');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerProducts, setCustomerProducts] = useState<CustomerProduct[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createDefaultCustomerForm());
  const [productForm, setProductForm] = useState<CustomerProductFormState>(createDefaultProductForm());

  const canEdit = role === 'admin' || role === 'superadmin';

  const selectedCustomerProducts = useMemo(() => {
    return customerProducts.filter((product) => product.customer_id === selectedCustomerId);
  }, [customerProducts, selectedCustomerId]);

  async function loadData() {
    setIsLoading(true);
    setError(null);

    try {
      const db = createClient();
      const [customerRes, customerProductRes] = await Promise.all([db.from(TABLE_CUSTOMERS).select('*').order('name', { ascending: true }), db.from(TABLE_CUSTOMER_PRODUCTS).select('*')]);

      if (customerRes.error) throw customerRes.error;
      if (customerProductRes.error) throw customerProductRes.error;

      const loadedCustomers = (customerRes.data as Customer[]) || [];
      setCustomers(loadedCustomers);
      setCustomerProducts((customerProductRes.data as CustomerProduct[]) || []);

      if (!selectedCustomerId && loadedCustomers.length) {
        const firstActiveCustomer = loadedCustomers.find((customer) => customer.is_active !== false) || loadedCustomers[0];
        setSelectedCustomerId(firstActiveCustomer.id);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load customers and products.');
      setCustomers([]);
      setCustomerProducts([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const user = await fetchCurrentSessionUser();
      if (!user) {
        router.push('/login');
        return;
      }

      setRole(user.effectiveRole as UserRole);
      await loadData();
    })();
  }, []);

  function resetCustomerForm() {
    setCustomerForm(createDefaultCustomerForm());
  }

  function resetProductForm() {
    setProductForm(createDefaultProductForm());
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

  function editProduct(product: CustomerProduct) {
    const parsedNotes = parseCustomerProductNotes(product.notes);

    setProductForm({
      id: product.id,
      name: product.name || product.customer_part_ref || '',
      customerPartRef: product.customer_part_ref || '',
      defaultQty: product.default_qty || 1,
      unitPrice: parsedNotes.unitPrice || Number((product as any).negotiated_price || (product as any).unit_price || 0),
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

  async function saveCustomerProduct() {
    if (!canEdit) {
      return;
    }

    if (!selectedCustomerId) {
      setError('Select a customer before saving products.');
      return;
    }

    if (!productForm.name.trim()) {
      setError('Product name is required.');
      return;
    }

    setError(null);
    setIsSavingProduct(true);

    try {
      const db = createClient();
      const payload = {
        customer_id: selectedCustomerId,
        name: productForm.name.trim(),
        product_id: null,
        customer_part_ref: productForm.customerPartRef.trim() || null,
        default_qty: Math.max(1, Number(productForm.defaultQty) || 1),
        notes: serializeCustomerProductNotes({
          note: productForm.note.trim(),
          unitPrice: Number(productForm.unitPrice) || 0,
          savedSpecification: null,
        }),
      };

      if (productForm.id) {
        const { error: updateError } = await db.from(TABLE_CUSTOMER_PRODUCTS).update(payload).eq('id', productForm.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await db.from(TABLE_CUSTOMER_PRODUCTS).insert(payload);
        if (insertError) throw insertError;
      }

      await loadData();
      resetProductForm();
    } catch (saveError: any) {
      setError(saveError?.message || 'Unable to save customer product.');
    } finally {
      setIsSavingProduct(false);
    }
  }

  async function deleteCustomerProduct(productId: string) {
    if (!canEdit) {
      return;
    }

    try {
      const db = createClient();
      const { error: deleteError } = await db.from(TABLE_CUSTOMER_PRODUCTS).delete().eq('id', productId);
      if (deleteError) throw deleteError;

      await loadData();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Unable to delete customer product.');
    }
  }


  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navigationItems={navigationItems}
      navLabel="CUSTOMERS"
      navRight={<ActionButton onClick={() => router.push('/doors')}>ORDER DASHBOARD</ActionButton>}
      heading="CUSTOMER MANAGEMENT"
      badge={`${customers.filter((customer) => customer.is_active !== false).length} ACTIVE`}
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
          <Text>Customer and product management requires admin or superadmin role.</Text>
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
        <select value={customerForm.isActive ? 'active' : 'inactive'} onChange={(event) => setCustomerForm((prev) => ({ ...prev, isActive: event.target.value === 'active' }))} disabled={!canEdit}>
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
                      Products
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

      <CardDouble title="CUSTOMER PRODUCTS">
        <Text>Selected customer:</Text>
        <br />
        <select
          value={selectedCustomerId}
          onChange={(event) => {
            setSelectedCustomerId(event.target.value);
            resetProductForm();
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
        <Input label="PRODUCT NAME" name="product_name" value={productForm.name} onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))} disabled={!canEdit} />
        <Input label="CUSTOMER PART REF" name="customer_part_ref" value={productForm.customerPartRef} onChange={(event) => setProductForm((prev) => ({ ...prev, customerPartRef: event.target.value }))} disabled={!canEdit} />
        <Input
          label="DEFAULT QTY"
          type="number"
          name="default_qty"
          value={String(productForm.defaultQty)}
          onChange={(event) => setProductForm((prev) => ({ ...prev, defaultQty: Math.max(1, numberOrDefault(event.target.value, 1)) }))}
          disabled={!canEdit}
        />
        <Input
          label="DEFAULT UNIT PRICE ($)"
          type="number"
          name="default_price"
          value={String(productForm.unitPrice)}
          onChange={(event) => setProductForm((prev) => ({ ...prev, unitPrice: Math.max(0, numberOrDefault(event.target.value, 0)) }))}
          disabled={!canEdit}
        />
        <Input label="NOTES" name="product_notes" value={productForm.note} onChange={(event) => setProductForm((prev) => ({ ...prev, note: event.target.value }))} disabled={!canEdit} />

        <br />
        <RowSpaceBetween>
          <ActionButton onClick={saveCustomerProduct}>{isSavingProduct ? 'Saving...' : productForm.id ? 'Update Product' : 'Add Product'}</ActionButton>
          <ActionButton onClick={resetProductForm}>Reset</ActionButton>
        </RowSpaceBetween>
      </CardDouble>

      <Card title="PRODUCT LIST">
        <Table>
          <TableRow>
            <TableColumn style={{ width: '24ch' }}>PRODUCT</TableColumn>
            <TableColumn style={{ width: '18ch' }}>PART REF</TableColumn>
            <TableColumn style={{ width: '10ch' }}>DEFAULT QTY</TableColumn>
            <TableColumn style={{ width: '16ch' }}>DEFAULT PRICE</TableColumn>
            <TableColumn style={{ width: '24ch' }}>NOTES</TableColumn>
            <TableColumn>ACTIONS</TableColumn>
          </TableRow>

          {selectedCustomerProducts.map((product) => {
            const parsedNotes = parseCustomerProductNotes(product.notes);
            const fallbackPrice = Number((product as any).negotiated_price || (product as any).unit_price || 0);
            const price = parsedNotes.unitPrice || fallbackPrice;

            return (
              <TableRow key={product.id}>
                <TableColumn>{product.name || product.customer_part_ref || 'Unnamed Product'}</TableColumn>
                <TableColumn>{product.customer_part_ref || '—'}</TableColumn>
                <TableColumn>{product.default_qty || 1}</TableColumn>
                <TableColumn>{formatCurrency(price)}</TableColumn>
                <TableColumn>{parsedNotes.note || '—'}</TableColumn>
                <TableColumn>
                  <RowSpaceBetween>
                    <ActionButton onClick={() => editProduct(product)}>Edit</ActionButton>
                    <ActionButton onClick={() => deleteCustomerProduct(product.id)}>Delete</ActionButton>
                  </RowSpaceBetween>
                </TableColumn>
              </TableRow>
            );
          })}

          {!selectedCustomerId && (
            <TableRow>
              <TableColumn colSpan={6} style={{ textAlign: 'center' }}>
                Select a customer to view products.
              </TableColumn>
            </TableRow>
          )}

          {selectedCustomerId && !selectedCustomerProducts.length && (
            <TableRow>
              <TableColumn colSpan={6} style={{ textAlign: 'center' }}>
                No products defined for this customer.
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
          <Text>TOTAL PRODUCTS</Text>
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
