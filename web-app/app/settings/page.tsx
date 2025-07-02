'use client';

import '@root/global.scss';

import * as Constants from '@common/constants';
import * as Utilities from '@common/utilities';

import ActionBar from '@components/ActionBar';
import ActionButton from '@components/ActionButton';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import DefaultLayout from '@components/page/DefaultLayout';
import Grid from '@components/Grid';
import Input from '@components/Input';
import Navigation from '@components/Navigation';
import Row from '@components/Row';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableRow from '@components/TableRow';
import TableColumn from '@components/TableColumn';
import Text from '@components/Text';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DropdownMenuTrigger from '@components/DropdownMenuTrigger';
import DefaultActionBar from '@components/page/DefaultActionBar';
import { GlassType, EdgeworkType, GlassThickness } from '@utils/calculations';
import { usePricing } from '@components/PricingProvider';

const navigationItems = [
  { icon: '⊹', children: 'Glass Costing', href: '/' },
  { icon: '⊹', children: 'Doors', href: '/doors' },
  { icon: '⊹', children: 'Client Management', href: '/costing/clients' },
  { icon: '⊹', children: 'Pricing Settings', href: '/settings' },
  { icon: '⊹', children: 'Component Library', href: '/examples' },
];

export default function PricingSettings() {
  const router = useRouter();
  const { pricingData, updatePricingData, resetToDefaults } = usePricing();
  const [basePrices, setBasePrices] = useState(pricingData.basePrices);
  const [edgeworkPrices, setEdgeworkPrices] = useState(pricingData.edgeworkPrices);
  const [otherPrices, setOtherPrices] = useState(pricingData.otherPrices);
  const [hasChanges, setHasChanges] = useState(false);

  // Update local state when pricing context changes
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
    <DefaultLayout previewPixelSRC="/pixel.gif">
      <br />
      <br />
      <Navigation
        logo="⚙"
        left={
          <DropdownMenuTrigger items={navigationItems}>
            <ActionButton>PRICING SETTINGS</ActionButton>
          </DropdownMenuTrigger>
        }
        right={<ActionButton onClick={() => router.push('/')}>BACK TO COSTING</ActionButton>}
      />

      <Grid>
        <DefaultActionBar />

        <CardDouble title="PRICING CONFIGURATION">
          {hasChanges && (
            <Card title="UNSAVED CHANGES">
              <Text style={{ color: 'orange' }}>You have unsaved changes. Don't forget to save your updates.</Text>
              <br />
              <RowSpaceBetween>
                <ActionButton onClick={handleSave}>Save Changes</ActionButton>
                <ActionButton onClick={handleReset}>Reset to Defaults</ActionButton>
              </RowSpaceBetween>
            </Card>
          )}
          <br />

          <Card title="BASE GLASS PRICES ($ per m²)">
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
                      <Input type="number" name={`base-${glassType}-${thickness}`} value={basePrices[glassType]?.[thickness]?.toString() || ''} onChange={(e) => updateBasePrice(glassType, thickness, e.target.value)} placeholder="0.00" step="0.01" />
                    </TableColumn>
                  ))}
                </TableRow>
              ))}
            </Table>
          </Card>

          <Card title="EDGEWORK PRICES ($ per meter)">
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
                    <Input type="number" name={`edgework-${edgework}-4-6`} value={edgeworkPrices[edgework]['4-6']?.toString() || ''} onChange={(e) => updateEdgeworkPrice(edgework, '4-6', e.target.value)} placeholder="0.00" step="0.01" />
                  </TableColumn>
                  <TableColumn>
                    <Input type="number" name={`edgework-${edgework}-8-12`} value={edgeworkPrices[edgework]['8-12']?.toString() || ''} onChange={(e) => updateEdgeworkPrice(edgework, '8-12', e.target.value)} placeholder="0.00" step="0.01" />
                  </TableColumn>
                </TableRow>
              ))}
            </Table>
          </Card>

          <Card title="OTHER PRICING">
            <Text>Configure additional service and feature pricing.</Text>
            <br />

            <Row>
              <div style={{ flex: 1 }}>
                <Text>
                  <strong>HOLES</strong>
                </Text>
                <Input label="4-6mm Thickness ($ per hole)" type="number" name="hole-4-6" value={otherPrices.holePrice4to6.toString()} onChange={(e) => updateOtherPrice('holePrice4to6', e.target.value)} step="0.01" />
                <Input label="8-12mm Thickness ($ per hole)" type="number" name="hole-8-12" value={otherPrices.holePrice8to12.toString()} onChange={(e) => updateOtherPrice('holePrice8to12', e.target.value)} step="0.01" />
              </div>

              <div style={{ flex: 1 }}>
                <Text>
                  <strong>SHAPE COMPLEXITY</strong>
                </Text>
                <Input label="Simple Shape 4-6mm ($)" type="number" name="shape-simple-4-6" value={otherPrices.shapeSimple4to6.toString()} onChange={(e) => updateOtherPrice('shapeSimple4to6', e.target.value)} step="0.01" />
                <Input label="Simple Shape 8-12mm ($)" type="number" name="shape-simple-8-12" value={otherPrices.shapeSimple8to12.toString()} onChange={(e) => updateOtherPrice('shapeSimple8to12', e.target.value)} step="0.01" />
                <Input label="Complex Shape 4-6mm ($)" type="number" name="shape-complex-4-6" value={otherPrices.shapeComplex4to6.toString()} onChange={(e) => updateOtherPrice('shapeComplex4to6', e.target.value)} step="0.01" />
                <Input label="Complex Shape 8-12mm ($)" type="number" name="shape-complex-8-12" value={otherPrices.shapeComplex8to12.toString()} onChange={(e) => updateOtherPrice('shapeComplex8to12', e.target.value)} step="0.01" />
              </div>
            </Row>

            <br />
            <Row>
              <div style={{ flex: 1 }}>
                <Text>
                  <strong>ADDITIONAL SERVICES</strong>
                </Text>
                <Input label="Ceramic Banding ($)" type="number" name="ceramic" value={otherPrices.ceramicBanding.toString()} onChange={(e) => updateOtherPrice('ceramicBanding', e.target.value)} step="0.01" />
                <Input label="Scanning Service ($)" type="number" name="scanning" value={otherPrices.scanning.toString()} onChange={(e) => updateOtherPrice('scanning', e.target.value)} step="0.01" />
              </div>
            </Row>
          </Card>

          <br />
          <RowSpaceBetween>
            <ActionButton onClick={hasChanges ? handleSave : undefined}>{hasChanges ? 'Save All Changes' : 'No Changes to Save'}</ActionButton>
            <ActionButton onClick={hasChanges ? handleReset : undefined}>Reset to Defaults</ActionButton>
          </RowSpaceBetween>
        </CardDouble>

        <RowSpaceBetween></RowSpaceBetween>

        <Row>
          <ActionBar
            items={[
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
          />
        </Row>
      </Grid>
    </DefaultLayout>
  );
}
