# Glass Order Management

## Overview

The `/glass` section is the operational side of the app: purchase orders for glass panels,
the customers and products they are raised against, and the pricing calculator that sizes
and costs each panel.

## Routes

- `/glass` — purchase order dashboard with filters and summary counts.
- `/glass/new` — create or edit a purchase order and its lines. Lines are priced either from
  a saved customer product or from the ad hoc calculator.
- `/glass/quote` — ad hoc pricing calculator, including CAD file import and the glass visualizer.
- `/glass/clients` — customers and their saved products.

Costing rates live under `/settings`; see `docs/costing.md` for the pricing model and
`docs/cad-import.md` for the CAD import feature.

## History

This section began as a doors CRM prototype and was renamed to `/glass` once the product
settled on glass panels. Older links to `/doors/*` are redirected in `next.config.js`.
