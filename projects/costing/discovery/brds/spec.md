# Order Management Module — Technical Specification

**Project:** Glass Costing App — Order Management Extension  
**Client:** Nick  
**Version:** 1.0  
**Status:** Draft

---

## 1. Problem Statement

Inbound purchase orders from large repeat customers are being managed across handwritten sheets, email, and Excel. Orders are slipping through. Xero cannot solve this — it has no inbound PO management, and entering orders as invoices corrupts BAS.

This module provides a dedicated, persistent, digital layer for receiving, storing, and tracking customer purchase orders — integrated into the existing glass costing app as a new tab.

---

## 2. Scope

### In Scope (v1)

- Customer selection and management
- Inbound PO entry and storage
- Per-PO line item entry tied to saved product configurations
- Order status tracking (open / in production / fulfilled)
- Cross-reference support (PO visible on factory job sheet)
- Authentication with role-based access

### Out of Scope (v1)

- Pricing (remains in Xero)
- Invoicing
- Window costing migration
- Xero API integration

### Deferred but Architecturally Supported

- Pricing per product/configuration
- Xero push (PO → draft invoice)
- Window costing module
- Packing slip generation

---

## 3. Data Model

The model is flat, relational, and modular. Each entity is independently extensible without breaking others.

---

### 3.1 `customers`

| Field           | Type      | Notes                               |
| --------------- | --------- | ----------------------------------- |
| `id`            | UUID      | Primary key                         |
| `name`          | string    | e.g. "Bar Crusher", "Truck Trailer" |
| `contact_name`  | string    | Optional                            |
| `contact_email` | string    | Optional                            |
| `is_active`     | boolean   | Soft delete                         |
| `created_at`    | timestamp |                                     |

**Extensibility:** Add `xero_contact_id`, `payment_terms`, `account_manager` without touching other tables.

---

### 3.2 `product_categories`

| Field         | Type   | Notes                                  |
| ------------- | ------ | -------------------------------------- |
| `id`          | UUID   | Primary key                            |
| `name`        | string | e.g. "Sliding Window", "Hopper Window" |
| `description` | string | Optional                               |

Lookup table. Add categories without touching products or orders.

---

### 3.3 `products`

| Field         | Type                    | Notes                         |
| ------------- | ----------------------- | ----------------------------- |
| `id`          | UUID                    | Primary key                   |
| `name`        | string                  | e.g. "615 HT Slider", "Topaz" |
| `category_id` | FK → product_categories | Optional grouping             |
| `sku`         | string                  | Optional, for Xero alignment  |
| `unit_price`  | decimal                 | Nullable — pricing deferred   |
| `is_active`   | boolean                 |                               |
| `created_at`  | timestamp               |                               |

**Extensibility:** Add `glass_spec`, `frame_type`, `costing_config_id` later without migration pain.

---

### 3.4 `customer_products`

Junction table. Defines which products a customer regularly orders. Drives the configuration dropdown on PO entry.

| Field               | Type           | Notes                                  |
| ------------------- | -------------- | -------------------------------------- |
| `id`                | UUID           | Primary key                            |
| `customer_id`       | FK → customers |                                        |
| `product_id`        | FK → products  |                                        |
| `customer_part_ref` | string         | Customer's own name/code for this item |
| `default_qty`       | integer        | Optional, pre-fills order line         |
| `notes`             | string         |                                        |

**Extensibility:** Add `negotiated_price`, `lead_time_days`, `preferred_supplier` per customer-product pair without touching orders.

---

### 3.5 `purchase_orders`

One record per inbound PO from a customer.

| Field           | Type           | Notes                                             |
| --------------- | -------------- | ------------------------------------------------- |
| `id`            | UUID           | Primary key                                       |
| `customer_id`   | FK → customers |                                                   |
| `po_number`     | string         | Customer's PO number                              |
| `received_date` | date           | When PO was received                              |
| `required_date` | date           | Customer's requested delivery                     |
| `status`        | enum           | `open`, `in_production`, `fulfilled`, `cancelled` |
| `notes`         | string         |                                                   |
| `created_by`    | FK → users     |                                                   |
| `created_at`    | timestamp      |                                                   |
| `updated_at`    | timestamp      |                                                   |

**Extensibility:** Add `xero_invoice_id`, `shipping_method`, `dispatched_date` later. Status enum is easily extended.

---

### 3.6 `purchase_order_lines`

One record per line item on a PO.

| Field                 | Type                 | Notes                                     |
| --------------------- | -------------------- | ----------------------------------------- |
| `id`                  | UUID                 | Primary key                               |
| `purchase_order_id`   | FK → purchase_orders |                                           |
| `product_id`          | FK → products        |                                           |
| `quantity_ordered`    | integer              |                                           |
| `quantity_fulfilled`  | integer              | Default 0                                 |
| `unit_price_at_order` | decimal              | Nullable — snapshot when pricing is added |
| `line_notes`          | string               |                                           |

**Extensibility:** Add `quantity_in_production`, `job_sheet_ref`, `dispatched_qty` per line without structural changes.

---

### 3.7 `users`

| Field           | Type      | Notes                           |
| --------------- | --------- | ------------------------------- |
| `id`            | UUID      | Primary key                     |
| `username`      | string    | Unique                          |
| `password_hash` | string    | bcrypt                          |
| `role`          | enum      | `admin`, `standard`, `readonly` |
| `is_active`     | boolean   |                                 |
| `created_at`    | timestamp |                                 |

**Extensibility:** Add `email`, `2fa_secret`, `last_login` without affecting auth logic.

---

## 4. Entity Relationship (Summary)

```
users
  └── purchase_orders (created_by)

customers
  ├── customer_products
  │     └── products
  │           └── product_categories
  └── purchase_orders
        └── purchase_order_lines
              └── products
```

---

## 5. Feature Requirements

### 5.1 Authentication

- Login screen: username + password
- Session-based auth (JWT or server session)
- Role enforcement:
  - `admin`: full access, manage users, manage customers/products
  - `standard`: create/edit orders, update statuses
  - `readonly`: view only

### 5.2 Customer Management (admin)

- List all active customers
- Add / edit / deactivate customer
- Per customer: manage `customer_products` (which products they buy, default qty, their part ref)

### 5.3 Product / Configuration Management (admin)

- List all products
- Add / edit / deactivate product
- Assign to category

### 5.4 Order Entry

- Select customer from dropdown
- Line items auto-populated from `customer_products` for that customer (with default qty, editable)
- Enter PO number + received date + required date
- Optional notes
- Save → status defaults to `open`

### 5.5 Order List View

- Filter by: customer, status, date range
- Columns: PO number, customer, received date, required date, status, line count
- Click row → Order Detail

### 5.6 Order Detail View

- All PO header fields
- Line items table: product name, qty ordered, qty fulfilled
- Status update control (open → in_production → fulfilled)
- Edit / cancel controls

### 5.7 Dashboard (optional v1, recommended)

- Count of open orders by customer
- Orders with required date within next 7 days
- Recently updated orders

---

## 6. Module Integration

Added as a new tab in the existing glass costing app shell. The shell will eventually contain:

| Tab                  | Status        |
| -------------------- | ------------- |
| Glass Costing        | Existing      |
| **Order Management** | **This spec** |
| Window Costing       | Future        |

Authentication wraps the entire shell. Login once, access all modules per role.

---

## 7. Technical Recommendations

- **Database:** PostgreSQL (hosted/multi-user) - will need to be hosted we use aws amplify currently but we can change this to be an EC2 container if it makes having PostgreSQL easier
- **ORM:** Use one — schema migrations must be versioned from day one (Alembic, Prisma, etc.)
- **Pricing fields:** Include as nullable now. Do not add them later as an afterthought — the column exists, it just has no data.
- **Xero readiness:** Store `po_number` and `customer_id` in a format that maps cleanly to Xero contact + reference fields. When push is built, it reads these columns directly.
- **Audit trail:** Add `updated_by` + `updated_at` to orders from the start. Cheap to build now, painful to retrofit.

---

## 8. Known Constraints

- Pricing managed in Xero only — do not duplicate pricing logic in v1
- Invoicing stays in Xero — this system does not generate invoices
- Must remain low-cost to operate — no large SaaS subscription dependencies
- Xero integration is viable via API but requires evaluation of OAuth flow and endpoint availability

---

## 9. Out of Scope Clarifications

| Item                    | Reason                        |
| ----------------------- | ----------------------------- |
| Packing slip generation | Xero handles this             |
| Payment tracking        | Xero + bank feed handles this |
| BAS / accounting        | Xero handles this             |
| Customer-facing portal  | Not requested                 |

---

_End of Specification v1.0_
