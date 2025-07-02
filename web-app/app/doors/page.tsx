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

const glassThicknesses: GlassThickness[] = [4, 5, 6, 8, 10, 12];

const edgeWorkOptions: EdgeworkType[] = ['ROUGH ARRIS', 'FLAT GRIND - STRAIGHT', 'FLAT GRIND - CURVED', 'FLAT POLISH - STRAIGHT', 'FLAT POLISH - CURVED'];

const navigationItems = [
  { icon: '⊹', children: 'Glass Costing', href: '/' },
  { icon: '⊹', children: 'Client Management', href: '/costing/clients' },
  { icon: '⊹', children: 'Pricing Rules', href: '/settings' },
  { icon: '⊹', children: 'Component Library', href: '/' },
];

// Replace localStorage key with Supabase table name
const TABLE_NAME = 'doors';

// Door interface
interface Door {
  id?: string;
  price: number;
  order_date: string;
  delivery_date: string;
  client: string;
  notes: string;
}

export default function DoorsDashboard() {
  const router = useRouter();

  // State for the form
  const [doorData, setDoorData] = useState<Door>({
    price: 0,
    order_date: new Date().toISOString().split('T')[0],
    delivery_date: '',
    client: '',
    notes: '',
  });

  // State for saved doors
  const [doors, setDoors] = useState<Door[]>([]);

  // State for showing the add/edit form
  const [showForm, setShowForm] = useState(false);

  // State for tracking if we're editing or adding
  const [isEditing, setIsEditing] = useState(false);

  // Load saved doors from Supabase on mount
  useEffect(() => {
    const fetchDoors = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from(TABLE_NAME).select('*').order('order_date', { ascending: false });

        if (error) throw error;
        if (data) setDoors(data);
      } catch (error) {
        console.error('Error loading saved doors:', error);
        setDoors([]);
      }
    };

    fetchDoors();
  }, []);

  const handleInputChange = (field: keyof Door, value: any) => {
    setDoorData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveDoor = async () => {
    try {
      const supabase = createClient();

      if (isEditing && doorData.id) {
        // Update existing door
        const { error } = await supabase
          .from(TABLE_NAME)
          .update({
            price: doorData.price,
            order_date: doorData.order_date,
            delivery_date: doorData.delivery_date,
            client: doorData.client,
            notes: doorData.notes,
          })
          .eq('id', doorData.id);

        if (error) throw error;

        // Update local state
        setDoors((prev) => prev.map((door) => (door.id === doorData.id ? { ...doorData } : door)));
      } else {
        // Create new door without id (Supabase will generate)
        const newDoor = {
          price: doorData.price,
          order_date: doorData.order_date,
          delivery_date: doorData.delivery_date,
          client: doorData.client,
          notes: doorData.notes,
        };

        // Insert and get the new data with server-generated ID
        const { data, error } = await supabase.from(TABLE_NAME).insert(newDoor).select();

        if (error) throw error;

        // Update local state with the returned data
        if (data && data.length > 0) {
          setDoors((prev) => [...prev, data[0]]);
        }
      }

      // Reset form
      setDoorData({
        price: 0,
        order_date: new Date().toISOString().split('T')[0],
        delivery_date: '',
        client: '',
        notes: '',
      });
      setShowForm(false);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving door:', error);
    }
  };

  const handleEditDoor = (door: Door) => {
    setDoorData(door);
    setIsEditing(true);
    setShowForm(true);
  };

  const handleDeleteDoor = async (id: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);

      if (error) throw error;

      // Update local state
      setDoors((prev) => prev.filter((door) => door.id !== id));
    } catch (error) {
      console.error('Error deleting door:', error);
    }
  };

  return (
    <DefaultLayout previewPixelSRC="/pixel.gif">
      <br />
      <br />
      <Navigation
        logo="🚪"
        left={
          <DropdownMenuTrigger items={navigationItems}>
            <ActionButton>DOOR MANAGEMENT</ActionButton>
          </DropdownMenuTrigger>
        }
        right={<ActionButton>SIGN OUT</ActionButton>}
      />

      <Grid>
        <DefaultActionBar />

        <RowSpaceBetween>
          <Text>DOORS DATABASE</Text>
          <ActionButton
            onClick={() => {
              setIsEditing(false);
              setShowForm(true);
              setDoorData({
                price: 0,
                order_date: new Date().toISOString().split('T')[0],
                delivery_date: '',
                client: '',
                notes: '',
              });
            }}
          >
            + Add New Door
          </ActionButton>
        </RowSpaceBetween>

        {showForm && (
          <CardDouble title={isEditing ? 'EDIT DOOR' : 'ADD NEW DOOR'}>
            <Text>DOOR DETAILS</Text>

            <Text>DESCRIPTION</Text>
            <Input label="DESCRIPTION" type="text" name="notes" value={doorData.notes} onChange={(e) => handleInputChange('notes', e.target.value)} />
            <br />

            <Text>PRICING</Text>
            <Input label="PRICE ($)" type="number" name="price" value={doorData.price.toString()} onChange={(e) => handleInputChange('price', parseFloat(e.target.value))} />
            <br />

            <Text>DATES</Text>
            <Input label="ORDER DATE" type="date" name="order_date" value={doorData.order_date} onChange={(e) => handleInputChange('order_date', e.target.value)} />
            <Input label="DELIVERY DATE" type="date" name="delivery_date" value={doorData.delivery_date} onChange={(e) => handleInputChange('delivery_date', e.target.value)} />
            <br />

            <Text>CLIENT</Text>
            <Input label="CLIENT NAME" type="text" name="client" value={doorData.client} onChange={(e) => handleInputChange('client', e.target.value)} />
            <br />

            <RowSpaceBetween>
              <ActionButton onClick={handleSaveDoor}>{isEditing ? 'Update Door' : 'Save Door'}</ActionButton>
              <ActionButton
                onClick={() => {
                  setShowForm(false);
                  setIsEditing(false);
                }}
              >
                Cancel
              </ActionButton>
            </RowSpaceBetween>
          </CardDouble>
        )}

        <Card title="DOORS INVENTORY">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '15ch' }}>PRICE</TableColumn>
              <TableColumn style={{ width: '15ch' }}>ORDER DATE</TableColumn>
              <TableColumn style={{ width: '15ch' }}>DELIVERY DATE</TableColumn>
              <TableColumn style={{ width: '20ch' }}>CLIENT</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>

            {doors.map((door) => (
              <TableRow key={door.id}>
                <TableColumn>${door.price.toFixed(2)}</TableColumn>
                <TableColumn>{new Date(door.order_date).toLocaleDateString()}</TableColumn>
                <TableColumn>{door.delivery_date ? new Date(door.delivery_date).toLocaleDateString() : 'Not set'}</TableColumn>
                <TableColumn>{door.client || 'No Client'}</TableColumn>
                <TableColumn>
                  <RowSpaceBetween>
                    <ActionButton onClick={() => handleEditDoor(door)}>Edit</ActionButton>
                    <ActionButton onClick={() => handleDeleteDoor(door.id!)}>Delete</ActionButton>
                  </RowSpaceBetween>
                </TableColumn>
              </TableRow>
            ))}

            {doors.length === 0 && (
              <TableRow>
                <TableColumn colSpan={5} style={{ textAlign: 'center' }}>
                  No doors added yet. Add a new door to get started.
                </TableColumn>
              </TableRow>
            )}
          </Table>
          <br />
          <RowSpaceBetween>
            <Text>TOTAL DOORS</Text>
            <Text>{doors.length}</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>TOTAL VALUE</Text>
            <Text>${doors.reduce((sum, door) => sum + door.price, 0).toFixed(2)}</Text>
          </RowSpaceBetween>
        </Card>

        <Row>
          <ActionBar
            items={[
              {
                hotkey: '⌘+N',
                body: 'New Door',
                onClick: () => {
                  setIsEditing(false);
                  setShowForm(true);
                  setDoorData({
                    price: 0,
                    order_date: new Date().toISOString().split('T')[0],
                    delivery_date: '',
                    client: '',
                    notes: '',
                  });
                },
              },
              {
                hotkey: '⌘+C',
                body: 'Clients',
                onClick: () => router.push('/costing/clients'),
              },
            ]}
          />
        </Row>
      </Grid>
    </DefaultLayout>
  );
}
