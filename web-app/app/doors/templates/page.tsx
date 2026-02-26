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

import { Product, ProductCategory, UserRole, formatCurrency, todayISODate } from '@utils/order-management';
import { createClient } from '@utils/supabase/client';

const TABLE_PRODUCTS = 'products';
const TABLE_PRODUCT_CATEGORIES = 'product_categories';

const navigationItems = [
  { icon: '⊹', children: 'Glass Costing', href: '/' },
  { icon: '⊹', children: 'Order Management', href: '/doors' },
  { icon: '⊹', children: 'Customers', href: '/doors/clients' },
  { icon: '⊹', children: 'Products', href: '/doors/templates' },
  { icon: '⊹', children: 'Pricing Settings', href: '/settings' },
];

interface ProductFormState {
  id: string | null;
  name: string;
  categoryId: string;
  sku: string;
  unitPrice: number;
  isActive: boolean;
}

interface CategoryFormState {
  id: string | null;
  name: string;
  description: string;
}

function createDefaultProductForm(): ProductFormState {
  return {
    id: null,
    name: '',
    categoryId: '',
    sku: '',
    unitPrice: 0,
    isActive: true,
  };
}

function createDefaultCategoryForm(): CategoryFormState {
  return {
    id: null,
    name: '',
    description: '',
  };
}

function numberOrDefault(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ProductsPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('admin');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [productForm, setProductForm] = useState<ProductFormState>(createDefaultProductForm());
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(createDefaultCategoryForm());

  const canEdit = role === 'admin';

  const categoryMap = useMemo(() => {
    const map: Record<string, ProductCategory> = {};
    categories.forEach((category) => {
      map[category.id] = category;
    });
    return map;
  }, [categories]);

  async function loadData() {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const [categoryRes, productRes] = await Promise.all([
        supabase.from(TABLE_PRODUCT_CATEGORIES).select('*').order('name', { ascending: true }),
        supabase.from(TABLE_PRODUCTS).select('*').order('name', { ascending: true }),
      ]);

      if (categoryRes.error) throw categoryRes.error;
      if (productRes.error) throw productRes.error;

      setCategories((categoryRes.data as ProductCategory[]) || []);
      setProducts((productRes.data as Product[]) || []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load products and categories.');
      setCategories([]);
      setProducts([]);
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

  function resetProductForm() {
    setProductForm(createDefaultProductForm());
  }

  function resetCategoryForm() {
    setCategoryForm(createDefaultCategoryForm());
  }

  function editProduct(product: Product) {
    setProductForm({
      id: product.id,
      name: product.name,
      categoryId: product.category_id || '',
      sku: product.sku || '',
      unitPrice: Number(product.unit_price || 0),
      isActive: product.is_active !== false,
    });
  }

  function editCategory(category: ProductCategory) {
    setCategoryForm({
      id: category.id,
      name: category.name,
      description: category.description || '',
    });
  }

  async function saveCategory() {
    if (!canEdit) {
      return;
    }

    if (!categoryForm.name.trim()) {
      setError('Category name is required.');
      return;
    }

    setError(null);
    setIsSavingCategory(true);

    try {
      const supabase = createClient();
      const payload = {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || null,
      };

      if (categoryForm.id) {
        const { error: updateError } = await supabase.from(TABLE_PRODUCT_CATEGORIES).update(payload).eq('id', categoryForm.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from(TABLE_PRODUCT_CATEGORIES).insert(payload);
        if (insertError) throw insertError;
      }

      await loadData();
      resetCategoryForm();
    } catch (saveError: any) {
      setError(saveError?.message || 'Unable to save category.');
    } finally {
      setIsSavingCategory(false);
    }
  }

  async function saveProduct() {
    if (!canEdit) {
      return;
    }

    if (!productForm.name.trim()) {
      setError('Product name is required.');
      return;
    }

    setError(null);
    setIsSavingProduct(true);

    try {
      const supabase = createClient();
      const payload = {
        name: productForm.name.trim(),
        category_id: productForm.categoryId || null,
        sku: productForm.sku.trim() || null,
        unit_price: Number(productForm.unitPrice) || 0,
        is_active: productForm.isActive,
      };

      if (productForm.id) {
        const { error: updateError } = await supabase.from(TABLE_PRODUCTS).update(payload).eq('id', productForm.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from(TABLE_PRODUCTS)
          .insert({
            ...payload,
            created_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;
      }

      await loadData();
      resetProductForm();
    } catch (saveError: any) {
      setError(saveError?.message || 'Unable to save product.');
    } finally {
      setIsSavingProduct(false);
    }
  }

  async function toggleProductActive(product: Product) {
    if (!canEdit) {
      return;
    }

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.from(TABLE_PRODUCTS).update({ is_active: product.is_active === false }).eq('id', product.id);
      if (updateError) throw updateError;

      await loadData();
    } catch (toggleError: any) {
      setError(toggleError?.message || 'Unable to update product status.');
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
            <ActionButton>PRODUCTS</ActionButton>
          </DropdownMenuTrigger>
        }
        right={<ActionButton onClick={handleSignOut}>SIGN OUT</ActionButton>}
      />

      <Grid>
        <Row>
          PRODUCT & CONFIGURATION CATALOG <Badge>{products.filter((product) => product.is_active !== false).length} ACTIVE</Badge>
        </Row>

        <ActionBar
          items={[
            {
              hotkey: '⌘+S',
              body: 'Save Product',
              onClick: saveProduct,
            },
            {
              hotkey: '⌘+N',
              body: 'New Product',
              onClick: resetProductForm,
            },
            {
              hotkey: '⌘+B',
              body: 'Back to Orders',
              onClick: () => router.push('/doors'),
            },
          ]}
        />

        {!canEdit && (
          <Card title="READ ONLY">
            <Text>Product and category management requires admin role.</Text>
          </Card>
        )}

        {error && (
          <Card title="ERROR">
            <Text>{error}</Text>
          </Card>
        )}

        <CardDouble title={categoryForm.id ? 'EDIT CATEGORY' : 'NEW CATEGORY'}>
          <Input label="CATEGORY NAME" name="category_name" value={categoryForm.name} onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))} disabled={!canEdit} />
          <Input label="DESCRIPTION" name="category_description" value={categoryForm.description} onChange={(event) => setCategoryForm((prev) => ({ ...prev, description: event.target.value }))} disabled={!canEdit} />
          <br />
          <RowSpaceBetween>
            <ActionButton onClick={saveCategory}>{isSavingCategory ? 'Saving...' : categoryForm.id ? 'Update Category' : 'Create Category'}</ActionButton>
            <ActionButton onClick={resetCategoryForm}>Reset</ActionButton>
          </RowSpaceBetween>
        </CardDouble>

        <Card title="CATEGORIES">
          {isLoading ? (
            <Text>Loading categories...</Text>
          ) : (
            <Table>
              <TableRow>
                <TableColumn style={{ width: '30ch' }}>CATEGORY</TableColumn>
                <TableColumn style={{ width: '36ch' }}>DESCRIPTION</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableRow>

              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableColumn>{category.name}</TableColumn>
                  <TableColumn>{category.description || '—'}</TableColumn>
                  <TableColumn>
                    <ActionButton onClick={() => editCategory(category)}>Edit</ActionButton>
                  </TableColumn>
                </TableRow>
              ))}

              {!categories.length && (
                <TableRow>
                  <TableColumn colSpan={3} style={{ textAlign: 'center' }}>
                    No categories found.
                  </TableColumn>
                </TableRow>
              )}
            </Table>
          )}
        </Card>

        <CardDouble title={productForm.id ? 'EDIT PRODUCT' : 'NEW PRODUCT'}>
          <Input label="PRODUCT NAME" name="product_name" value={productForm.name} onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))} disabled={!canEdit} />

          <Text>CATEGORY</Text>
          <select
            value={productForm.categoryId}
            onChange={(event) => setProductForm((prev) => ({ ...prev, categoryId: event.target.value }))}
            style={{ width: '100%', padding: '0.6rem' }}
            disabled={!canEdit}
          >
            <option value="">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <br />
          <Input label="SKU" name="product_sku" value={productForm.sku} onChange={(event) => setProductForm((prev) => ({ ...prev, sku: event.target.value }))} disabled={!canEdit} />
          <Input
            label="BASE UNIT PRICE ($)"
            type="number"
            name="unit_price"
            value={String(productForm.unitPrice)}
            onChange={(event) => setProductForm((prev) => ({ ...prev, unitPrice: Math.max(0, numberOrDefault(event.target.value, 0)) }))}
            disabled={!canEdit}
          />

          <Text>STATUS</Text>
          <select
            value={productForm.isActive ? 'active' : 'inactive'}
            onChange={(event) => setProductForm((prev) => ({ ...prev, isActive: event.target.value === 'active' }))}
            style={{ width: '100%', padding: '0.6rem' }}
            disabled={!canEdit}
          >
            <option value="active">ACTIVE</option>
            <option value="inactive">INACTIVE</option>
          </select>

          <br />
          <RowSpaceBetween>
            <ActionButton onClick={saveProduct}>{isSavingProduct ? 'Saving...' : productForm.id ? 'Update Product' : 'Create Product'}</ActionButton>
            <ActionButton onClick={resetProductForm}>Reset</ActionButton>
          </RowSpaceBetween>
        </CardDouble>

        <Card title="PRODUCTS">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '26ch' }}>PRODUCT</TableColumn>
              <TableColumn style={{ width: '18ch' }}>CATEGORY</TableColumn>
              <TableColumn style={{ width: '14ch' }}>SKU</TableColumn>
              <TableColumn style={{ width: '16ch' }}>UNIT PRICE</TableColumn>
              <TableColumn style={{ width: '10ch' }}>STATUS</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>

            {products.map((product) => (
              <TableRow key={product.id}>
                <TableColumn>{product.name}</TableColumn>
                <TableColumn>{product.category_id ? categoryMap[product.category_id]?.name || 'Unknown Category' : 'Uncategorized'}</TableColumn>
                <TableColumn>{product.sku || '—'}</TableColumn>
                <TableColumn>{formatCurrency(product.unit_price || 0)}</TableColumn>
                <TableColumn>{product.is_active === false ? 'INACTIVE' : 'ACTIVE'}</TableColumn>
                <TableColumn>
                  <RowSpaceBetween>
                    <ActionButton onClick={() => editProduct(product)}>Edit</ActionButton>
                    <ActionButton onClick={() => toggleProductActive(product)}>{product.is_active === false ? 'Activate' : 'Deactivate'}</ActionButton>
                  </RowSpaceBetween>
                </TableColumn>
              </TableRow>
            ))}

            {!products.length && (
              <TableRow>
                <TableColumn colSpan={6} style={{ textAlign: 'center' }}>
                  No products found.
                </TableColumn>
              </TableRow>
            )}
          </Table>
        </Card>

        <Card title="SUMMARY">
          <RowSpaceBetween>
            <Text>ACTIVE PRODUCTS</Text>
            <Text>{products.filter((product) => product.is_active !== false).length}</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>PRODUCT CATEGORIES</Text>
            <Text>{categories.length}</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>UPDATED</Text>
            <Text>{todayISODate()}</Text>
          </RowSpaceBetween>
        </Card>
      </Grid>
    </DefaultLayout>
  );
}
