'use client';

import '@root/global.scss';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionButton from '@components/ActionButton';
import AppFrame from '@components/page/AppFrame';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { defaultPricingData } from '@components/PricingProvider';
import { GlassSpecification, calculateCost, getAvailableGlassTypes, getAvailableThicknesses } from '@utils/calculations';
import { APP_NAVIGATION_ITEMS } from '@utils/app-navigation';
import { UserRole, formatCurrency, todayISODate } from '@utils/order-management';
import { fetchCurrentSessionUser } from '@utils/session-client';

const navigationItems = APP_NAVIGATION_ITEMS;
const EDGEWORK_OPTIONS: GlassSpecification['edgework'][] = ['ROUGH ARRIS', 'FLAT GRIND - STRAIGHT', 'FLAT GRIND - CURVED', 'FLAT POLISH - STRAIGHT', 'FLAT POLISH - CURVED'];

const defaultQuoteSpec: GlassSpecification = {
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

function numberOrFallback(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export default function AdhocQuotePage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('readonly');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pricingData, setPricingData] = useState<PricingShape>(defaultPricingData);
  const [quoteName, setQuoteName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [quoteDate, setQuoteDate] = useState(todayISODate());
  const [quantity, setQuantity] = useState(1);
  const [markupPercent, setMarkupPercent] = useState(20);
  const [useRecommendedPrice, setUseRecommendedPrice] = useState(true);
  const [manualUnitPrice, setManualUnitPrice] = useState(0);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [spec, setSpec] = useState<GlassSpecification>({ ...defaultQuoteSpec });
  const [copyState, setCopyState] = useState('');

  const calculation = useMemo(() => {
    try {
      const breakdown = calculateCost(spec, pricingData);
      const recommendedUnitPrice = breakdown.total * (1 + markupPercent / 100);
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
  }, [manualUnitPrice, markupPercent, pricingData, quantity, spec, useRecommendedPrice]);

  const quoteSummary = useMemo(() => {
    if (calculation.error) {
      return '';
    }

    return [
      `Quote: ${quoteName.trim() || 'Ad Hoc Quote'}`,
      `Customer: ${customerName.trim() || 'Walk-in / Phone'}`,
      `Date: ${quoteDate}`,
      `Spec: ${spec.width} x ${spec.height} mm | ${spec.thickness}mm ${spec.glassType} | ${spec.shape}`,
      `Edgework: ${spec.edgework}`,
      `Qty: ${Math.max(1, quantity)}`,
      `Unit Price: ${formatCurrency(calculation.unitPrice)}`,
      `Total: ${formatCurrency(calculation.totalPrice)}`,
      quoteNotes.trim() ? `Notes: ${quoteNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }, [calculation.error, calculation.totalPrice, calculation.unitPrice, customerName, quantity, quoteDate, quoteName, quoteNotes, spec.edgework, spec.glassType, spec.height, spec.shape, spec.thickness, spec.width]);

  useEffect(() => {
    setPricingData(parsePricingDataFromStorage());

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
      } catch (loadError: any) {
        setError(loadError?.message || 'Unable to load quote calculator.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  function resetCalculator() {
    setQuoteName('');
    setCustomerName('');
    setQuoteDate(todayISODate());
    setQuantity(1);
    setMarkupPercent(20);
    setUseRecommendedPrice(true);
    setManualUnitPrice(0);
    setQuoteNotes('');
    setSpec({ ...defaultQuoteSpec });
    setCopyState('');
  }

  async function copyQuoteToClipboard() {
    if (!quoteSummary) {
      return;
    }

    try {
      await navigator.clipboard.writeText(quoteSummary);
      setCopyState('Copied quote summary.');
    } catch {
      setCopyState('Clipboard copy failed.');
    }
  }

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⬡"
      navigationItems={navigationItems}
      navLabel="AD HOC QUOTE"
      navRight={<ActionButton onClick={() => router.push('/doors')}>ORDER DASHBOARD</ActionButton>}
      heading="AD HOC PRICING CALCULATOR"
      badge={isLoading ? 'LOADING' : `${role.toUpperCase()} SESSION`}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
          <Card title="QUICK ACTIONS">
            <ActionButton onClick={() => router.push('/doors/new')}>Create Purchase Order</ActionButton>
            <br />
            <ActionButton
              onClick={() => {
                setUseRecommendedPrice(false);
                setManualUnitPrice(Number(calculation.recommendedUnitPrice.toFixed(2)));
              }}
            >
              Use Recommended as Manual
            </ActionButton>
            <br />
            <ActionButton onClick={resetCalculator}>Reset Calculator</ActionButton>
          </Card>

          <Card title="QUOTE SUMMARY">
            {calculation.error ? (
              <Text>
                <span className="status-error">{calculation.error}</span>
              </Text>
            ) : (
              <>
                <RowSpaceBetween>
                  <Text>RECOMMENDED UNIT</Text>
                  <Text>{formatCurrency(calculation.recommendedUnitPrice)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>QUOTED UNIT</Text>
                  <Text>{formatCurrency(calculation.unitPrice)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>QTY</Text>
                  <Text>{Math.max(1, quantity)}</Text>
                </RowSpaceBetween>
                <RowSpaceBetween>
                  <Text>TOTAL QUOTE</Text>
                  <Text>
                    <span className="status-pill status-pill-success">{formatCurrency(calculation.totalPrice)}</span>
                  </Text>
                </RowSpaceBetween>
                <br />
                <ActionButton onClick={copyQuoteToClipboard}>Copy Quote Summary</ActionButton>
              </>
            )}

            {copyState ? (
              <>
                <br />
                <Text>
                  <span className={copyState === 'Copied quote summary.' ? 'status-success' : 'status-warning'}>{copyState}</span>
                </Text>
              </>
            ) : null}
          </Card>

          <Card title="PRICE BREAKDOWN">
            {calculation.error ? (
              <Text>
                <span className="status-error">{calculation.error}</span>
              </Text>
            ) : (
              <>
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
                  <TableRow>
                    <TableColumn>Subtotal</TableColumn>
                    <TableColumn>{formatCurrency(calculation.breakdown?.total)}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Markup ({markupPercent}%)</TableColumn>
                    <TableColumn>{formatCurrency((calculation.breakdown?.total || 0) * (markupPercent / 100))}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Unit Price Used</TableColumn>
                    <TableColumn>{formatCurrency(calculation.unitPrice)}</TableColumn>
                  </TableRow>
                  <TableRow>
                    <TableColumn>Quote Total ({Math.max(1, quantity)} units)</TableColumn>
                    <TableColumn>{formatCurrency(calculation.totalPrice)}</TableColumn>
                  </TableRow>
                </Table>
              </>
            )}
          </Card>
        </>
      }
      actionItems={[
        {
          hotkey: '⌘+R',
          body: 'Reset',
          onClick: resetCalculator,
        },
        {
          hotkey: '⌘+C',
          body: 'Copy Quote',
          onClick: copyQuoteToClipboard,
        },
        {
          hotkey: '⌘+N',
          body: 'New PO',
          onClick: () => router.push('/doors/new'),
        },
      ]}
    >
      {error && (
        <Card title="ERROR">
          <Text>
            <span className="status-error">{error}</span>
          </Text>
        </Card>
      )}

      <CardDouble title="QUOTE DETAILS">
        <Input label="QUOTE NAME" name="quote_name" value={quoteName} onChange={(event) => setQuoteName(event.target.value)} />
        <Input label="CUSTOMER" name="quote_customer" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in / company name" />
        <Input label="QUOTE DATE" type="date" name="quote_date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} />
        <Input
          label="QUANTITY"
          type="number"
          name="quote_quantity"
          value={String(quantity)}
          onChange={(event) => setQuantity(Math.max(1, numberOrFallback(event.target.value, 1)))}
          min="1"
        />
        <Input
          label="MARKUP (%)"
          type="number"
          name="quote_markup"
          value={String(markupPercent)}
          onChange={(event) => setMarkupPercent(Math.max(0, numberOrFallback(event.target.value, 0)))}
          min="0"
        />

        <label>
          <input type="checkbox" checked={useRecommendedPrice} onChange={(event) => setUseRecommendedPrice(event.target.checked)} /> Use recommended unit price
        </label>

        {!useRecommendedPrice && (
          <Input
            label="MANUAL UNIT PRICE ($)"
            type="number"
            name="manual_unit_price"
            value={String(manualUnitPrice)}
            onChange={(event) => setManualUnitPrice(Math.max(0, numberOrFallback(event.target.value, 0)))}
            min="0"
          />
        )}

        <Input label="QUOTE NOTES" name="quote_notes" value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} />
      </CardDouble>

      <CardDouble title="GLASS SPECIFICATION">
        <Text>GLASS THICKNESS (MM)</Text>
        <select
          value={String(spec.thickness)}
          onChange={(event) => {
            const nextThickness = Number(event.target.value) as GlassSpecification['thickness'];
            const nextAvailableTypes = getAvailableGlassTypes(nextThickness);
            const nextGlassType = nextAvailableTypes.includes(spec.glassType) ? spec.glassType : nextAvailableTypes[0];
            setSpec((prev) => ({
              ...prev,
              thickness: nextThickness,
              glassType: nextGlassType,
            }));
          }}
        >
          {getAvailableThicknesses(spec.glassType, pricingData.basePrices).map((thickness) => (
            <option key={thickness} value={thickness}>
              {thickness}
            </option>
          ))}
        </select>
        <br />

        <Text>GLASS TYPE</Text>
        <select
          value={spec.glassType}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              glassType: event.target.value as GlassSpecification['glassType'],
            }))
          }
        >
          {getAvailableGlassTypes(spec.thickness).map((glassType) => (
            <option key={glassType} value={glassType}>
              {glassType}
            </option>
          ))}
        </select>
        <br />

        <Input
          label="WIDTH (MM)"
          type="number"
          name="spec_width"
          value={String(spec.width)}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              width: Math.max(0, numberOrFallback(event.target.value, 0)),
            }))
          }
          min="0"
        />
        <Input
          label="HEIGHT (MM)"
          type="number"
          name="spec_height"
          value={String(spec.height)}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              height: Math.max(0, numberOrFallback(event.target.value, 0)),
            }))
          }
          min="0"
        />

        <Text>SHAPE</Text>
        <select
          value={spec.shape}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              shape: event.target.value as GlassSpecification['shape'],
            }))
          }
        >
          <option value="RECTANGLE">Rectangle</option>
          <option value="TRIANGLE">Triangle</option>
          <option value="SIMPLE">Simple Shape</option>
          <option value="COMPLEX">Complex Shape</option>
        </select>
        <br />

        <Text>EDGEWORK</Text>
        <select
          value={spec.edgework}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              edgework: event.target.value as GlassSpecification['edgework'],
            }))
          }
        >
          {EDGEWORK_OPTIONS.map((edgework) => (
            <option key={edgework} value={edgework}>
              {edgework}
            </option>
          ))}
        </select>
        <br />

        <Text>ADDITIONAL OPTIONS</Text>
        <label>
          <input
            type="checkbox"
            checked={spec.ceramicBand}
            onChange={(event) =>
              setSpec((prev) => ({
                ...prev,
                ceramicBand: event.target.checked,
              }))
            }
          />{' '}
          Ceramic Banding
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={spec.holes}
            onChange={(event) =>
              setSpec((prev) => ({
                ...prev,
                holes: event.target.checked,
                numHoles: event.target.checked ? Math.max(1, prev.numHoles || 4) : 0,
              }))
            }
          />{' '}
          Include Holes
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={spec.scanning}
            onChange={(event) =>
              setSpec((prev) => ({
                ...prev,
                scanning: event.target.checked,
              }))
            }
          />{' '}
          Scanning
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={spec.radiusCorners}
            onChange={(event) =>
              setSpec((prev) => ({
                ...prev,
                radiusCorners: event.target.checked,
              }))
            }
          />{' '}
          Radius Corners
        </label>

        <Input
          label="NUMBER OF HOLES"
          type="number"
          name="spec_holes"
          value={String(spec.numHoles)}
          onChange={(event) =>
            setSpec((prev) => ({
              ...prev,
              numHoles: Math.max(0, numberOrFallback(event.target.value, 0)),
            }))
          }
          min="0"
          disabled={!spec.holes}
        />
      </CardDouble>
    </AppFrame>
  );
}
