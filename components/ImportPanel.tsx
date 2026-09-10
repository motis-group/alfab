'use client';

import * as React from 'react';

import styles from '@components/ImportPanel.module.scss';

import BlockLoader from '@components/BlockLoader';
import CadImportPanel, { CadImportApplyResult } from '@components/CadImportPanel';
import FileDropZone from '@components/FileDropZone';
import OrderImportPanel from '@components/OrderImportPanel';
import Text from '@components/Text';

import { ACCEPTED_EXTENSIONS } from '@utils/cad';
import { GlassSpecification } from '@utils/calculations';
import { ExtractedPiece, IMPORT_ACCEPTED_EXTENSIONS } from '@utils/import/model';

interface ImportPanelProps {
  spec: GlassSpecification;
  onApplyCad: (result: CadImportApplyResult) => void;
  onClearCad: () => void;
  onAddPieces: (pieces: ExtractedPiece[]) => void;
  /** Bumped by the page to throw away an import when the piece on the form is replaced. */
  cadPanelKey: number;
  disabled?: boolean;
}

const ACCEPT = [...IMPORT_ACCEPTED_EXTENSIONS, ...ACCEPTED_EXTENSIONS].join(',');

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

/**
 * One box for whatever the customer sent.
 *
 * A drawing file measures the piece on the form; an order measures every piece in it and offers
 * them for the quote. Which of those happens is decided from the file, not from the estimator
 * picking the right box: two drop zones side by side asked a question that the file already answers.
 */
export default function ImportPanel({ spec, onApplyCad, onClearCad, onAddPieces, cadPanelKey, disabled = false }: ImportPanelProps) {
  const [cadFile, setCadFile] = React.useState<File | null>(null);
  const [orderFile, setOrderFile] = React.useState<File | null>(null);
  const [rejected, setRejected] = React.useState<string | null>(null);
  // A read runs for as long as a minute. The zone says so, and takes no second file until it ends:
  // dropping again mid-read would throw away the answer the estimator is waiting for.
  const [busy, setBusy] = React.useState(false);
  const [busyFile, setBusyFile] = React.useState<{ name: string; kind: 'order' | 'drawing' } | null>(null);

  function route(file: File) {
    if (busy) {
      return;
    }
    const extension = extensionOf(file.name);
    setRejected(null);

    if (ACCEPTED_EXTENSIONS.includes(extension)) {
      setBusyFile({ name: file.name, kind: 'drawing' });
      setCadFile(file);
      return;
    }
    if (IMPORT_ACCEPTED_EXTENSIONS.includes(extension)) {
      setBusyFile({ name: file.name, kind: 'order' });
      setOrderFile(file);
      return;
    }

    setRejected(`${file.name} is not a file this can read. Send a drawing as ${ACCEPTED_EXTENSIONS.join(', ')}, or an order as ${IMPORT_ACCEPTED_EXTENSIONS.join(' or ')}.`);
  }

  return (
    <div>
      <FileDropZone
        accept={ACCEPT}
        label="Upload a customer's order or drawing"
        title={busy ? 'Reading…' : 'Drop what the customer sent here or click to choose'}
        hint="PDF · Word · DXF · DWG · SVG — an order is read piece by piece for you to check, a drawing measures the piece below"
        disabled={disabled || busy}
        onFile={route}
      />

      {busy ? (
        <>
          <br />
          <Text>
            <BlockLoader mode={1} /> Reading {busyFile?.name || 'the file'}.
          </Text>
          <Text className={styles.subtle}>
            {busyFile?.kind === 'drawing'
              ? 'Measuring the outline. A DWG is converted on the server first, so it takes a moment longer.'
              : 'A typed list comes back in a few seconds. A drawing can take up to a minute, because every page is read. Leave this page open.'}
          </Text>
        </>
      ) : null}

      {rejected ? (
        <>
          <br />
          <Text>
            <span className="status-error">{rejected}</span>
          </Text>
        </>
      ) : null}

      <OrderImportPanel onAdd={onAddPieces} disabled={disabled} file={orderFile} showDropZone={false} onBusyChange={setBusy} />
      <CadImportPanel key={cadPanelKey} spec={spec} onApply={onApplyCad} onClear={onClearCad} disabled={disabled} file={cadFile} showDropZone={false} onBusyChange={setBusy} />
    </div>
  );
}
