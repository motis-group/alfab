'use client';

import '@root/global.scss';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APP_NAVIGATION_ITEMS } from '@utils/app-navigation';

import ActionButton from '@components/ActionButton';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import AppFrame from '@components/page/AppFrame';
import DefaultActionBar from '@components/page/DefaultActionBar';
import Input from '@components/Input';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { usePricing } from '@components/PricingProvider';
import { EdgeworkType, GlassThickness, GlassType } from '@utils/calculations';

const navigationItems = APP_NAVIGATION_ITEMS;

export default function PricingSettings() {
  const router = useRouter();
  const { pricingData, updatePricingData, resetToDefaults } = usePricing();
  const [basePrices, setBasePrices] = useState(pricingData.basePrices);
  const [edgeworkPrices, setEdgeworkPrices] = useState(pricingData.edgeworkPrices);
  const [otherPrices, setOtherPrices] = useState(pricingData.otherPrices);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setBasePrices(pricingData.basePrices);
    setEdgeworkPrices(pricingData.edgeworkPrices);
    setOtherPrices(pricingData.otherPrices);
    setHasChanges(false);
  }, [pricingData]);

  const updateBasePrice = (glassType: GlassType, thickness: GlassThickness, value: string) => {
    const numValue = parseFloat(value) || 0;
    setBasePrices((prev) => ({
      ...prev,
      [glassType]: {
        ...prev[glassType],
        [thickness]: numValue,
      },
    }));
    setHasChanges(true);
  };

  const updateEdgeworkPrice = (edgework: EdgeworkType, range: '4-6' | '8-12', value: string) => {
    const numValue = parseFloat(value) || 0;
    setEdgeworkPrices((prev) => ({
      ...prev,
      [edgework]: {
        ...prev[edgework],
        [range]: numValue,
      },
    }));
    setHasChanges(true);
  };

  const updateOtherPrice = (field: keyof typeof otherPrices, value: string) => {
    const numValue = parseFloat(value) || 0;
    setOtherPrices((prev) => ({
      ...prev,
      [field]: numValue,
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updatePricingData({
      basePrices,
      edgeworkPrices,
      otherPrices,
    });
    setHasChanges(false);
  };

  const handleReset = () => {
    resetToDefaults();
    setHasChanges(false);
  };

  const glassTypes: GlassType[] = ['Clear', 'Green', 'Grey', 'Dark Grey', 'Super Grey'];
  const edgeworkTypes: EdgeworkType[] = ['ROUGH ARRIS', 'FLAT GRIND - STRAIGHT', 'FLAT GRIND - CURVED', 'FLAT POLISH - STRAIGHT', 'FLAT POLISH - CURVED'];
  const thicknesses: GlassThickness[] = [4, 5, 6, 8, 10, 12];

  return (
    <AppFrame
      previewPixelSRC="/pixel.gif"
      logo="⚙"
      navigationItems={navigationItems}
      navLabel="PRICING SETTINGS"
      navRight={<ActionButton onClick={() => router.push('/')}>BACK TO COSTING</ActionButton>}
      heading="PRICING CONFIGURATION"
      badge={hasChanges ? 'UNSAVED CHANGES' : 'SAVED'}
      sidebarWidthCh={44}
      sidebarMobileOrder="top"
      sidebar={
        <>
          {hasChanges && (
            <Card title="UNSAVED CHANGES">
              <Text>
                <span className="status-warning">You have unsaved changes. Save before leaving this page.</span>
              </Text>
              <br />
              <RowSpaceBetween>
                <ActionButton onClick={handleSave}>Save Changes</ActionButton>
                <ActionButton onClick={handleReset}>Reset to Defaults</ActionButton>
              </RowSpaceBetween>
            </Card>
          )}

          <Card title="APPEARANCE">
            <Text>Theme and font controls are available here only, to keep the rest of the app clean.</Text>
            <br />
            <DefaultActionBar />
          </Card>

        </>
      }
      actionItems={[
        {
          hotkey: '⌘+S',
          body: 'Save',
          onClick: handleSave,
        },
        {
          hotkey: '⌘+R',
          body: 'Reset',
          onClick: handleReset,
        },
        {
          hotkey: '⌘+B',
          body: 'Back',
          onClick: () => router.push('/'),
        },
      ]}
    >
      <CardDouble title="BASE GLASS PRICES ($ per m²)">
        <Text>Configure the base price per square meter for each glass type and thickness combination.</Text>
        <br />

        <Table>
          <TableRow>
            <TableColumn style={{ width: '20ch' }}>GLASS TYPE</TableColumn>
            {thicknesses.map((thickness) => (
              <TableColumn key={thickness} style={{ width: '12ch' }}>
                {thickness}mm
              </TableColumn>
            ))}
          </TableRow>

          {glassTypes.map((glassType) => (
            <TableRow key={glassType}>
              <TableColumn>
                <strong>{glassType}</strong>
              </TableColumn>
              {thicknesses.map((thickness) => (
                <TableColumn key={thickness}>
                  <Input type="number" name={`base-${glassType}-${thickness}`} value={basePrices[glassType]?.[thickness]?.toString() || ''} onChange={(event) => updateBasePrice(glassType, thickness, event.target.value)} placeholder="0.00" step="0.01" />
                </TableColumn>
              ))}
            </TableRow>
          ))}
        </Table>
      </CardDouble>

      <CardDouble title="EDGEWORK PRICES ($ per meter)">
        <Text>Configure the edgework pricing per linear meter based on thickness ranges.</Text>
        <br />

        <Table>
          <TableRow>
            <TableColumn style={{ width: '30ch' }}>EDGEWORK TYPE</TableColumn>
            <TableColumn style={{ width: '15ch' }}>4-6mm ($/m)</TableColumn>
            <TableColumn style={{ width: '15ch' }}>8-12mm ($/m)</TableColumn>
          </TableRow>

          {edgeworkTypes.map((edgework) => (
            <TableRow key={edgework}>
              <TableColumn>
                <strong>{edgework}</strong>
              </TableColumn>
              <TableColumn>
                <Input type="number" name={`edgework-${edgework}-4-6`} value={edgeworkPrices[edgework]['4-6']?.toString() || ''} onChange={(event) => updateEdgeworkPrice(edgework, '4-6', event.target.value)} placeholder="0.00" step="0.01" />
              </TableColumn>
              <TableColumn>
                <Input type="number" name={`edgework-${edgework}-8-12`} value={edgeworkPrices[edgework]['8-12']?.toString() || ''} onChange={(event) => updateEdgeworkPrice(edgework, '8-12', event.target.value)} placeholder="0.00" step="0.01" />
              </TableColumn>
            </TableRow>
          ))}
        </Table>
      </CardDouble>

      <CardDouble title="OTHER PRICING">
        <Text>Configure additional service and feature pricing.</Text>
        <br />

        <div
          style={{
            display: 'grid',
            gap: 'calc(var(--font-size) * var(--theme-line-height-base))',
            gridTemplateColumns: 'repeat(auto-fit, minmax(32ch, 1fr))',
            alignItems: 'start',
          }}
        >
          <div style={{ flex: 1 }}>
            <Text>
              <strong>HOLES</strong>
            </Text>
            <Input label="4-6mm Thickness ($ per hole)" type="number" name="hole-4-6" value={otherPrices.holePrice4to6.toString()} onChange={(event) => updateOtherPrice('holePrice4to6', event.target.value)} step="0.01" />
            <Input label="8-12mm Thickness ($ per hole)" type="number" name="hole-8-12" value={otherPrices.holePrice8to12.toString()} onChange={(event) => updateOtherPrice('holePrice8to12', event.target.value)} step="0.01" />
          </div>

          <div style={{ flex: 1 }}>
            <Text>
              <strong>SHAPE COMPLEXITY</strong>
            </Text>
            <Input label="Simple Shape 4-6mm ($)" type="number" name="shape-simple-4-6" value={otherPrices.shapeSimple4to6.toString()} onChange={(event) => updateOtherPrice('shapeSimple4to6', event.target.value)} step="0.01" />
            <Input label="Simple Shape 8-12mm ($)" type="number" name="shape-simple-8-12" value={otherPrices.shapeSimple8to12.toString()} onChange={(event) => updateOtherPrice('shapeSimple8to12', event.target.value)} step="0.01" />
            <Input label="Complex Shape 4-6mm ($)" type="number" name="shape-complex-4-6" value={otherPrices.shapeComplex4to6.toString()} onChange={(event) => updateOtherPrice('shapeComplex4to6', event.target.value)} step="0.01" />
            <Input label="Complex Shape 8-12mm ($)" type="number" name="shape-complex-8-12" value={otherPrices.shapeComplex8to12.toString()} onChange={(event) => updateOtherPrice('shapeComplex8to12', event.target.value)} step="0.01" />
          </div>
        </div>

        <br />
        <div
          style={{
            display: 'grid',
            gap: 'calc(var(--font-size) * var(--theme-line-height-base))',
            gridTemplateColumns: 'repeat(auto-fit, minmax(32ch, 1fr))',
            alignItems: 'start',
          }}
        >
          <div style={{ flex: 1 }}>
            <Text>
              <strong>ADDITIONAL SERVICES</strong>
            </Text>
            <Input label="Ceramic Banding ($)" type="number" name="ceramic" value={otherPrices.ceramicBanding.toString()} onChange={(event) => updateOtherPrice('ceramicBanding', event.target.value)} step="0.01" />
            <Input label="Scanning Service ($)" type="number" name="scanning" value={otherPrices.scanning.toString()} onChange={(event) => updateOtherPrice('scanning', event.target.value)} step="0.01" />
          </div>
        </div>

        <br />
        <RowSpaceBetween>
          <ActionButton onClick={hasChanges ? handleSave : undefined}>{hasChanges ? 'Save All Changes' : 'No Changes to Save'}</ActionButton>
          <ActionButton onClick={hasChanges ? handleReset : undefined}>Reset to Defaults</ActionButton>
        </RowSpaceBetween>
      </CardDouble>
    </AppFrame>
  );
}
