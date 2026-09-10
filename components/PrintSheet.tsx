'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

interface PrintSheetProps {
  audience: 'internal' | 'customer';
  children: React.ReactNode;
}

/**
 * Wraps a printable sheet and puts it at the end of <body>, outside the app.
 *
 * The sheet has to sit beside the app rather than inside it. Printing takes body's other children
 * out of the layout, and an app hidden any other way keeps its height and prints as blank pages.
 * Nothing renders until the component mounts, because the portal needs a real document.
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
