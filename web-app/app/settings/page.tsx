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

const navigationItems = [
  { icon: '⊹', children: 'Glass Costing', href: '/' },
  { icon: '⊹', children: 'Doors', href: '/doors' },
  { icon: '⊹', children: 'Client Management', href: '/costing/clients' },
  { icon: '⊹', children: 'Pricing Settings', href: '/settings' },
  { icon: '⊹', children: 'Component Library', href: '/examples' },
];

// Default pricing data structure
const defaultBasePrices: Record<GlassType, Partial<Record<GlassThickness, number>>> = {
  Clear: {
    4: 83.96,
    5: 87.59,
    6: 92.47,
    8: 200.63,
    10: 221.78,
    12: 270.74,
  },
  Green: {
    4: 102.19,
    5: 104.61,
    6: 109.5,
    8: 242.79,
    10: 267.62,
    12: 292.06,
  },
  Grey: {
    4: 102.19,
    5: 104.61,
    6: 109.5,
    8: 242.79,
    10: 267.62,
    12: 292.06,
  },
  'Dark Grey': {
    5: 128.97,
  },
  'Super Grey': {
    6: 198.12,
  },
};

const defaultEdgeworkPrices: Record<EdgeworkType, Record<'4-6' | '8-12', number>> = {
  'ROUGH ARRIS': { '4-6': 0, '8-12': 0 },
  'FLAT GRIND - STRAIGHT': { '4-6': 4.31, '8-12': 7.59 },
  'FLAT GRIND - CURVED': { '4-6': 8.85, '8-12': 17.67 },
  'FLAT POLISH - STRAIGHT': { '4-6': 4.56, '8-12': 8.85 },
  'FLAT POLISH - CURVED': { '4-6': 12.66, '8-12': 25.27 },
};

interface OtherPrices {
  holePrice4to6: number;
  holePrice8to12: number;
  shapeSimple4to6: number;
  shapeSimple8to12: number;
  shapeComplex4to6: number;
  shapeComplex8to12: number;
  ceramicBanding: number;
  scanning: number;
}

const defaultOtherPrices: OtherPrices = {
  holePrice4to6: 6.33,
  holePrice8to12: 8.85,
  shapeSimple4to6: 7.59,
  shapeSimple8to12: 12.65,
  shapeComplex4to6: 12.65,
  shapeComplex8to12: 25.27,
  ceramicBanding: 63.68,
  scanning: 90,
};

export default function PricingSettings() {
  const router = useRouter();
  const [basePrices, setBasePrices] = useState(defaultBasePrices);
  const [edgeworkPrices, setEdgeworkPrices] = useState(defaultEdgeworkPrices);
  const [otherPrices, setOtherPrices] = useState(defaultOtherPrices);
  const [hasChanges, setHasChanges] = useState(false);

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

  const updateOtherPrice = (field: keyof OtherPrices, value: string) => {
    const numValue = parseFloat(value) || 0;
    setOtherPrices((prev) => ({
      ...prev,
      [field]: numValue,
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // TODO: Save to backend/localStorage
    console.log('Saving pricing settings...', { basePrices, edgeworkPrices, otherPrices });
    setHasChanges(false);
    // You would typically save to a database or local storage here
  };

  const handleReset = () => {
    setBasePrices(defaultBasePrices);
    setEdgeworkPrices(defaultEdgeworkPrices);
    setOtherPrices(defaultOtherPrices);
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
