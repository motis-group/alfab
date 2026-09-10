'use client';

import PrintSheet from '@components/PrintSheet';
import { CostBreakdown, GlassSpecification, describeGlassSpecification } from '@utils/calculations';
import { formatCurrency } from '@utils/order-management';

export interface GlassCostingSheetPiece {
  id: string;
  name: string;
  quantity: number;
  spec: GlassSpecification;
  unitPrice: number;
  /** Null when the specification could not be priced. */
  breakdown: CostBreakdown | null;
}

interface GlassCostingSheetProps {
  quoteName: string;
  customerName: string;
  quoteDate: string;
  notes: string;
  ratesLabel: string;
  pieces: GlassCostingSheetPiece[];
}

/** The build-up in the order the shop reads it. `total` is the sum and is printed as its own row. */
const COST_COMPONENTS: Array<{ key: Exclude<keyof CostBreakdown, 'total'>; label: string }> = [
  { key: 'baseGlass', label: 'Glass' },
  { key: 'edgework', label: 'Edgework' },
  { key: 'holes', label: 'Holes' },
  { key: 'shape', label: 'Shape' },
  { key: 'ceramic', label: 'Ceramic band' },
  { key: 'scanning', label: 'Scanning' },
  { key: 'minimumTopUp', label: 'Minimum charge top-up' },
];

/**
 * Costing sheet for the printer. Hidden on screen; printing hides the app around it. Shares the
 * window sheet's class names, so all three costing sheets print identically, and splits the same
 * way: one piece per page for the bench. The customer's document is QuoteSheet.
 */
export default function GlassCostingSheet({ quoteName, customerName, quoteDate, notes, ratesLabel, pieces }: GlassCostingSheetProps) {
  return (
    <PrintSheet audience="internal">
      {pieces.map((piece, index) => {
        const { breakdown } = piece;
        const quantity = Math.max(1, piece.quantity);
        const margin = breakdown == null ? null : piece.unitPrice - breakdown.total;
        // The percentage describes the amount printed beside it. A piece priced by hand carries a
        // margin the markup field never described.
        const marginRate = margin == null || !breakdown || breakdown.total === 0 ? null : Math.round((margin / breakdown.total) * 1000) / 10;

        return (
          <article key={piece.id} className="window-costing-sheet__window">
            <header className="window-costing-sheet__heading">
              <h1 className="window-costing-sheet__title">{quoteName.trim() || 'Glass costing'}</h1>
              <span>
                {quoteDate}
                {pieces.length > 1 ? ` · piece ${index + 1} of ${pieces.length}` : ''}
              </span>
            </header>

            <div className="window-costing-sheet__meta">
              <span>Customer: {customerName.trim() || 'Walk-in / phone'}</span>
              <span>Piece: {piece.name || `Piece ${index + 1}`}</span>
              <span>Quantity: {quantity}</span>
              <span>Rates: {ratesLabel}</span>
            </div>

            <p className="window-costing-sheet__spec">{describeGlassSpecification(piece.spec)}</p>

            <table className="window-costing-sheet__table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th className="window-costing-sheet__amount">Cost</th>
                </tr>
              </thead>
              <tbody>
                {breakdown == null ? (
                  <tr>
                    <td>Cost</td>
                    <td className="window-costing-sheet__amount">not priced</td>
                  </tr>
                ) : (
                  COST_COMPONENTS.filter((component) => breakdown[component.key] !== 0).map((component) => (
                    <tr key={component.key}>
                      <td>{component.label}</td>
                      <td className="window-costing-sheet__amount">{formatCurrency(breakdown[component.key])}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tbody className="window-costing-sheet__totals">
                <tr>
                  <td>Total cost</td>
                  <td className="window-costing-sheet__amount">{breakdown == null ? 'not priced' : formatCurrency(breakdown.total)}</td>
                </tr>
                <tr>
                  <td>{marginRate == null ? 'Margin' : `Margin (${marginRate}% of cost)`}</td>
                  <td className="window-costing-sheet__amount">{margin == null ? 'not priced' : formatCurrency(margin)}</td>
                </tr>
                <tr className="window-costing-sheet__grand">
                  <td>Price each</td>
                  <td className="window-costing-sheet__amount">{breakdown == null ? 'not priced' : formatCurrency(piece.unitPrice)}</td>
                </tr>
                {quantity > 1 ? (
                  <tr className="window-costing-sheet__grand">
                    <td>Total for {quantity}</td>
                    <td className="window-costing-sheet__amount">{breakdown == null ? 'not priced' : formatCurrency(piece.unitPrice * quantity)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {piece.spec.cadOutline ? (
              <p className="window-costing-sheet__note">
                CAD: {piece.spec.cadOutline.fileName} | {piece.spec.cadOutline.shapeLabel} | {piece.spec.cadOutline.areaSqM.toFixed(3)} m² | {piece.spec.cadOutline.perimeterM.toFixed(2)} m edge
                {piece.spec.cadOutline.priceOnMeasured ? ' (priced on measured outline)' : ''}
              </p>
            ) : null}
            {notes.trim() ? <p className="window-costing-sheet__note">Notes: {notes.trim()}</p> : null}

            <footer className="window-costing-sheet__footer">Comments:</footer>
          </article>
        );
      })}
    </PrintSheet>
  );
}
