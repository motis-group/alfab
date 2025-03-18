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
import RadioButtonGroup from '@components/RadioButtonGroup';
import Row from '@components/Row';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableRow from '@components/TableRow';
import TableColumn from '@components/TableColumn';
import Text from '@components/Text';

export default async function SettingsPage() {
  return (
    <DefaultLayout previewPixelSRC="/glass-icon.png">
      <Navigation logo="⬡" left={<ActionButton>PRICING RULES</ActionButton>} right={<ActionButton>SIGN OUT</ActionButton>} />

      <Grid>
        <Row>
          PRICING RULES <Badge>SYSTEM SETTINGS</Badge>
        </Row>

        <ActionBar
          items={[
            {
              hotkey: '⌘+S',
              body: 'Save Changes',
            },
            {
              hotkey: '⌘+R',
              body: 'Reset All',
            },
            {
              hotkey: '⌘+B',
              body: 'Back to Dashboard',
            },
          ]}
        />

        <CardDouble title="BASE GLASS PRICES (PER M²)">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '20ch' }}>GLASS TYPE</TableColumn>
              <TableColumn style={{ width: '10ch' }}>4MM</TableColumn>
              <TableColumn style={{ width: '10ch' }}>5MM</TableColumn>
              <TableColumn style={{ width: '10ch' }}>6MM</TableColumn>
              <TableColumn style={{ width: '10ch' }}>8MM</TableColumn>
              <TableColumn style={{ width: '10ch' }}>10MM</TableColumn>
              <TableColumn>12MM</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>CLEAR</TableColumn>
              <TableColumn>$83.96</TableColumn>
              <TableColumn>$87.59</TableColumn>
              <TableColumn>$92.47</TableColumn>
              <TableColumn>$200.63</TableColumn>
              <TableColumn>$221.78</TableColumn>
              <TableColumn>$270.74</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>TINTED</TableColumn>
              <TableColumn>$102.19</TableColumn>
              <TableColumn>$104.61</TableColumn>
              <TableColumn>$109.50</TableColumn>
              <TableColumn>$242.79</TableColumn>
              <TableColumn>$267.62</TableColumn>
              <TableColumn>$292.06</TableColumn>
            </TableRow>
          </Table>
          <br />
          <ActionButton>Edit Base Prices</ActionButton>
        </CardDouble>

        <CardDouble title="EDGEWORK PRICES (PER LINEAR METER)">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '30ch' }}>TYPE</TableColumn>
              <TableColumn style={{ width: '15ch' }}>4-6MM</TableColumn>
              <TableColumn>8-12MM</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>ROUGH ARRIS</TableColumn>
              <TableColumn>$0.00</TableColumn>
              <TableColumn>$0.00</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>FLAT GRIND - STRAIGHT</TableColumn>
              <TableColumn>$4.31</TableColumn>
              <TableColumn>$7.59</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>FLAT GRIND - CURVED</TableColumn>
              <TableColumn>$8.85</TableColumn>
              <TableColumn>$17.67</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>FLAT POLISH - STRAIGHT</TableColumn>
              <TableColumn>$4.56</TableColumn>
              <TableColumn>$8.85</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>FLAT POLISH - CURVED</TableColumn>
              <TableColumn>$12.66</TableColumn>
              <TableColumn>$25.27</TableColumn>
            </TableRow>
          </Table>
          <br />
          <ActionButton>Edit Edgework Prices</ActionButton>
        </CardDouble>

        <CardDouble title="ADDITIONAL PROCESSING">
          <Table>
            <TableRow>
              <TableColumn style={{ width: '30ch' }}>PROCESS</TableColumn>
              <TableColumn style={{ width: '15ch' }}>4-6MM</TableColumn>
              <TableColumn>8-12MM</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Holes (per hole)</TableColumn>
              <TableColumn>$6.33</TableColumn>
              <TableColumn>$8.85</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Complex Shape</TableColumn>
              <TableColumn>$12.65</TableColumn>
              <TableColumn>$25.27</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Simple Shape</TableColumn>
              <TableColumn>$7.59</TableColumn>
              <TableColumn>$12.65</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Ceramic Banding (≤1.5m²)</TableColumn>
              <TableColumn colSpan={2}>$63.68 flat rate</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Ceramic Banding ({'>'}1.5m²)</TableColumn>
              <TableColumn colSpan={2}>$63.68 per m²</TableColumn>
            </TableRow>
          </Table>
          <br />
          <ActionButton>Edit Processing Prices</ActionButton>
        </CardDouble>

        <Card title="QUICK ACTIONS">
          <ActionListItem icon="⭢" href="/costing">
            Return to Dashboard
          </ActionListItem>
          <ActionListItem icon="⭢" href="/costing/clients">
            Manage Clients
          </ActionListItem>
          <ActionListItem icon="⭢" href="/costing/templates">
            View Templates
          </ActionListItem>
        </Card>
      </Grid>
    </DefaultLayout>
  );
}
