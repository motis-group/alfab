'use client';

import Card from '@components/Card';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Text from '@components/Text';

import { AccuracySummary, MATERIAL_RATIO, describeAccuracy, impliedMinutesPerUnit } from '@utils/estimate-accuracy';

/**
 * What the shop floor says about the labour estimate, shown on the rates page beside the minutes it
 * would change. Measuring the gap somewhere else would leave someone to carry the number across.
 */
export default function EstimateAccuracyCard({ summary, title = 'ESTIMATE AGAINST ACTUAL' }: { summary: AccuracySummary; title?: string }) {
  const sentence = describeAccuracy(summary);
  const implied = impliedMinutesPerUnit(summary);
  const off = summary.ratio == null ? 0 : summary.ratio - 1;
  const material = Math.abs(off) >= MATERIAL_RATIO;

  return (
    <Card title={title}>
      {summary.ratio == null ? (
        <>
          <Text>No finished line has its actual time recorded yet.</Text>
          <Text style={{ opacity: 0.7 }}>Type the minutes on an order line when the job is done. After a handful, this says whether the labour minutes below are true.</Text>
        </>
      ) : (
        <>
          <RowSpaceBetween>
            <Text>ACTUAL OVER ESTIMATED</Text>
            <Text>
              <span className={material ? 'status-warning' : 'status-success'}>{Math.round(summary.ratio * 100)}%</span>
            </Text>
          </RowSpaceBetween>
          <Text>
            <span className={material ? 'status-warning' : undefined}>{sentence}</span>
          </Text>
          <RowSpaceBetween>
            <Text>MEASURED</Text>
            <Text>
              {summary.lines} {summary.lines === 1 ? 'line' : 'lines'}, {summary.units} off
            </Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>ESTIMATED</Text>
            <Text>{Math.round(summary.estimatedMinutes)} min</Text>
          </RowSpaceBetween>
          <RowSpaceBetween>
            <Text>ACTUAL</Text>
            <Text>{Math.round(summary.actualMinutes)} min</Text>
          </RowSpaceBetween>
          {implied != null && material ? <Text style={{ opacity: 0.7 }}>At the measured rate that is about {Math.round(implied)} minutes each. Compare it against the per-unit minutes below before changing anything.</Text> : null}
          <Text style={{ opacity: 0.7 }}>Estimates are recomputed on the current rates, so this measures the table as it stands today.</Text>
        </>
      )}
    </Card>
  );
}
