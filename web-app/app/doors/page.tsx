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

const glassThicknesses: GlassThickness[] = [4, 5, 6, 8, 10, 12];

const edgeWorkOptions: EdgeworkType[] = ['ROUGH ARRIS', 'FLAT GRIND - STRAIGHT', 'FLAT GRIND - CURVED', 'FLAT POLISH - STRAIGHT', 'FLAT POLISH - CURVED'];

const navigationItems = [
  { icon: '⊹', children: 'Glass Costing', href: '/' },
  { icon: '⊹', children: 'Client Management', href: '/costing/clients' },
  { icon: '⊹', children: 'Pricing Rules', href: '/costing/settings' },
  { icon: '⊹', children: 'Component Library', href: '/' },
];

// Make sure the storage key is unique to avoid conflicts
const STORAGE_KEY = 'alfabdoors_saved_doors_v1';

// Door interface
interface Door {
  id: string;
  price: number;
  orderDate: string;
  deliveryDate: string;
  client: string;
  notes: string;
}

export default function DoorsDashboard() {
  const router = useRouter();

  // State for the form
  const [doorData, setDoorData] = useState<Door>({
    id: '',
    price: 0,
    orderDate: new Date().toISOString().split('T')[0],
    deliveryDate: '',
    client: '',
    notes: '',
  });

  // State for saved doors with initial load flag
  const [doors, setDoors] = useState<Door[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // State for showing the add/edit form
  const [showForm, setShowForm] = useState(false);

  // State for tracking if we're editing or adding
  const [isEditing, setIsEditing] = useState(false);

  // Load saved doors from localStorage on mount with better error handling
  useEffect(() => {
    try {
      console.log('Attempting to load doors from localStorage');
      const saved = localStorage.getItem(STORAGE_KEY);
      console.log('Raw localStorage data:', saved);

      if (saved) {
        const parsedData = JSON.parse(saved);
        console.log('Parsed doors data:', parsedData);
        setDoors(parsedData);
        console.log('Doors loaded successfully');
      } else {
        console.log('No saved doors found in localStorage');
        setDoors([]);
      }
    } catch (error) {
      console.error('Error loading saved doors:', error);
      // Initialize with empty array if there's an error
      setDoors([]);
    } finally {
      // Mark initial load as complete
      setIsInitialLoad(false);
    }
  }, []);

  // Save doors to localStorage whenever they change with improved logging
  // Only save if it's not the initial load
  useEffect(() => {
    if (!isInitialLoad) {
      try {
        console.log('Saving doors to localStorage:', doors);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doors));
        console.log('Doors saved successfully');

        // Verify the save worked
        const savedData = localStorage.getItem(STORAGE_KEY);
        console.log('Verification - data in localStorage:', savedData);
      } catch (error) {
        console.error('Error saving doors:', error);
      }
    }
  }, [doors, isInitialLoad]);

  const handleInputChange = (field: keyof Door, value: any) => {
    setDoorData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveDoor = () => {
    try {
      if (isEditing) {
        // Update existing door
        setDoors((prev) => prev.map((door) => (door.id === doorData.id ? { ...doorData } : door)));
      } else {
        // Create new door with unique ID
        const newDoor: Door = {
          ...doorData,
          id: Math.random().toString(36).substring(2, 9),
        };
        setDoors((prev) => [...prev, newDoor]);
      }

      // Reset form
      setDoorData({
        id: '',
        price: 0,
        orderDate: new Date().toISOString().split('T')[0],
        deliveryDate: '',
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

  const handleDeleteDoor = (id: string) => {
    try {
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
                id: '',
                price: 0,
                orderDate: new Date().toISOString().split('T')[0],
                deliveryDate: '',
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
            <Input label="ORDER DATE" type="date" name="orderDate" value={doorData.orderDate} onChange={(e) => handleInputChange('orderDate', e.target.value)} />
            <Input label="DELIVERY DATE" type="date" name="deliveryDate" value={doorData.deliveryDate} onChange={(e) => handleInputChange('deliveryDate', e.target.value)} />
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
                <TableColumn>{new Date(door.orderDate).toLocaleDateString()}</TableColumn>
                <TableColumn>{door.deliveryDate ? new Date(door.deliveryDate).toLocaleDateString() : 'Not set'}</TableColumn>
                <TableColumn>{door.client || 'No Client'}</TableColumn>
                <TableColumn>
                  <RowSpaceBetween>
                    <ActionButton onClick={() => handleEditDoor(door)}>Edit</ActionButton>
                    <ActionButton onClick={() => handleDeleteDoor(door.id)}>Delete</ActionButton>
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
                    id: '',
                    price: 0,
                    orderDate: new Date().toISOString().split('T')[0],
                    deliveryDate: '',
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
