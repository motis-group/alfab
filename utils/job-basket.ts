/**
 * One job, whatever it is made of.
 *
 * A boat needs windows, awnings and cut glass. Each was priced on its own page, saved as its own
 * quote and sent as its own purchase order, so the customer got three numbers and somebody added
 * them up by hand. The basket is the layer above the three calculators: each one stages its own
 * items as before, then adds them to the job, and the job becomes one order.
 *
 * It lives in session storage because a job is built by walking between pages and is finished in
 * one sitting. Nothing here is the record of anything — a saved quote and a purchase order are.
 */

import { GlassSpecification } from '@utils/calculations';
import { AwningCostingInput } from '@utils/awning-costing';
import { WindowCostingInput } from '@utils/window-costing';

const STORAGE_KEY = 'alfabJobBasket';

export type JobLineKind = 'window' | 'awning' | 'glass';

interface JobLineBase {
  /** Local to the basket, for removing one line. */
  id: string;
  kind: JobLineKind;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface WindowJobLine extends JobLineBase {
  kind: 'window';
  windowSpec: WindowCostingInput;
  ratesUpdatedAt: string | null;
}

export interface AwningJobLine extends JobLineBase {
  kind: 'awning';
  awningSpec: AwningCostingInput;
  ratesUpdatedAt: string | null;
}

export interface GlassJobLine extends JobLineBase {
  kind: 'glass';
  spec: GlassSpecification;
  markupPercent: number;
}

export type JobLine = WindowJobLine | AwningJobLine | GlassJobLine;

export interface Job {
  name: string;
  customerName: string;
  customerId: string | null;
  notes: string;
  lines: JobLine[];
}

export const EMPTY_JOB: Job = { name: '', customerName: '', customerId: null, notes: '', lines: [] };

export const JOB_KIND_LABELS: Record<JobLineKind, string> = {
  window: 'Window',
  awning: 'Awning',
  glass: 'Glass',
};

export function jobLineId(kind: JobLineKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function jobTotal(lines: JobLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

/** How many of each kind the job holds, for a one-line summary. */
export function jobBreakdown(lines: JobLine[]): Array<{ kind: JobLineKind; count: number; total: number }> {
  const kinds: JobLineKind[] = ['window', 'awning', 'glass'];
  return kinds
    .map((kind) => {
      const own = lines.filter((line) => line.kind === kind);
      return { kind, count: own.reduce((sum, line) => sum + line.quantity, 0), total: jobTotal(own) };
    })
    .filter((entry) => entry.count > 0);
}

/** "2 windows, 6 awnings and 1 glass piece", for a heading. */
export function describeJob(lines: JobLine[]): string {
  const parts = jobBreakdown(lines).map((entry) => {
    const noun = entry.kind === 'glass' ? 'glass piece' : JOB_KIND_LABELS[entry.kind].toLowerCase();
    return `${entry.count} ${noun}${entry.count === 1 ? '' : 's'}`;
  });

  if (!parts.length) {
    return 'Nothing on this job yet';
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function isJobLine(value: unknown): value is JobLine {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const line = value as Record<string, unknown>;
  if (typeof line.id !== 'string' || typeof line.quantity !== 'number' || typeof line.unitPrice !== 'number') {
    return false;
  }
  if (line.kind === 'window') {
    return Boolean(line.windowSpec) && typeof line.windowSpec === 'object';
  }
  if (line.kind === 'awning') {
    return Boolean(line.awningSpec) && typeof line.awningSpec === 'object';
  }
  if (line.kind === 'glass') {
    return Boolean(line.spec) && typeof line.spec === 'object';
  }
  return false;
}

/** A stored job, with anything unrecognised dropped rather than trusted. */
export function normalizeJob(value: unknown): Job {
  if (!value || typeof value !== 'object') {
    return { ...EMPTY_JOB, lines: [] };
  }
  const job = value as Record<string, unknown>;
  return {
    name: typeof job.name === 'string' ? job.name : '',
    customerName: typeof job.customerName === 'string' ? job.customerName : '',
    customerId: typeof job.customerId === 'string' && job.customerId ? job.customerId : null,
    notes: typeof job.notes === 'string' ? job.notes : '',
    lines: Array.isArray(job.lines) ? (job.lines.filter(isJobLine) as JobLine[]) : [],
  };
}

export function readJob(): Job {
  if (typeof window === 'undefined') {
    return { ...EMPTY_JOB, lines: [] };
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? normalizeJob(JSON.parse(raw)) : { ...EMPTY_JOB, lines: [] };
  } catch {
    return { ...EMPTY_JOB, lines: [] };
  }
}

export function writeJob(job: Job): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(job));
    // The basket is shown on every calculator page; this lets an open page notice a change.
    window.dispatchEvent(new CustomEvent('alfab-job-changed'));
  } catch {
    // A full or blocked session store is not worth failing a quote over.
  }
}

export function addToJob(lines: JobLine[], details?: Partial<Omit<Job, 'lines'>>): Job {
  const current = readJob();
  const next: Job = {
    // Details already set on the job win: the first page to name the customer names it for the job.
    name: current.name || details?.name || '',
    customerName: current.customerName || details?.customerName || '',
    customerId: current.customerId || details?.customerId || null,
    notes: current.notes || details?.notes || '',
    lines: [...current.lines, ...lines],
  };
  writeJob(next);
  return next;
}

export function removeJobLine(id: string): Job {
  const current = readJob();
  const next = { ...current, lines: current.lines.filter((line) => line.id !== id) };
  writeJob(next);
  return next;
}

export function updateJobDetails(details: Partial<Omit<Job, 'lines'>>): Job {
  const next = { ...readJob(), ...details };
  writeJob(next);
  return next;
}

export function clearJob(): Job {
  const empty = { ...EMPTY_JOB, lines: [] };
  writeJob(empty);
  return empty;
}
