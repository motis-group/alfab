/**
 * Whether the labour estimates are true.
 *
 * An awning is costed at 330 minutes and a window at whatever its table says, and both numbers came
 * off sheets written years ago. Nothing measured them, so nothing corrected them: the estimate could
 * only age. Labour is the largest single line on an awning, so an estimate that is 20 percent light
 * is a fifth of the job's biggest cost, quoted away on every order.
 *
 * A line records the minutes it actually took. This compares that against what the costing predicted
 * and reports the gap next to the rate that would fix it.
 *
 * Estimates are recomputed on today's rates rather than the rates that priced the job. The labour
 * minute tables are the thing under test, so measuring against the current table is what says
 * whether the current table is right.
 */

import { AwningCostingInput, costAwning } from '@utils/awning-costing';
import { AwningRates } from '@utils/awning-costing-rates';
import { WindowCostingInput, costWindow } from '@utils/window-costing';
import { WindowRates } from '@utils/window-costing-rates';

export type EstimateKind = 'window' | 'awning';

/** One completed line with its spec and what it really took. */
export interface MeasuredLine {
  kind: EstimateKind;
  quantity: number;
  actualMinutes: number;
  windowSpec?: WindowCostingInput | null;
  awningSpec?: AwningCostingInput | null;
  /** For naming the worst offenders back to the user. */
  label?: string;
}

export interface LineAccuracy {
  label: string;
  kind: EstimateKind;
  quantity: number;
  estimatedMinutes: number;
  actualMinutes: number;
  /** Actual over estimated. 1.2 means the job took a fifth longer than costed. */
  ratio: number;
}

export interface AccuracySummary {
  kind: EstimateKind;
  lines: number;
  /** Units across every measured line, not only the ones listed in `worst`. */
  units: number;
  estimatedMinutes: number;
  actualMinutes: number;
  /** Actual over estimated across every measured line, or null when nothing is measured. */
  ratio: number | null;
  /** The measured lines, worst overrun first. */
  worst: LineAccuracy[];
}

/** A gap smaller than this is noise in how the hours were written down, not a wrong estimate. */
export const MATERIAL_RATIO = 0.1;

function estimatedFor(line: MeasuredLine, windowRates: WindowRates, awningRates: AwningRates): number | null {
  if (line.kind === 'window' && line.windowSpec) {
    // The window costing already divides setup across the quantity on the spec, so its total is for
    // one window and the line multiplies back up.
    const result = costWindow(line.windowSpec, windowRates);
    return result.minutes.total * Math.max(1, line.quantity);
  }
  if (line.kind === 'awning' && line.awningSpec) {
    const result = costAwning(line.awningSpec, awningRates);
    return result.minutes.total * Math.max(1, line.quantity);
  }
  return null;
}

/**
 * Compare measured lines against what the costing predicts, by kind. Lines with no recorded minutes
 * or no spec are skipped: an unmeasured job is reported as unmeasured, never as on time.
 */
export function measureAccuracy(lines: MeasuredLine[], windowRates: WindowRates, awningRates: AwningRates): AccuracySummary[] {
  const kinds: EstimateKind[] = ['window', 'awning'];

  return kinds.map((kind) => {
    const measured: LineAccuracy[] = [];

    for (const line of lines) {
      if (line.kind !== kind || !(line.actualMinutes > 0)) {
        continue;
      }
      const estimated = estimatedFor(line, windowRates, awningRates);
      if (estimated == null || estimated <= 0) {
        continue;
      }
      measured.push({
        label: line.label || (kind === 'window' ? 'Window' : 'Awning'),
        kind,
        quantity: Math.max(1, line.quantity),
        estimatedMinutes: estimated,
        actualMinutes: line.actualMinutes,
        ratio: line.actualMinutes / estimated,
      });
    }

    const estimatedMinutes = measured.reduce((sum, entry) => sum + entry.estimatedMinutes, 0);
    const actualMinutes = measured.reduce((sum, entry) => sum + entry.actualMinutes, 0);

    return {
      kind,
      lines: measured.length,
      units: measured.reduce((sum, entry) => sum + entry.quantity, 0),
      estimatedMinutes,
      actualMinutes,
      ratio: estimatedMinutes > 0 ? actualMinutes / estimatedMinutes : null,
      worst: measured.sort((a, b) => b.ratio - a.ratio).slice(0, 5),
    };
  });
}

/** One sentence about what the gap means, or null when there is nothing to say yet. */
export function describeAccuracy(summary: AccuracySummary): string | null {
  if (summary.ratio == null) {
    return null;
  }

  const off = summary.ratio - 1;
  const noun = summary.kind === 'window' ? 'windows' : 'awnings';
  if (Math.abs(off) < MATERIAL_RATIO) {
    return `The ${noun} estimate is holding up across ${summary.lines} measured ${summary.lines === 1 ? 'line' : 'lines'}.`;
  }
  const direction = off > 0 ? 'longer than costed' : 'less than costed';
  return `${noun[0].toUpperCase()}${noun.slice(1)} are taking ${Math.abs(Math.round(off * 100))}% ${direction}, across ${summary.lines} measured ${summary.lines === 1 ? 'line' : 'lines'}. The labour minutes below are what to change.`;
}

/** What the per-unit minutes would have to be for the estimate to have matched. */
export function impliedMinutesPerUnit(summary: AccuracySummary): number | null {
  return summary.units > 0 ? summary.actualMinutes / summary.units : null;
}
