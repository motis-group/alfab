'use client';

import styles from '@components/OrderImportPanel.module.scss';

import * as React from 'react';
import * as Utilities from '@common/utilities';

import ActionButton from '@components/ActionButton';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { usePricing } from '@components/PricingProvider';
import { calculateCost, getEffectiveArea, usesMeasuredGeometry } from '@utils/calculations';
import { shapeName } from '@utils/cad';
import { ExtractedPiece, IMPORT_ACCEPT_ATTRIBUTE, ImportReading } from '@utils/import/model';
import { formatCurrency } from '@utils/order-management';

interface OrderImportPanelProps {
  onAdd: (pieces: ExtractedPiece[]) => void;
  disabled?: boolean;
  /** A file chosen elsewhere. Set when the panel shares one drop zone with another importer. */
  file?: File | null;
  /** Off when a parent owns the drop zone, so the page does not show two of them. */
  showDropZone?: boolean;
  /** Told when a read starts and stops, so a parent's drop zone can say so. */
  onBusyChange?: (busy: boolean) => void;
}

interface PanelError {
  message: string;
  hint: string;
}

interface ReviewRow {
  piece: ExtractedPiece;
  include: boolean;
  quantity: number;
  unitCost: number | null;
  costError: string | null;
}

export default function OrderImportPanel({ onAdd, disabled = false, file = null, showDropZone = true, onBusyChange }: OrderImportPanelProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const { pricingData } = usePricing();

  const [reading, setReading] = React.useState<ImportReading | null>(null);
  const [rows, setRows] = React.useState<ReviewRow[]>([]);
  const [isReading, setIsReading] = React.useState(false);
  const [error, setError] = React.useState<PanelError | null>(null);
  const [isDragActive, setIsDragActive] = React.useState(false);

  // Priced here rather than on the server: the shop's own rates live in the browser's pricing
  // context, and a reviewer deciding whether a read is right wants the number they will quote.
  React.useEffect(() => {
    setRows((previous) =>
      previous.map((row) => {
        try {
          return { ...row, unitCost: calculateCost(row.piece.spec, pricingData).total, costError: null };
        } catch (costError: any) {
          return { ...row, unitCost: null, costError: costError?.message || 'This piece cannot be priced.' };
        }
      })
    );
  }, [pricingData, reading]);

  React.useEffect(() => {
    if (file) {
      handleFile(file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  async function handleFile(file: File | null | undefined) {
    if (!file || disabled) {
      return;
    }

    setIsReading(true);
    onBusyChange?.(true);
    setError(null);
    setReading(null);
    setRows([]);

    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/import', { method: 'POST', body });
      const payload = await response.json();

      if (!response.ok) {
        setError({ message: payload?.error || 'The order could not be read.', hint: payload?.hint || '' });
        return;
      }

      const next = payload as ImportReading;
      setReading(next);
      setRows(next.pieces.map((piece) => ({ piece, include: true, quantity: piece.quantity, unitCost: null, costError: null })));
    } catch (fetchError: any) {
      setError({ message: fetchError?.message || 'The order could not be read.', hint: 'Check the connection and try again.' });
    } finally {
      setIsReading(false);
      onBusyChange?.(false);
    }
  }

  function openFileDialog() {
    if (!disabled) {
      inputRef.current?.click();
    }
  }

  function clearAll() {
    setReading(null);
    setRows([]);
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function addSelected() {
    const selected = rows.filter((row) => row.include && !row.costError).map((row) => ({ ...row.piece, quantity: Math.max(1, row.quantity) }));
    if (selected.length) {
      onAdd(selected);
      clearAll();
    }
  }

  const selectedRows = rows.filter((row) => row.include && !row.costError);
  const selectedPieces = selectedRows.reduce((total, row) => total + Math.max(1, row.quantity), 0);
  const selectedCost = selectedRows.reduce((total, row) => total + (row.unitCost || 0) * Math.max(1, row.quantity), 0);
  const unpriceable = rows.filter((row) => row.costError).length;

  return (
    <div className={styles.root}>
      {showDropZone ? (
        <>
      <input ref={inputRef} className={styles.hiddenInput} type="file" accept={IMPORT_ACCEPT_ATTRIBUTE} disabled={disabled} tabIndex={-1} aria-hidden="true" onChange={(event) => handleFile(event.target.files?.[0])} />

      <div
        className={Utilities.classNames(styles.dropZone, isDragActive ? styles.dropZoneActive : null, disabled ? styles.dropZoneDisabled : null)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Upload a customer's order (PDF or Word)"
        onClick={openFileDialog}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFileDialog();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
            setIsDragActive(true);
          }
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragActive(false);
          handleFile(event.dataTransfer?.files?.[0]);
        }}
      >
        <span className={styles.dropZoneTitle}>{isReading ? 'Reading the order…' : reading ? 'Drop another order to replace' : "Drop the customer's order here or click to choose"}</span>
        <span className={styles.dropZoneHint}>PDF · Word — a typed cut list or a drawing. Every piece is read for you to check before it goes on the quote.</span>
      </div>
        </>
      ) : null}

      {error ? (
        <>
          <br />
          <Text>
            <span className="status-error">{error.message}</span>
          </Text>
          {error.hint ? (
            <Text>
              <span className="status-warning">{error.hint}</span>
            </Text>
          ) : null}
        </>
      ) : null}

      {reading ? (
        <>
          <br />
          <RowSpaceBetween>
            <Text>ORDER</Text>
            <Text>
              {reading.fileName} · {reading.pieces.length} piece{reading.pieces.length === 1 ? '' : 's'}
            </Text>
          </RowSpaceBetween>
          <Text className={styles.subtle}>{reading.specSummary}</Text>

          {reading.warnings.length ? (
            <>
              <br />
              <Text>
                <span className="status-warning">CHECK BEFORE QUOTING</span>
              </Text>
              <ul className={styles.list}>
                {reading.warnings.map((warning, index) => (
                  <li key={index}>
                    <Text>{warning}</Text>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <Table>
            <TableRow>
              <TableColumn style={{ width: '4ch' }}>USE</TableColumn>
              <TableColumn>PIECE</TableColumn>
              <TableColumn style={{ width: '18ch' }}>SHAPE</TableColumn>
              <TableColumn style={{ width: '8ch' }}>QTY</TableColumn>
              <TableColumn style={{ width: '12ch' }}>COST EACH</TableColumn>
            </TableRow>
            {rows.map((row, index) => (
              <TableRow key={index}>
                <TableColumn>
                  <input
                    type="checkbox"
                    checked={row.include}
                    disabled={!!row.costError}
                    aria-label={`Put ${row.piece.name || 'this piece'} on the quote`}
                    onChange={(event) => setRows((previous) => previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, include: event.target.checked } : entry)))}
                  />
                </TableColumn>
                <TableColumn>
                  {row.piece.spec.width} × {row.piece.spec.height} mm
                  {row.piece.confidence === 'check' ? <span className="status-warning"> · check against the drawing</span> : null}
                  {row.piece.notes.map((note, noteIndex) => (
                    <span key={noteIndex} className={styles.subtle}>
                      <br />
                      {note}
                    </span>
                  ))}
                  {row.costError ? (
                    <span className="status-error">
                      <br />
                      {row.costError}
                    </span>
                  ) : null}
                </TableColumn>
                <TableColumn>
                  {shapeName(row.piece.spec.shape)}
                  {usesMeasuredGeometry(row.piece.spec) ? (
                    <span className={styles.subtle}>
                      <br />
                      {getEffectiveArea(row.piece.spec).toFixed(3)} m² measured
                    </span>
                  ) : null}
                </TableColumn>
                <TableColumn>
                  <input
                    className={styles.quantity}
                    type="number"
                    min={1}
                    value={row.quantity}
                    aria-label={`How many of ${row.piece.name || 'this piece'}`}
                    onChange={(event) => setRows((previous) => previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) } : entry)))}
                  />
                </TableColumn>
                <TableColumn>{row.unitCost === null ? '—' : formatCurrency(row.unitCost)}</TableColumn>
              </TableRow>
            ))}
          </Table>

          <br />
          <RowSpaceBetween>
            <Text>
              {selectedPieces} piece{selectedPieces === 1 ? '' : 's'} selected
              {unpriceable ? ` · ${unpriceable} cannot be priced` : ''}
            </Text>
            <Text>{formatCurrency(selectedCost)} cost before markup</Text>
          </RowSpaceBetween>

          <br />
          <div className={styles.actions}>
            <ActionButton onClick={addSelected}>Add {selectedRows.length} To Quote</ActionButton>
            <ActionButton onClick={clearAll}>Discard</ActionButton>
          </div>
        </>
      ) : null}
    </div>
  );
}
