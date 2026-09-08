'use client';

import styles from '@components/CadImportPanel.module.scss';

import * as React from 'react';
import * as Utilities from '@common/utilities';

import ActionButton from '@components/ActionButton';
import RowSpaceBetween from '@components/RowSpaceBetween';
import Table from '@components/Table';
import TableColumn from '@components/TableColumn';
import TableRow from '@components/TableRow';
import Text from '@components/Text';

import { ACCEPT_ATTRIBUTE, AppliedField, CadAnalysis, UNIT_OPTIONS, analyzeCadDocument, applyCadAnalysisToSpec, buildCadOutline, formatLabel, formatMm, shapeName } from '@utils/cad';
import { LoadedCadFile, loadCadFile } from '@utils/cad/client';
import { GlassSpecification, usesMeasuredGeometry } from '@utils/calculations';

export interface CadImportApplyResult {
  spec: GlassSpecification;
  applied: AppliedField[];
}

interface CadImportPanelProps {
  spec: GlassSpecification;
  onApply: (result: CadImportApplyResult) => void;
  onClear: () => void;
  disabled?: boolean;
}

interface PanelError {
  message: string;
  hint: string;
}

function toPanelError(error: unknown): PanelError {
  const anyError = error as { message?: string; hint?: string } | null;
  return {
    message: anyError?.message || 'The file could not be imported.',
    hint: anyError?.hint || '',
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CadImportPanel({ spec, onApply, onClear, disabled = false }: CadImportPanelProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const specRef = React.useRef(spec);
  const onApplyRef = React.useRef(onApply);
  specRef.current = spec;
  onApplyRef.current = onApply;

  const [loaded, setLoaded] = React.useState<LoadedCadFile | null>(null);
  const [analysis, setAnalysis] = React.useState<CadAnalysis | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<PanelError | null>(null);
  const [applied, setApplied] = React.useState<AppliedField[]>([]);
  const [unitsOverride, setUnitsOverride] = React.useState<number | null>(null);
  const [outlineIndex, setOutlineIndex] = React.useState<number | null>(null);
  const [priceOnMeasured, setPriceOnMeasured] = React.useState(true);
  const [isDragActive, setIsDragActive] = React.useState(false);

  React.useEffect(() => {
    if (!loaded) {
      return;
    }
    try {
      const nextAnalysis = analyzeCadDocument(loaded.document, { unitsToMm: unitsOverride, outlineIndex });
      const outline = buildCadOutline(nextAnalysis, { fileName: loaded.fileName, format: loaded.format, priceOnMeasured });
      const result = applyCadAnalysisToSpec(specRef.current, nextAnalysis, outline);
      setAnalysis(nextAnalysis);
      setApplied(result.applied);
      setError(null);
      onApplyRef.current(result);
    } catch (analysisError) {
      setAnalysis(null);
      setApplied([]);
      setError(toPanelError(analysisError));
    }
  }, [loaded, unitsOverride, outlineIndex, priceOnMeasured]);

  async function handleFile(file: File | null | undefined) {
    if (!file || disabled) {
      return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    setApplied([]);
    setUnitsOverride(null);
    setOutlineIndex(null);
    try {
      const nextLoaded = await loadCadFile(file);
      setLoaded(nextLoaded);
    } catch (loadError) {
      setLoaded(null);
      setError(toPanelError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  function openFileDialog() {
    if (disabled) {
      return;
    }
    inputRef.current?.click();
  }

  function reapply() {
    if (!loaded || !analysis) {
      return;
    }
    const outline = buildCadOutline(analysis, { fileName: loaded.fileName, format: loaded.format, priceOnMeasured });
    const result = applyCadAnalysisToSpec(specRef.current, analysis, outline);
    setApplied(result.applied);
    onApplyRef.current(result);
  }

  function clearAll() {
    setLoaded(null);
    setAnalysis(null);
    setApplied([]);
    setError(null);
    setUnitsOverride(null);
    setOutlineIndex(null);
    setPriceOnMeasured(true);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onClear();
  }

  const attachedOutline = spec.cadOutline || null;
  const outlineAttached = !!attachedOutline;
  const dimensionsEdited = !!attachedOutline && (Math.abs(spec.width - attachedOutline.widthMm) > 0.05 || Math.abs(spec.height - attachedOutline.heightMm) > 0.05);
  const measuredActive = usesMeasuredGeometry(spec);

  return (
    <div className={styles.root}>
      <input ref={inputRef} className={styles.hiddenInput} type="file" accept={ACCEPT_ATTRIBUTE} disabled={disabled} tabIndex={-1} aria-hidden="true" onChange={(event) => handleFile(event.target.files?.[0])} />

      <div
        className={Utilities.classNames(styles.dropZone, isDragActive ? styles.dropZoneActive : null, disabled ? styles.dropZoneDisabled : null)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Upload a CAD file (DXF, DWG or SVG)"
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
        <span className={styles.dropZoneTitle}>{isLoading ? 'Reading file…' : loaded ? 'Drop another file to replace' : 'Drop a 2D CAD file here or click to choose'}</span>
        <span className={styles.dropZoneHint}>DXF · DWG · SVG — the outline, size, shape, radius corners and holes are read automatically</span>
      </div>

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

      {loaded && analysis ? (
        <>
          <br />
          <RowSpaceBetween>
            <Text>FILE</Text>
            <Text>
              {loaded.fileName} · {formatLabel(loaded.format)} · {formatBytes(loaded.sizeBytes)}
            </Text>
          </RowSpaceBetween>

          <Table>
            <TableRow>
              <TableColumn style={{ width: '22ch' }}>READ FROM FILE</TableColumn>
              <TableColumn>VALUE</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Outline size</TableColumn>
              <TableColumn>
                {formatMm(analysis.outline.widthMm)} × {formatMm(analysis.outline.heightMm)} mm{analysis.outline.rotationDeg ? ` (drawn at ${analysis.outline.rotationDeg}°)` : ''}
              </TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Shape</TableColumn>
              <TableColumn>
                {shapeName(analysis.outline.shape)} — {analysis.outline.shapeLabel}
              </TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Radius corners</TableColumn>
              <TableColumn>{analysis.outline.radiusCorners ? `Yes · R${analysis.outline.cornerRadiiMm.map(formatMm).join(' / R')} mm` : 'No'}</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Holes</TableColumn>
              <TableColumn>{analysis.holes.count ? `${analysis.holes.count} · Ø${analysis.holes.diametersMm.map(formatMm).join(', Ø')} mm` : 'None found'}</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Measured area</TableColumn>
              <TableColumn>{analysis.outline.areaSqM.toFixed(4)} m²</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Edge length</TableColumn>
              <TableColumn>{analysis.outline.perimeterM.toFixed(3)} m</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Units</TableColumn>
              <TableColumn>{analysis.units.label}</TableColumn>
            </TableRow>
          </Table>
          <br />

          <Text>FILE UNITS</Text>
          <select
            className={styles.control}
            value={unitsOverride === null ? 'auto' : String(unitsOverride)}
            disabled={disabled}
            onChange={(event) => setUnitsOverride(event.target.value === 'auto' ? null : Number(event.target.value))}
          >
            <option value="auto">{loaded.document.unitsToMm === null ? `Assume ${loaded.document.unitsHintLabel || 'mm'} (file does not say)` : `As stated in file (${loaded.document.unitsLabel})`}</option>
            {UNIT_OPTIONS.map((option) => (
              <option key={option.label} value={String(option.toMm)}>
                {option.label}
              </option>
            ))}
          </select>
          <br />

          {analysis.candidates.length > 1 ? (
            <>
              <Text>GLASS OUTLINE</Text>
              <select className={styles.control} value={String(analysis.outlineIndex)} disabled={disabled} onChange={(event) => setOutlineIndex(Number(event.target.value))}>
                {analysis.candidates.map((candidate) => (
                  <option key={candidate.index} value={String(candidate.index)}>
                    {candidate.label}
                    {candidate.frameLike ? ' (looks like a border)' : ''}
                  </option>
                ))}
              </select>
              <br />
            </>
          ) : null}

          <label>
            <input type="checkbox" checked={priceOnMeasured} disabled={disabled} onChange={(event) => setPriceOnMeasured(event.target.checked)} /> Price on the measured outline (true area and edge length) instead of width × height
          </label>
          <br />

          {analysis.warnings.length ? (
            <ul className={styles.list}>
              {analysis.warnings.map((warning, index) => (
                <li key={index}>
                  <span className="status-warning">{warning}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {analysis.outline.reasons.length ? (
            <ul className={Utilities.classNames(styles.list, styles.subtle)}>
              {analysis.outline.reasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          ) : null}

          {applied.length ? (
            <>
              <br />
              <Text>APPLIED TO SPECIFICATION</Text>
              <Table>
                {applied.map((field) => (
                  <TableRow key={field.field}>
                    <TableColumn style={{ width: '22ch' }}>{field.field}</TableColumn>
                    <TableColumn>{field.value}</TableColumn>
                  </TableRow>
                ))}
              </Table>
            </>
          ) : null}
        </>
      ) : null}

      {!loaded && attachedOutline ? (
        <>
          <br />
          <Table>
            <TableRow>
              <TableColumn style={{ width: '22ch' }}>CAD OUTLINE</TableColumn>
              <TableColumn>VALUE</TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>File</TableColumn>
              <TableColumn>
                {attachedOutline.fileName} ({attachedOutline.format.toUpperCase()})
              </TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Outline size</TableColumn>
              <TableColumn>
                {formatMm(attachedOutline.widthMm)} × {formatMm(attachedOutline.heightMm)} mm · {attachedOutline.shapeLabel}
              </TableColumn>
            </TableRow>
            <TableRow>
              <TableColumn>Measured</TableColumn>
              <TableColumn>
                {attachedOutline.areaSqM.toFixed(4)} m² · {attachedOutline.perimeterM.toFixed(3)} m edge
              </TableColumn>
            </TableRow>
          </Table>
        </>
      ) : null}

      {outlineAttached ? (
        <>
          <br />
          <Text>
            <span className={measuredActive ? 'status-success' : 'status-warning'}>{measuredActive ? 'Pricing uses the measured outline area and edge length.' : 'Pricing uses width × height; the measured outline is kept for reference.'}</span>
          </Text>
          {dimensionsEdited ? (
            <Text>
              <span className="status-warning">
                Width/height were edited after import ({formatMm(attachedOutline!.widthMm)} × {formatMm(attachedOutline!.heightMm)} mm in the file). Re-apply to restore the file values, or remove the CAD data to price on the edited size.
              </span>
            </Text>
          ) : null}
        </>
      ) : null}

      {(loaded || outlineAttached) && !disabled ? (
        <>
          <br />
          <div className={styles.actions}>
            {loaded && analysis ? <ActionButton onClick={reapply}>Re-apply from file</ActionButton> : null}
            <ActionButton onClick={clearAll}>Remove CAD data</ActionButton>
          </div>
        </>
      ) : null}
    </div>
  );
}
