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
import { GlassType, EdgeworkType, GlassThickness, ShapeType, GlassSpecification, CostBreakdown, calculateCost, getAvailableThicknesses, getAvailableGlassTypes, glassTypeToRGB, SavedCalculation, generateCalculationId } from '@utils/calculations';
import { useRouter } from 'next/navigation';
import DropdownMenuTrigger from '@components/DropdownMenuTrigger';
import DefaultActionBar from '@components/page/DefaultActionBar';
import DataTable from '@components/DataTable';
import { createClient } from '@utils/supabase/client';
import { usePricing } from '@components/PricingProvider';

const glassThicknesses: GlassThickness[] = [4, 5, 6, 8, 10, 12];

const edgeWorkOptions: EdgeworkType[] = ['ROUGH ARRIS', 'FLAT GRIND - STRAIGHT', 'FLAT GRIND - CURVED', 'FLAT POLISH - STRAIGHT', 'FLAT POLISH - CURVED'];

const navigationItems = [
  { icon: '⊹', children: 'Glass Costing', href: '/costing' },
  { icon: '⊹', children: 'Doors', href: '/doors' },
  { icon: '⊹', children: 'Client Management', href: '/costing/clients' },
  { icon: '⊹', children: 'Pricing Settings', href: '/settings' },
  { icon: '⊹', children: 'Component Library', href: '/' },
];

const TABLE_NAME = 'quotes';

export default function CostingDashboard() {
  const router = useRouter();
  const { pricingData } = usePricing();
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
    scanning: false,
  });

  const [costs, setCosts] = useState<CostBreakdown>({
    baseGlass: 0,
    edgework: 0,
    holes: 0,
    shape: 0,
    ceramic: 0,
    scanning: 0,
    total: 0,
  });

  const [availableThicknesses, setAvailableThicknesses] = useState<GlassThickness[]>([]);
  const [availableTypes, setAvailableTypes] = useState<GlassType[]>([]);

  const [savedCalculations, setSavedCalculations] = useState<SavedCalculation[]>([]);
  const [calculationName, setCalculationName] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [markupPercent, setMarkupPercent] = useState(20);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editingQuoteName, setEditingQuoteName] = useState('');

  useEffect(() => {
    // Recalculate costs whenever specifications change
    try {
      const newCosts = calculateCost(spec, pricingData);
      setCosts(newCosts);
    } catch (error) {
      console.error('Calculation error:', error);
    }
  }, [spec, pricingData]);

  useEffect(() => {
    // When thickness changes, ensure glass type is valid for new thickness
    const availableTypes = getAvailableGlassTypes(spec.thickness);
    if (!availableTypes.includes(spec.glassType)) {
      handleSpecChange('glassType', availableTypes[0]);
    }
  }, [spec.thickness]);

  // Load saved calculations from Supabase on mount
  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from(TABLE_NAME).select('*').order('date', { ascending: false });

        if (error) throw error;
        if (data) setSavedCalculations(data);
      } catch (error) {
        console.error('Error loading saved calculations:', error);
        setSavedCalculations([]);
      }
    };

    fetchQuotes();
  }, []);

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

  const handleSaveCalculation = async () => {
    if (!calculationName) return;

    const subtotal = costs.baseGlass + costs.edgework + costs.holes + costs.shape + costs.ceramic + costs.scanning;
    const totalWithMarkup = subtotal * (1 + markupPercent / 100);

    try {
      const supabase = createClient();

      if (editingQuoteId) {
        // Update existing quote with all properties
        const { error } = await supabase
          .from(TABLE_NAME)
          .update({
            name: calculationName,
            specification: { ...spec },
            cost: {
              baseGlass: costs.baseGlass,
              edgework: costs.edgework,
              holes: costs.holes,
              shape: costs.shape,
              ceramic: costs.ceramic,
              scanning: costs.scanning,
              total: totalWithMarkup,
            },
            date: new Date().toISOString(),
          })
          .eq('id', editingQuoteId);

        if (error) throw error;

        // Update local state
        setSavedCalculations((prev) =>
          prev.map((calc) =>
            calc.id === editingQuoteId
              ? {
                  ...calc,
                  name: calculationName,
                  specification: { ...spec },
                  cost: {
                    baseGlass: costs.baseGlass,
                    edgework: costs.edgework,
                    holes: costs.holes,
                    shape: costs.shape,
                    ceramic: costs.ceramic,
                    scanning: costs.scanning,
                    total: totalWithMarkup,
                  },
                  date: new Date().toISOString(),
                }
              : calc
          )
        );
        setEditingQuoteId(null);
      } else {
        // Create new quote - remove id property to let Supabase generate it
        const newCalculation = {
          name: calculationName,
          client: selectedClient || 'No Client',
          specification: { ...spec },
          cost: {
            baseGlass: costs.baseGlass,
            edgework: costs.edgework,
            holes: costs.holes,
            shape: costs.shape,
            ceramic: costs.ceramic,
            scanning: costs.scanning,
            total: totalWithMarkup,
          },
          date: new Date().toISOString(),
        };

        // Insert and get the new data with server-generated ID
        const { data, error } = await supabase.from(TABLE_NAME).insert(newCalculation).select();

        if (error) throw error;

        // Update local state with the returned data (which includes the DB-generated ID)
        if (data && data.length > 0) {
          setSavedCalculations((prev) => [...prev, data[0]]);
        }
      }

      setCalculationName('');
      setShowSaveDialog(false);
    } catch (error) {
      console.error('Error saving calculation:', error);
    }
  };

  const handleEditQuote = (quote: SavedCalculation) => {
    setEditingQuoteId(quote.id);
    setCalculationName(quote.name);
    setSpec(quote.specification);
    setSelectedClient(quote.client);
    setShowSaveDialog(true);
  };

  const handleDeleteCalculation = async (id: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);

      if (error) throw error;

      // Update local state
      setSavedCalculations((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error('Error deleting calculation:', error);
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
          {/* <RowSpaceBetween>
            <Select name="client" options={['Acme Glass Co', 'BuildRight Inc', 'Modern Facades LLC']} defaultValue={selectedClient} onChange={(value) => setSelectedClient(value)} placeholder="Select Client..." />
            <ActionButton>+ New Client</ActionButton>
          </RowSpaceBetween>
          <br /> */}

          <Text>GLASS THICKNESS (MM)</Text>
          <Select name="thickness" options={getAvailableThicknesses(spec.glassType, pricingData.basePrices).map((t) => t.toString())} defaultValue={spec.thickness.toString()} onChange={(value) => handleSpecChange('thickness', parseInt(value))} placeholder="Select thickness..." />
          <br />

          <Text>GLASS TYPE</Text>
          <Select name="glass_type" options={getAvailableGlassTypes(spec.thickness)} defaultValue={spec.glassType} onChange={(value) => handleSpecChange('glassType', value)} placeholder="Select glass type..." />
          <br />

          <Text>DIMENSIONS</Text>
          <Input label="HEIGHT (MM)" type="number" name="length" value={spec.width.toString()} onChange={(e) => handleSpecChange('width', parseFloat(e.target.value))} />
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
          <Checkbox name="scanning" defaultChecked={spec.scanning} onChange={(e) => handleSpecChange('scanning', e.target.checked)}>
            Scanning
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
                <TableColumn>Scanning</TableColumn>
                <TableColumn>${costs.scanning.toFixed(2)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Subtotal</TableColumn>
                <TableColumn>${(costs.baseGlass + costs.edgework + costs.holes + costs.shape + costs.ceramic + costs.scanning).toFixed(2)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>Markup ({markupPercent}%)</TableColumn>
                <TableColumn>${((costs.baseGlass + costs.edgework + costs.holes + costs.shape + costs.ceramic + costs.scanning) * (markupPercent / 100)).toFixed(2)}</TableColumn>
              </TableRow>
              <TableRow>
                <TableColumn>TOTAL</TableColumn>
                <TableColumn>${((costs.baseGlass + costs.edgework + costs.holes + costs.shape + costs.ceramic + costs.scanning) * (1 + markupPercent / 100)).toFixed(2)}</TableColumn>
              </TableRow>
            </Table>
          </Card>

          <br />
          <RowSpaceBetween>
            <ActionButton onClick={() => setShowSaveDialog(true)}>Save Quote</ActionButton>
          </RowSpaceBetween>

          {showSaveDialog && (
            <Card title={editingQuoteId ? 'EDIT QUOTE' : 'SAVE QUOTE'}>
              <Input label="QUOTE NAME" name="quote_name" value={calculationName} onChange={(e) => setCalculationName(e.target.value)} placeholder="Enter a name for this quote..." />
              <br />
              <RowSpaceBetween>
                <ActionButton onClick={handleSaveCalculation}>{editingQuoteId ? 'Update' : 'Save'}</ActionButton>
                <ActionButton
                  onClick={() => {
                    setShowSaveDialog(false);
                    setEditingQuoteId(null);
                    setCalculationName('');
                  }}
                >
                  Cancel
                </ActionButton>
              </RowSpaceBetween>
            </Card>
          )}
        </CardDouble>

        <Card title="QUOTES">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '25ch' }}>NAME</TableColumn>
              <TableColumn style={{ width: '20ch' }}>DATE</TableColumn>
              <TableColumn style={{ width: '20ch' }}>PRICE</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>
            {savedCalculations.map((calc) => (
              <TableRow key={calc.id}>
                <TableColumn>{calc.name}</TableColumn>
                <TableColumn>{new Date(calc.date).toLocaleDateString()}</TableColumn>
                <TableColumn>${calc.cost.total.toFixed(2)}</TableColumn>
                <TableColumn>
                  <RowSpaceBetween>
                    <ActionButton onClick={() => handleEditQuote(calc)}>Edit</ActionButton>
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
                onClick: () => router.push('/settings'),
              },
            ]}
          />
        </Row>
      </Grid>
    </DefaultLayout>
  );
}
