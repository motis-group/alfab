import Card from '@components/Card';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Text from '@components/Text';

import { LastAddedLine as LastAdded } from '@utils/line-editing';

/**
 * The line that the calculator added to the quote last.
 *
 * The calculator stays open after Add To Quote and keeps the settings of that line. This card names
 * the line and its measurements, so the operator knows which item of the job comes next.
 */
export default function LastAddedLine({ line, documentLabel }: { line: LastAdded | undefined; documentLabel: string }) {
  if (!line) {
    return null;
  }

  return (
    <Card title="LAST ADDED">
      <Text>
        <span className="status-success">Saved to {documentLabel}.</span>
      </Text>
      <RowSpaceBetween>
        <Text>{line.lineLabel.toUpperCase()}</Text>
        <Text>{line.name || '—'}</Text>
      </RowSpaceBetween>
      {line.sizes.map((size) => (
        <RowSpaceBetween key={size.label}>
          <Text>{size.label}</Text>
          <Text>{size.mm} mm</Text>
        </RowSpaceBetween>
      ))}
    </Card>
  );
}
