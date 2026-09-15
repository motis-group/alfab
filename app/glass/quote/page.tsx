'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import CadImportPanel from '@components/CadImportPanel';
import Card from '@components/Card';
import GlassSpecificationFields from '@components/GlassSpecificationFields';
import GlassVisualizer from '@components/GlassVisualizer';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import NoLineToPrice from '@components/page/NoLineToPrice';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { usePricing } from '@components/PricingProvider';
import { GlassSpecification, calculateCost, describeGlassSpecification, getEffectiveArea, getEffectivePerimeter, usesMeasuredGeometry } from '@utils/calculations';
import { UserRole, formatCurrency } from '@utils/order-management';
import { LineEditRequest, clearLineEditRequest, peekLineEditRequest, persistLineEditResult } from '@utils/line-editing';
import { defaultAdhocSpec } from '@utils/order-draft';
import { fetchCurrentSessionUser } from '@utils/session-client';

function numberOrFallback(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The glass calculator. It prices one cut-glass line that a quote or an order sends.
 *
 * The calculator keeps no quote of its own. Without a line, it prices nothing, and the page shows the
 * way to a quote.
 */
export default function AdhocQuotePage() {
  const router = useRouter();
  const { pricingData } = usePricing();

  const [role, setRole] = useState<UserRole>('readonly');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [markupPercent, setMarkupPercent] = useState(20);
  const [useRecommendedPrice, setUseRecommendedPrice] = useState(true);
  const [manualUnitPrice, setManualUnitPrice] = useState(0);
  const [spec, setSpec] = useState<GlassSpecification>({ ...defaultAdhocSpec });
  const [itemName, setItemName] = useState('');
  // The line that a quote or an order sent to be priced.
  const [lineEdit, setLineEdit] = useState<LineEditRequest | null>(null);

  // A quote line is priced at cost, because the quote sets the margin. An order line has no quote
  // around it, so it carries its own markup.
  const quoteLine = lineEdit?.origin.kind === 'quote';

  const calculation = useMemo(() => {
    try {
      const breakdown = calculateCost(spec, pricingData);
      const recommendedUnitPrice = breakdown.total * (1 + (quoteLine ? 0 : markupPercent) / 100);
      const unitPrice = useRecommendedPrice ? recommendedUnitPrice : Math.max(0, manualUnitPrice);
      const totalPrice = unitPrice * Math.max(1, quantity);

      return {
        breakdown,
        recommendedUnitPrice,
        unitPrice,
        totalPrice,
        error: null as string | null,
      };
    } catch (costError: any) {
      return {
        breakdown: null,
        recommendedUnitPrice: 0,
        unitPrice: 0,
        totalPrice: 0,
        error: costError?.message || 'Unable to calculate quote.',
      };
    }
  }, [manualUnitPrice, markupPercent, pricingData, quantity, quoteLine, spec, useRecommendedPrice]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const user = await fetchCurrentSessionUser();
        if (!user) {
          router.push('/login');
          return;
        }

        setRole(user.effectiveRole as UserRole);

        // An order or a quote sent one line to be priced. Load that line into the form.
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        if (params?.get('editLine') === '1') {
          const request = peekLineEditRequest();
          const line = request?.line;
          if (request && line) {
            setLineEdit(request);
            setSpec({ ...line.adhocSpec });
            setQuantity(Math.max(1, line.quantityOrdered));
            setMarkupPercent(line.markupPercent);
            setItemName(line.lineNote);
            // An order line keeps its price until the operator asks for the recommended one. A quote
            // line with no cost yet is priced from its specification.
            setUseRecommendedPrice(request.origin.kind === 'quote' && !line.unitPriceAtOrder);
            setManualUnitPrice(line.unitPriceAtOrder);
          }
        }
      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load quote calculator.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  /** Returns the priced line to the order or the quote that sent it. */
  function saveLineToDocument() {
    if (!lineEdit) {
      return;
    }
    if (calculation.error) {
      setError(calculation.error);
      return;
    }

    persistLineEditResult({
      origin: lineEdit.origin,
      localId: lineEdit.localId,
      line: {
        quantityOrdered: Math.max(1, quantity),
        unitPriceAtOrder: calculation.unitPrice,
        lineNote: itemName.trim(),
        markupPercent,
        adhocSpec: { ...spec },
        windowSpec: null,
        windowRatesUpdatedAt: null,
        awningSpec: null,
        awningRatesUpdatedAt: null,
      },
      spec: describeGlassSpecification(spec),
      extras: [],
    });
    router.push(lineEdit.returnTo);
  }

  /** Leaves the line as the order or the quote holds it. */
  function cancelLineEdit() {
    if (!lineEdit) {
      return;
    }
    clearLineEditRequest();
    router.push(lineEdit.returnTo);
  }

  if (!lineEdit) {
    return <NoLineToPrice heading="AD HOC PRICING CALCULATOR" isLoading={isLoading} error={error} />;
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navRight={<ActionButton onClick={() => router.push('/glass')}>ORDER DASHBOARD</ActionButton>}
      heading={`PRICING A LINE OF ${lineEdit.origin.label.toUpperCase()}`}
      badge={isLoading ? 'LOADING' : `${role.toUpperCase()} SESSION`}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
          {/* Actions are on the toolbar. */}
          <Card title="THIS PIECE">
            {calculation.error ? (
              <Text>
                <span className="status-error">{calculation.error}</span>
              </Text>
            ) : (
              <>
                <RowSpaceBetween>
                  <Text>AREA</Text>
                  <Text>
                    {getEffectiveArea(spec).toFixed(3)} m²{usesMeasuredGeometry(spec) ? ' (CAD)' : ''}
                  </Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>EDGE LENGTH</Text>
                  <Text>
                    {getEffectivePerimeter(spec).toFixed(2)} m{usesMeasuredGeometry(spec) ? ' (CAD)' : ''}
                  </Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>{quoteLine ? 'UNIT COST FROM RATES' : 'RECOMMENDED UNIT'}</Text>
                  <Text>{formatCurrency(calculation.recommendedUnitPrice)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>{quoteLine ? 'UNIT COST' : 'UNIT PRICE'}</Text>
                  <Text>{formatCurrency(calculation.unitPrice)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>QTY</Text>
                  <Text>{Math.max(1, quantity)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>{quoteLine ? 'LINE COST' : 'LINE TOTAL'}</Text>
                  <Text>
                    <span className="status-pill status-pill-success">{formatCurrency(calculation.totalPrice)}</span>
                  </Text>
                </RowSpaceBetween>
              </>
            )}
          </Card>

          <Card title="PRICE BREAKDOWN">
            {calculation.error ? (
              <Text>
                <span className="status-error">{calculation.error}</span>
              </Text>
            ) : (
              <Table>
                <TableRow>
                  <TableColumn style={{ width: '24ch' }}>COMPONENT</TableColumn>
                  <TableColumn>COST</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Base Glass</TableColumn>
                  <TableColumn>{formatCurrency(calculation.breakdown?.baseGlass)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Edgework</TableColumn>
                  <TableColumn>{formatCurrency(calculation.breakdown?.edgework)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Holes</TableColumn>
                  <TableColumn>{formatCurrency(calculation.breakdown?.holes)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Shape</TableColumn>
                  <TableColumn>{formatCurrency(calculation.breakdown?.shape)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Ceramic</TableColumn>
                  <TableColumn>{formatCurrency(calculation.breakdown?.ceramic)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>Scanning</TableColumn>
                  <TableColumn>{formatCurrency(calculation.breakdown?.scanning)}</TableColumn>
                </TableRow>
                {calculation.breakdown?.minimumTopUp ? (
                  <TableRow>
                    <TableColumn>Minimum charge top-up</TableColumn>
                    <TableColumn>{formatCurrency(calculation.breakdown.minimumTopUp)}</TableColumn>
                  </TableRow>
                ) : null}
                <TableRow>
                  <TableColumn>Subtotal</TableColumn>
                  <TableColumn>{formatCurrency(calculation.breakdown?.total)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>{quoteLine ? 'Margin' : `Markup (${markupPercent}%)`}</TableColumn>
                  <TableColumn>{quoteLine ? 'Set on the quote' : formatCurrency((calculation.breakdown?.total || 0) * (markupPercent / 100))}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>{quoteLine ? 'Unit Cost Used' : 'Unit Price Used'}</TableColumn>
                  <TableColumn>{formatCurrency(calculation.unitPrice)}</TableColumn>
                </TableRow>
                <TableRow>
                  <TableColumn>
                    {quoteLine ? 'Line Cost' : 'Line Total'} ({Math.max(1, quantity)} units)
                  </TableColumn>
                  <TableColumn>{formatCurrency(calculation.totalPrice)}</TableColumn>
                </TableRow>
              </Table>
            )}
          </Card>

          <Card title="GLASS VISUALIZER">
            <GlassVisualizer spec={spec} />
          </Card>
        </>
      }
      // The line belongs to the quote or the order that sent it, so the bar offers only the way back.
      actionItems={[
        { body: quoteLine ? 'Save To Quote' : 'Save To Order', onClick: saveLineToDocument },
        { body: 'Cancel', onClick: cancelLineEdit },
      ]}
    >
      {error ? (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      ) : null}

      {/* The form below is the line that the quote or the order sent. The way back is in the bar at the top. */}
      <CardDouble title={lineEdit.origin.kind === 'order' ? 'EDITING AN ORDER LINE' : 'EDITING A QUOTE LINE'}>
        <Text>
          {lineEdit.lineLabel} of {lineEdit.origin.label}. Changing the piece below changes that line.
        </Text>
      </CardDouble>

      <CardDouble title="THE LINE">
        <GlassSpecificationFields spec={spec} onChange={setSpec} basePrices={pricingData.basePrices} />
        <br />
        <Input label="QUANTITY" type="number" name="quote_quantity" value={String(quantity)} onChange={(event) => setQuantity(Math.max(1, numberOrFallback(event.target.value, 1)))} min="1" />
        {/* An order line has no quote around it, so its markup is set here. A quote sets one margin for every line. */}
        {quoteLine ? <Text style={{ opacity: 0.7 }}>Priced at cost. The quote sets the margin.</Text> : <Input label="MARKUP (%)" type="number" name="line_markup" value={String(markupPercent)} onChange={(event) => setMarkupPercent(Math.max(0, numberOrFallback(event.target.value, 0)))} min="0" />}

        <label>
          <input type="checkbox" checked={useRecommendedPrice} onChange={(event) => setUseRecommendedPrice(event.target.checked)} /> {quoteLine ? 'Use the unit cost from the rates' : 'Use recommended unit price'}
        </label>

        {!useRecommendedPrice && <Input label={quoteLine ? 'MANUAL UNIT COST ($)' : 'MANUAL UNIT PRICE ($)'} type="number" name="manual_unit_price" value={String(manualUnitPrice)} onChange={(event) => setManualUnitPrice(Math.max(0, numberOrFallback(event.target.value, 0)))} min="0" />}

        <Input label="PIECE NAME (OPTIONAL)" name="item_name" value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Front window, side panel..." />
      </CardDouble>

      <CardDouble title="READ A CUSTOMER'S DRAWING">
        <CadImportPanel spec={spec} onApply={(result) => setSpec(result.spec)} onClear={() => setSpec((prev) => ({ ...prev, cadOutline: null }))} disabled={role === 'readonly'} />
      </CardDouble>
    </AppFrame>
  );
}
