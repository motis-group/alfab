'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

interface PrintSheetProps {
  audience: 'internal' | 'customer';
  children: React.ReactNode;
}

/**
 * Renders a printable sheet as the last child of <body>. Print styles remove body's other children
 * from the layout; a sheet inside the app would inherit the app's height. Renders after mount only,
 * because the portal needs a document.
 */
export default function PrintSheet({ audience, children }: PrintSheetProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <section className="window-costing-sheet" data-audience={audience} aria-hidden="true">
      {children}
    </section>,
    document.body
  );
}
