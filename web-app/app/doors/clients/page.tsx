import '@root/global.scss';

import ActionBar from '@components/ActionBar';
import ActionButton from '@components/ActionButton';
import ActionListItem from '@components/ActionListItem';
import Badge from '@components/Badge';
import Card from '@components/Card';
import CardDouble from '@components/CardDouble';
import DefaultLayout from '@components/page/DefaultLayout';
import Grid from '@components/Grid';
import Input from '@components/Input';
import Navigation from '@components/Navigation';
import NumberRangeSlider from '@components/NumberRangeSlider';
import Row from '@components/Row';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableRow from '@components/TableRow';
import TableColumn from '@components/TableColumn';
import Text from '@components/Text';

export default async function ClientsPage() {
  return (
    <DefaultLayout previewPixelSRC="/glass-icon.png">
      <Navigation logo="⬡" left={<ActionButton>CLIENTS</ActionButton>} right={<ActionButton>SIGN OUT</ActionButton>} />

      <Grid>
        <Row>
          CLIENT MANAGEMENT <Badge>12 ACTIVE</Badge>
        </Row>

        <ActionBar
          items={[
            {
              hotkey: '⌘+N',
              body: 'New Client',
            },
            {
              hotkey: '⌘+F',
              body: 'Find Client',
            },
            {
              hotkey: '⌘+B',
              body: 'Back to Dashboard',
            },
          ]}
        />

        <CardDouble title="NEW CLIENT">
          <Input label="COMPANY NAME" name="company_name" placeholder="Enter company name..." />
          <Input label="CONTACT NAME" name="contact_name" placeholder="Enter primary contact name..." />
          <Input label="EMAIL" type="email" name="email" placeholder="Enter contact email..." />
          <Input label="PHONE" name="phone" placeholder="Enter contact phone..." />

          <Text>DEFAULT MARKUP PERCENTAGE</Text>
          <NumberRangeSlider defaultValue={30} min={0} max={100} step={1} />

          <br />
          <RowSpaceBetween>
            <ActionButton>Save Client</ActionButton>
            <ActionButton>Clear Form</ActionButton>
          </RowSpaceBetween>
        </CardDouble>

        <Card title="ACTIVE CLIENTS">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '25ch' }}>COMPANY</TableColumn>
              <TableColumn style={{ width: '20ch' }}>CONTACT</TableColumn>
              <TableColumn style={{ width: '15ch' }}>DEFAULT MARKUP</TableColumn>
              <TableColumn style={{ width: '15ch' }}>QUOTES</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Acme Glass Co</TableColumn>
              <TableColumn>John Smith</TableColumn>
              <TableColumn>30%</TableColumn>
              <TableColumn>24</TableColumn>
              <TableColumn>
                <ActionButton>Edit</ActionButton>
              </TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>BuildRight Inc</TableColumn>
              <TableColumn>Sarah Johnson</TableColumn>
              <TableColumn>25%</TableColumn>
              <TableColumn>18</TableColumn>
              <TableColumn>
                <ActionButton>Edit</ActionButton>
              </TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Modern Facades LLC</TableColumn>
              <TableColumn>Mike Wilson</TableColumn>
              <TableColumn>35%</TableColumn>
              <TableColumn>31</TableColumn>
              <TableColumn>
                <ActionButton>Edit</ActionButton>
              </TableColumn>
            </TableRow>
          </Table>
        </Card>

        <Card title="QUICK ACTIONS">
          <ActionListItem icon="⭢" href="/costing">
            Return to Dashboard
          </ActionListItem>
          <ActionListItem icon="⭢" href="/costing/templates">
            View Templates
          </ActionListItem>
          <ActionListItem icon="⭢" href="/settings">
            Pricing Rules
          </ActionListItem>
        </Card>
      </Grid>
    </DefaultLayout>
  );
}
