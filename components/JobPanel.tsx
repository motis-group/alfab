'use client';

import { useCallback, useEffect, useState } from 'react';

import ActionButton from '@components/ActionButton';
import CardDouble from '@components/CardDouble';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { formatCurrency } from '@utils/order-management';
import { JOB_KIND_LABELS, Job, clearJob, describeJob, jobBreakdown, jobTotal, readJob, removeJobLine } from '@utils/job-basket';

/** Keeps a page in step with the basket, which any of the three calculators can change. */
export function useJob(): [Job, (next: Job) => void] {
  const [job, setJob] = useState<Job>(() => ({ name: '', customerName: '', customerId: null, notes: '', lines: [] }));

  const refresh = useCallback(() => setJob(readJob()), []);

  useEffect(() => {
    refresh();
    window.addEventListener('alfab-job-changed', refresh);
    return () => window.removeEventListener('alfab-job-changed', refresh);
  }, [refresh]);

  return [job, setJob];
}

interface JobPanelProps {
  job: Job;
  onChange: (job: Job) => void;
  /** Sends the whole job to a new purchase order. */
  onCreateOrder: () => void;
}

/**
 * Items assembled for one purchase order, whichever calculator priced them. Shown on the order list,
 * which is where the order it becomes is created.
 */
export default function JobPanel({ job, onChange, onCreateOrder }: JobPanelProps) {
  const breakdown = jobBreakdown(job.lines);
  const total = jobTotal(job.lines);

  return (
    <CardDouble title={`ORDER IN PROGRESS — ${describeJob(job.lines).toUpperCase()}`}>
      {job.lines.length ? (
        <>
          <Text>One purchase order, one line per item.</Text>
          <br />
          <Table>
            <TableRow>
              <TableColumn style={{ width: '10ch' }}>TYPE</TableColumn>
              <TableColumn style={{ width: '34ch' }}>ITEM</TableColumn>
              <TableColumn style={{ width: '7ch' }}>QTY</TableColumn>
              <TableColumn style={{ width: '13ch' }}>EACH</TableColumn>
              <TableColumn style={{ width: '13ch' }}>TOTAL</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableRow>
            {job.lines.map((line) => (
              <TableRow key={line.id}>
                <TableColumn>{JOB_KIND_LABELS[line.kind]}</TableColumn>
                <TableColumn>{line.description}</TableColumn>
                <TableColumn>{line.quantity}</TableColumn>
                <TableColumn>{formatCurrency(line.unitPrice)}</TableColumn>
                <TableColumn>{formatCurrency(line.quantity * line.unitPrice)}</TableColumn>
                <TableColumn>
                  <ActionButton onClick={() => onChange(removeJobLine(line.id))}>Remove</ActionButton>
                </TableColumn>
              </TableRow>
            ))}
          </Table>
          <br />

          {breakdown.length > 1 ? (
            <>
              {breakdown.map((entry) => (
                <RowSpaceBetween key={entry.kind}>
                  <Text>{JOB_KIND_LABELS[entry.kind].toUpperCase()}</Text>
                  <Text>{formatCurrency(entry.total)}</Text>
                </RowSpaceBetween>
              ))}
              <br />
            </>
          ) : null}

          <RowSpaceBetween>
            <Text>JOB TOTAL</Text>
            <Text>
              <span className="status-pill status-pill-success">{formatCurrency(total)}</span>
            </Text>
          </RowSpaceBetween>
          <br />
          <RowSpaceBetween>
            <ActionButton onClick={onCreateOrder}>Create Purchase Order For The Job</ActionButton>
            <ActionButton
              onClick={() => {
                if (window.confirm('Clear this job?')) {
                  onChange(clearJob());
                }
              }}
            >
              Clear Job
            </ActionButton>
          </RowSpaceBetween>
        </>
      ) : (
        <Text>Nothing on this job.</Text>
      )}
    </CardDouble>
  );
}
