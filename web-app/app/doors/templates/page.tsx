import '@root/global.scss';

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

// Import types from calculations
type GlassType = 'CLEAR' | 'TINTED' | 'BRONZE' | 'SUPER GREY' | 'WHITE PATTERNED' | 'DARK GREY';
type EdgeworkType = 'ROUGH ARRIS' | 'FLAT GRIND - STRAIGHT' | 'FLAT GRIND - CURVED' | 'FLAT POLISH - STRAIGHT' | 'FLAT POLISH - CURVED';
type GlassThickness = 4 | 5 | 6 | 8 | 10 | 12;

const glassThicknesses: GlassThickness[] = [4, 5, 6, 8, 10, 12];

const edgeWorkOptions: EdgeworkType[] = [
  'ROUGH ARRIS',
  'FLAT GRIND - STRAIGHT',
  'FLAT GRIND - CURVED',
  'FLAT POLISH - STRAIGHT',
  'FLAT POLISH - CURVED'
];

export default async function TemplatesPage() {
  return (
    <DefaultLayout previewPixelSRC="/glass-icon.png">
      <Navigation logo="⬡" left={<ActionButton>TEMPLATES</ActionButton>} right={<ActionButton>SIGN OUT</ActionButton>} />

      <Grid>
        <Row>
          GLASS TEMPLATES <Badge>8 SAVED</Badge>
        </Row>

        <ActionBar
          items={[
            {
              hotkey: '⌘+N',
              body: 'New Template',
            },
            {
              hotkey: '⌘+F',
              body: 'Find Template',
            },
            {
              hotkey: '⌘+B',
              body: 'Back to Dashboard',
            },
          ]}
        />

        <CardDouble title="NEW TEMPLATE">
          <Input label="TEMPLATE NAME" name="template_name" placeholder="Enter template name..." />
          <Input label="DESCRIPTION" name="description" placeholder="Enter template description..." />
          
          <Text>GLASS TYPE</Text>
          <Select
            name="glass_type"
            options={[
              'CLEAR',
              'TINTED',
              'BRONZE',
              'SUPER GREY',
              'WHITE PATTERNED',
              'DARK GREY'
            ]}
            placeholder="Select glass type..."
          />
          <br />

          <Text>GLASS THICKNESS (MM)</Text>
          <Select
            name="thickness"
            options={glassThicknesses.map(t => t.toString())}
            placeholder="Select thickness..."
          />
          <br />

          <Text>DIMENSIONS</Text>
          <Input label="LENGTH (MM)" type="number" name="length" />
          <Input label="WIDTH (MM)" type="number" name="width" />
          
          <Text>EDGEWORK</Text>
          <Select
            name="edgework"
            options={edgeWorkOptions}
            placeholder="Select edgework type..."
          />
          <br />

          <Text>ADDITIONAL OPTIONS</Text>
          <Checkbox name="ceramic_full_cover">Ceramic Full Cover</Checkbox>
          <Checkbox name="ceramic_banding">Ceramic Banding</Checkbox>
          <Checkbox name="holes">Include Holes</Checkbox>
          
          <Input 
            label="NUMBER OF HOLES" 
            type="number" 
            name="num_holes" 
            placeholder="Enter number of holes..."
            disabled={true}
          />

          <Text>SHAPE TYPE</Text>
          <RadioButtonGroup
            defaultValue="RECTANGLE"
            options={[
              { value: 'RECTANGLE', label: 'Rectangle' },
              { value: 'SIMPLE', label: 'Simple Shape' },
              { value: 'COMPLEX', label: 'Complex Shape' },
            ]}
          />
          
          <br />
          <RowSpaceBetween>
            <ActionButton>Save Template</ActionButton>
            <ActionButton>Clear Form</ActionButton>
          </RowSpaceBetween>
        </CardDouble>

        <Card title="SAVED TEMPLATES">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '20ch' }}>NAME</TableColumn>
              <TableColumn style={{ width: '15ch' }}>TYPE</TableColumn>
              <TableColumn style={{ width: '15ch' }}>THICKNESS</TableColumn>
              <TableColumn style={{ width: '15ch' }}>DIMENSIONS</TableColumn>
              <TableColumn style={{ width: '10ch' }}>USES</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Standard Window</TableColumn>
              <TableColumn>CLEAR</TableColumn>
              <TableColumn>10mm</TableColumn>
              <TableColumn>1000x2000</TableColumn>
              <TableColumn>42</TableColumn>
              <TableColumn>
                <RowSpaceBetween>
                  <ActionButton>Use</ActionButton>
                  <ActionButton>Edit</ActionButton>
                </RowSpaceBetween>
              </TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Shower Door</TableColumn>
              <TableColumn>CLEAR</TableColumn>
              <TableColumn>8mm</TableColumn>
              <TableColumn>800x2100</TableColumn>
              <TableColumn>28</TableColumn>
              <TableColumn>
                <RowSpaceBetween>
                  <ActionButton>Use</ActionButton>
                  <ActionButton>Edit</ActionButton>
                </RowSpaceBetween>
              </TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Storefront</TableColumn>
              <TableColumn>TINTED</TableColumn>
              <TableColumn>12mm</TableColumn>
              <TableColumn>2400x3000</TableColumn>
              <TableColumn>15</TableColumn>
              <TableColumn>
                <RowSpaceBetween>
                  <ActionButton>Use</ActionButton>
                  <ActionButton>Edit</ActionButton>
                </RowSpaceBetween>
              </TableColumn>
            </TableRow>
          </Table>
        </Card>

        <Card title="QUICK ACTIONS">
          <ActionListItem icon="⭢" href="/costing">
            Return to Dashboard
          </ActionListItem>
          <ActionListItem icon="⭢" href="/costing/clients">
            Manage Clients
          </ActionListItem>
          <ActionListItem icon="⭢" href="/costing/settings">
            Pricing Rules
          </ActionListItem>
        </Card>
      </Grid>
    </DefaultLayout>
  );
} 