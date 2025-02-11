'use client';

import '@root/global.scss';

import * as Constants from '@common/constants';
import * as Utilities from '@common/utilities';

import ActionBar from '@components/ActionBar';
import ActionButton from '@components/ActionButton';
import ActionListItem from '@components/ActionListItem';
import Badge from '@components/Badge';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import Checkbox from '@components/Checkbox';
import DefaultLayout from '@components/page/DefaultLayout';
import Grid from '@components/Grid';
import Input from '@components/Input';
import Navigation from '@components/Navigation';
import RadioButtonGroup from '@components/RadioButtonGroup';
import Row from '@components/Row';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Select from '@components/Select';
import Table from '@components/Table';
import TableRow from '@components/TableRow';
import TableColumn from '@components/TableColumn';
import Text from '@components/Text';
import { useState, useEffect } from 'react';
import { GlassType, EdgeworkType, GlassThickness, ShapeType, GlassSpecification, CostBreakdown, calculateCost, getAvailableThicknesses, getAvailableGlassTypes, glassTypeToRGB, SavedCalculation, generateCalculationId } from './utils/calculations';
import { useRouter } from 'next/navigation';
import DropdownMenuTrigger from '@components/DropdownMenuTrigger';
import DefaultActionBar from '@components/page/DefaultActionBar';
import DataTable from '@components/DataTable';

const glassThicknesses: GlassThickness[] = [4, 5, 6, 8, 10, 12];

const edgeWorkOptions: EdgeworkType[] = ['ROUGH ARRIS', 'FLAT GRIND - STRAIGHT', 'FLAT GRIND - CURVED', 'FLAT POLISH - STRAIGHT', 'FLAT POLISH - CURVED'];

const navigationItems = [
  { icon: '⊹', children: 'Glass Costing', href: '/costing' },
  { icon: '⊹', children: 'Client Management', href: '/costing/clients' },
  { icon: '⊹', children: 'Pricing Rules', href: '/costing/settings' },
  { icon: '⊹', children: 'Component Library', href: '/' },
];

const STORAGE_KEY = 'alfabglass_saved_calculations';

export default function CostingDashboard() {
  const router = useRouter();
  const [spec, setSpec] = useState<GlassSpecification>({
    width: 0,
    height: 0,
    thickness: 4,
    glassType: 'Clear',
    edgework: 'ROUGH ARRIS',
    ceramicBand: false,
    shape: 'RECTANGLE',
    holes: false,
    numHoles: 0,
    radiusCorners: false,
  });

  const [costs, setCosts] = useState<CostBreakdown>({
    baseGlass: 0,
    edgework: 0,
    holes: 0,
    shape: 0,
    ceramic: 0,
    total: 0,
  });

  const [availableThicknesses, setAvailableThicknesses] = useState<GlassThickness[]>([]);
  const [availableTypes, setAvailableTypes] = useState<GlassType[]>([]);

  const [savedCalculations, setSavedCalculations] = useState<SavedCalculation[]>([]);
  const [calculationName, setCalculationName] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [markupPercent, setMarkupPercent] = useState(20);

  useEffect(() => {
    // Recalculate costs whenever specifications change
    try {
      const newCosts = calculateCost(spec);
      setCosts(newCosts);
    } catch (error) {
      console.error('Calculation error:', error);
    }
  }, [spec]);

  useEffect(() => {
    // When thickness changes, ensure glass type is valid for new thickness
    const availableTypes = getAvailableGlassTypes(spec.thickness);
    if (!availableTypes.includes(spec.glassType)) {
      handleSpecChange('glassType', availableTypes[0]);
    }
  }, [spec.thickness]);

  // Load saved calculations from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsedData = JSON.parse(saved);
        setSavedCalculations(parsedData);
      }
    } catch (error) {
      console.error('Error loading saved calculations:', error);
      // Initialize with empty array if there's an error
      setSavedCalculations([]);
    }
  }, []);

  // Save calculations to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedCalculations));
    } catch (error) {
      console.error('Error saving calculations:', error);
    }
  }, [savedCalculations]);

  const handleSpecChange = (field: keyof GlassSpecification, value: any) => {
    setSpec((prev) => {
      const newSpec = { ...prev, [field]: value };

      // Handle special cases
      if (field === 'holes' && !value) {
        newSpec.numHoles = 0;
      }
      if (field === 'holes' && value) {
        newSpec.numHoles = 4; // Default to 4 holes when enabled
      }
      if (field === 'radiusCorners' && value) {
        newSpec.edgework = 'FLAT POLISH - CURVED';
      }

      return newSpec;
    });
  };

  const handleSaveCalculation = () => {
    if (!calculationName) return;

    const subtotal = costs.baseGlass + costs.edgework + costs.holes + costs.shape + costs.ceramic;
    const totalWithMarkup = subtotal * (1 + markupPercent / 100);

    try {
      const newCalculation: SavedCalculation = {
        id: generateCalculationId(),
        name: calculationName,
        client: selectedClient || 'No Client',
        specification: { ...spec },
        cost: {
          baseGlass: costs.baseGlass,
          edgework: costs.edgework,
          holes: costs.holes,
          shape: costs.shape,
          ceramic: costs.ceramic,
          total: totalWithMarkup,
        },
        date: new Date().toISOString(),
      };

      setSavedCalculations((prev) => [...prev, newCalculation]);
      setCalculationName('');
      setShowSaveDialog(false);
    } catch (error) {
      console.error('Error saving calculation:', error);
    }
  };

  const handleLoadCalculation = (calc: SavedCalculation) => {
    setSpec(calc.specification);
    setSelectedClient(calc.client);
  };

  const handleDeleteCalculation = (id: string) => {
    try {
      setSavedCalculations((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error('Error deleting calculation:', error);
      // Could add user notification here
    }
  };

  return (
    <DefaultLayout previewPixelSRC="/pixel.gif">
      <br />
      <br />
      <Navigation
        logo="⬡"
        left={
          <DropdownMenuTrigger items={navigationItems}>
            <ActionButton>GLASS COSTING</ActionButton>
          </DropdownMenuTrigger>
        }
        right={<ActionButton>SIGN OUT</ActionButton>}
      />

      <Grid>
        <DefaultActionBar />

        <CardDouble title="NEW GLASS SPECIFICATION">
          <RowSpaceBetween>
            <Select name="client" options={['Acme Glass Co', 'BuildRight Inc', 'Modern Facades LLC']} defaultValue={selectedClient} onChange={(value) => setSelectedClient(value)} placeholder="Select Client..." />
            <ActionButton>+ New Client</ActionButton>
          </RowSpaceBetween>
          <br />

          <Text>GLASS THICKNESS (MM)</Text>
          <Select name="thickness" options={getAvailableThicknesses(spec.glassType).map((t) => t.toString())} defaultValue={spec.thickness.toString()} onChange={(value) => handleSpecChange('thickness', parseInt(value))} placeholder="Select thickness..." />
          <br />

          <Text>GLASS TYPE</Text>
          <Select name="glass_type" options={getAvailableGlassTypes(spec.thickness)} defaultValue={spec.glassType} onChange={(value) => handleSpecChange('glassType', value)} placeholder="Select glass type..." />
          <br />

          <Text>DIMENSIONS</Text>
          <Input label="LENGTH (MM)" type="number" name="length" value={spec.width.toString()} onChange={(e) => handleSpecChange('width', parseFloat(e.target.value))} />
          <Input label="WIDTH (MM)" type="number" name="width" value={spec.height.toString()} onChange={(e) => handleSpecChange('height', parseFloat(e.target.value))} />

          <Text>PRICING</Text>
          <Input label="MARKUP (%)" type="number" name="markup" value={markupPercent.toString()} onChange={(e) => setMarkupPercent(Number(e.target.value))} isBlink={false} />
          <br />

          <Text>EDGEWORK</Text>
          <Select name="edgework" options={edgeWorkOptions} defaultValue={spec.edgework} onChange={(value) => handleSpecChange('edgework', value)} placeholder="Select edgework type..." />
          <br />

          <Text>ADDITIONAL OPTIONS</Text>
          <Checkbox name="ceramic_band" defaultChecked={spec.ceramicBand} onChange={(e) => handleSpecChange('ceramicBand', e.target.checked)}>
            Ceramic Banding
          </Checkbox>
          <Checkbox name="holes" defaultChecked={spec.holes} onChange={(e) => handleSpecChange('holes', e.target.checked)}>
            Include Holes
          </Checkbox>

          <Input label="NUMBER OF HOLES" type="number" name="num_holes" value={spec.numHoles.toString()} onChange={(e) => handleSpecChange('numHoles', parseInt(e.target.value))} disabled={!spec.holes} placeholder="Enter number of holes..." />

          <Text>SHAPE TYPE</Text>
          <RadioButtonGroup
            defaultValue={spec.shape}
            onChange={(value) => handleSpecChange('shape', value)}
            options={[
              { value: 'RECTANGLE', label: 'Rectangle' },
              { value: 'SIMPLE', label: 'Simple Shape' },
              { value: 'COMPLEX', label: 'Complex Shape' },
            ]}
          />

          <br />
          <Card title="PRICE BREAKDOWN">
            <Table>
              <TableRow>
                <TableColumn style={{ width: '20ch' }}>COMPONENT</TableColumn>
                <TableColumn>COST</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Base Glass</TableColumn>
                <TableColumn>${costs.baseGlass.toFixed(2)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Edgework</TableColumn>
                <TableColumn>${costs.edgework.toFixed(2)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Holes</TableColumn>
                <TableColumn>${costs.holes.toFixed(2)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Shape</TableColumn>
                <TableColumn>${costs.shape.toFixed(2)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Ceramic</TableColumn>
                <TableColumn>${costs.ceramic.toFixed(2)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Subtotal</TableColumn>
                <TableColumn>${(costs.baseGlass + costs.edgework + costs.holes + costs.shape + costs.ceramic).toFixed(2)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Markup ({markupPercent}%)</TableColumn>
                <TableColumn>${((costs.baseGlass + costs.edgework + costs.holes + costs.shape + costs.ceramic) * (markupPercent / 100)).toFixed(2)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>TOTAL</TableColumn>
                <TableColumn>${((costs.baseGlass + costs.edgework + costs.holes + costs.shape + costs.ceramic) * (1 + markupPercent / 100)).toFixed(2)}</TableColumn>
              </TableRow>
            </Table>
          </Card>

          <br />
          <RowSpaceBetween>
            <ActionButton onClick={() => setShowSaveDialog(true)}>Save Quote</ActionButton>
          </RowSpaceBetween>

          {showSaveDialog && (
            <Card title="SAVE QUOTE">
              <Input label="QUOTE NAME" name="quote_name" value={calculationName} onChange={(e) => setCalculationName(e.target.value)} placeholder="Enter a name for this quote..." />
              <br />
              <RowSpaceBetween>
                <ActionButton onClick={handleSaveCalculation}>Save</ActionButton>
                <ActionButton onClick={() => setShowSaveDialog(false)}>Cancel</ActionButton>
              </RowSpaceBetween>
            </Card>
          )}
        </CardDouble>

        <Card title="QUOTES">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '20ch' }}>NAME</TableColumn>
              <TableColumn style={{ width: '20ch' }}>CLIENT</TableColumn>
              <TableColumn style={{ width: '15ch' }}>DATE</TableColumn>
              <TableColumn style={{ width: '15ch' }}>PRICE</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>
            {savedCalculations.map((calc) => (
              <TableRow key={calc.id}>
                <TableColumn>{calc.name}</TableColumn>
                <TableColumn>{calc.client}</TableColumn>
                <TableColumn>{new Date(calc.date).toLocaleDateString()}</TableColumn>
                <TableColumn>${calc.cost.total.toFixed(2)}</TableColumn>
                <TableColumn>
                  <RowSpaceBetween>
                    <ActionButton onClick={() => handleLoadCalculation(calc)}>Load</ActionButton>
                    <ActionButton onClick={() => handleDeleteCalculation(calc.id)}>Delete</ActionButton>
                  </RowSpaceBetween>
                </TableColumn>
              </TableRow>
            ))}
          </Table>
          <br />
          <RowSpaceBetween>
            <Text>GRAND TOTAL</Text>
            <Text>${savedCalculations.reduce((sum, calc) => sum + calc.cost.total, 0).toFixed(2)}</Text>
          </RowSpaceBetween>
        </Card>

        <RowSpaceBetween></RowSpaceBetween>

        <Row>
          <ActionBar
            items={[
              {
                hotkey: '⌘+C',
                body: 'Clients',
                onClick: () => router.push('/costing/clients'),
              },
              {
                hotkey: '⌘+S',
                body: 'Rules',
                onClick: () => router.push('/costing/settings'),
              },
            ]}
          />
        </Row>
      </Grid>
    </DefaultLayout>
  );
}
