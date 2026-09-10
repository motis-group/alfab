'use client';

import * as React from 'react';

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

  function route(file: File) {
    const extension = extensionOf(file.name);
    setRejected(null);

    if (ACCEPTED_EXTENSIONS.includes(extension)) {
      setCadFile(file);
      return;
    }
    if (IMPORT_ACCEPTED_EXTENSIONS.includes(extension)) {
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
        title="Drop what the customer sent here or click to choose"
        hint="PDF · Word · DXF · DWG · SVG — an order is read piece by piece for you to check, a drawing measures the piece below"
        disabled={disabled}
        onFile={route}
      />

      {rejected ? (
        <>
          <br />
          <Text>
            <span className="status-error">{rejected}</span>
          </Text>
        </>
      ) : null}

      <OrderImportPanel onAdd={onAddPieces} disabled={disabled} file={orderFile} showDropZone={false} />
      <CadImportPanel key={cadPanelKey} spec={spec} onApply={onApplyCad} onClear={onClearCad} disabled={disabled} file={cadFile} showDropZone={false} />
    </div>
  );
}
