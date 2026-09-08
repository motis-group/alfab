// Entry points for the CAD import feature: file-type detection, parsing and applying the
// analysed outline to a glass specification.

import { EdgeworkType, GlassSpecification, CadOutline } from '../calculations';
import { CadAnalysis, CadAnalysisOptions, CadAnalysisError, analyzeCadDocument, formatMm } from './analyze';
import { isBinaryDxf, looksLikeAsciiDxf, parseDxf } from './dxf';
import { CadDocument } from './model';
import { looksLikeSvg, parseSvg } from './svg';

export type CadFileFormat = 'dxf' | 'dxf-binary' | 'dwg' | 'svg';
export type UnsupportedKind = 'pdf' | 'step' | 'iges' | 'stl' | 'illustrator' | 'image' | 'archive' | 'gzip' | 'unknown';

export type CadDetection = { kind: 'supported'; format: CadFileFormat } | { kind: 'unsupported'; reason: UnsupportedKind };

export const ACCEPTED_EXTENSIONS = ['.dxf', '.dwg', '.svg'];
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');
export const MAX_CAD_FILE_BYTES = 40 * 1024 * 1024;

export class CadImportError extends Error {
  hint: string;

  constructor(message: string, hint = '') {
    super(message);
    this.name = 'CadImportError';
    this.hint = hint;
    Object.setPrototypeOf(this, CadImportError.prototype);
  }
}

export { CadAnalysisError, analyzeCadDocument, formatMm };
export type { CadAnalysis, CadAnalysisOptions, CadDocument };

export interface UnitOption {
  label: string;
  toMm: number;
}

export const UNIT_OPTIONS: UnitOption[] = [
  { label: 'Millimetres (mm)', toMm: 1 },
  { label: 'Centimetres (cm)', toMm: 10 },
  { label: 'Metres (m)', toMm: 1000 },
  { label: 'Inches (in)', toMm: 25.4 },
  { label: 'Feet (ft)', toMm: 304.8 },
  { label: 'Points (pt, 72/in)', toMm: 25.4 / 72 },
  { label: 'Pixels (px, 96/in)', toMm: 25.4 / 96 },
];

function extensionOf(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

function asciiHead(bytes: Uint8Array, length: number): string {
  let text = '';
  const end = Math.min(bytes.length, length);
  for (let i = 0; i < end; i += 1) {
    text += String.fromCharCode(bytes[i]);
  }
  return text;
}

function decodeHead(bytes: Uint8Array, length: number): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, length)));
  } catch {
    return asciiHead(bytes, length);
  }
}

export function detectCadFormat(fileName: string, bytes: Uint8Array): CadDetection {
  const extension = extensionOf(fileName);
  const head = asciiHead(bytes, 64);

  if (/^AC1\d{3}/.test(head) || /^AC1\.\d/.test(head)) {
    return { kind: 'supported', format: 'dwg' };
  }
  if (isBinaryDxf(bytes)) {
    return { kind: 'supported', format: 'dxf-binary' };
  }
  if (head.startsWith('%PDF')) {
    return { kind: 'unsupported', reason: extension === '.ai' ? 'illustrator' : 'pdf' };
  }
  if (head.startsWith('%!PS')) {
    return { kind: 'unsupported', reason: 'illustrator' };
  }
  if (bytes.length > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return { kind: 'unsupported', reason: 'gzip' };
  }
  if (head.startsWith('PK')) {
    return { kind: 'unsupported', reason: 'archive' };
  }
  if (/^ISO-10303/.test(head) || extension === '.stp' || extension === '.step') {
    return { kind: 'unsupported', reason: 'step' };
  }
  if (extension === '.igs' || extension === '.iges') {
    return { kind: 'unsupported', reason: 'iges' };
  }
  if (extension === '.stl' || head.startsWith('solid ')) {
    return { kind: 'unsupported', reason: 'stl' };
  }
  if ((bytes[0] === 0x89 && head.slice(1, 4) === 'PNG') || (bytes[0] === 0xff && bytes[1] === 0xd8) || head.startsWith('GIF8') || head.startsWith('BM') || (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00)) {
    return { kind: 'unsupported', reason: 'image' };
  }

  const text = decodeHead(bytes, 20000);
  if (looksLikeSvg(text)) {
    return { kind: 'supported', format: 'svg' };
  }
  if (looksLikeAsciiDxf(text)) {
    return { kind: 'supported', format: 'dxf' };
  }
  if (extension === '.dxf') {
    return { kind: 'supported', format: 'dxf' };
  }
  if (extension === '.svg') {
    return { kind: 'supported', format: 'svg' };
  }
  if (extension === '.dwg') {
    return { kind: 'supported', format: 'dwg' };
  }
  if (extension === '.pdf') {
    return { kind: 'unsupported', reason: 'pdf' };
  }
  if (extension === '.ai' || extension === '.eps') {
    return { kind: 'unsupported', reason: 'illustrator' };
  }
  return { kind: 'unsupported', reason: 'unknown' };
}

export function describeUnsupported(reason: UnsupportedKind): { message: string; hint: string } {
  switch (reason) {
    case 'pdf':
      return { message: 'PDF drawings cannot be measured reliably.', hint: 'Ask the customer for the DXF (or DWG) export from their CAD package. In AutoCAD use SAVEAS and choose DXF.' };
    case 'step':
    case 'iges':
    case 'stl':
      return { message: '3D exchange formats are not supported.', hint: 'Export the glass face as a flat 2D DXF (or SVG) and upload that.' };
    case 'illustrator':
      return { message: 'Illustrator / EPS files are not supported directly.', hint: 'Export the artwork as SVG or DXF with real-world units (mm) and upload that.' };
    case 'image':
      return { message: 'Images and scans cannot be measured.', hint: 'Ask for a DXF, DWG or SVG export of the drawing.' };
    case 'archive':
      return { message: 'Archives are not supported.', hint: 'Unzip the file and upload the DXF, DWG or SVG inside it.' };
    case 'gzip':
      return { message: 'Compressed files are not supported.', hint: 'Decompress the file (for .svgz save it as plain .svg) and upload it again.' };
    default:
      return { message: 'This file type is not recognised.', hint: 'Supported files: DXF (ASCII or binary), DWG, and SVG.' };
  }
}

export function formatLabel(format: CadFileFormat): string {
  switch (format) {
    case 'dxf':
      return 'DXF';
    case 'dxf-binary':
      return 'DXF (binary)';
    case 'dwg':
      return 'DWG';
    case 'svg':
      return 'SVG';
  }
}

// Parses DXF or SVG bytes. DWG files must be converted to DXF first (see the /api/cad/convert route).
export function parseCadDocument(fileName: string, bytes: Uint8Array): { document: CadDocument; format: CadFileFormat } {
  const detection = detectCadFormat(fileName, bytes);
  if (detection.kind === 'unsupported') {
    const description = describeUnsupported(detection.reason);
    throw new CadImportError(description.message, description.hint);
  }
  if (detection.format === 'dwg') {
    throw new CadImportError('DWG files must be converted to DXF before parsing.', 'Use the DWG conversion service or export the drawing as DXF.');
  }
  try {
    if (detection.format === 'svg') {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return { document: parseSvg(text), format: 'svg' };
    }
    return { document: parseDxf(bytes), format: detection.format };
  } catch (error: any) {
    if (error instanceof CadImportError) {
      throw error;
    }
    throw new CadImportError(`Could not read the ${formatLabel(detection.format)} file: ${error?.message || 'unknown error'}`, 'Check that the file is not truncated and re-export it if needed.');
  }
}

export interface CadOutlineBuildOptions {
  fileName: string;
  format: CadFileFormat;
  priceOnMeasured: boolean;
  importedAt?: string;
}

export function buildCadOutline(analysis: CadAnalysis, options: CadOutlineBuildOptions): CadOutline {
  return {
    fileName: options.fileName,
    format: options.format === 'dxf-binary' ? 'dxf' : options.format,
    widthMm: analysis.outline.widthMm,
    heightMm: analysis.outline.heightMm,
    areaSqM: Math.round(analysis.outline.areaSqM * 1e6) / 1e6,
    perimeterM: Math.round(analysis.outline.perimeterM * 1e4) / 1e4,
    shapeLabel: analysis.outline.shapeLabel,
    cornerRadiiMm: analysis.outline.cornerRadiiMm,
    holeCount: analysis.holes.count,
    priceOnMeasured: options.priceOnMeasured,
    importedAt: options.importedAt || new Date().toISOString(),
  };
}

function edgeworkForGeometry(current: EdgeworkType, curved: boolean): EdgeworkType {
  if (current === 'ROUGH ARRIS') {
    return current;
  }
  if (curved && current.endsWith('STRAIGHT')) {
    return current.replace('STRAIGHT', 'CURVED') as EdgeworkType;
  }
  if (!curved && current.endsWith('CURVED')) {
    return current.replace('CURVED', 'STRAIGHT') as EdgeworkType;
  }
  return current;
}

export interface AppliedField {
  field: string;
  value: string;
}

export interface ApplyResult {
  spec: GlassSpecification;
  applied: AppliedField[];
}

// Writes the geometry read from the file into the specification. Glass type, thickness,
// ceramic banding and scanning are left exactly as the user set them.
export function applyCadAnalysisToSpec(spec: GlassSpecification, analysis: CadAnalysis, outline: CadOutline): ApplyResult {
  const applied: AppliedField[] = [];
  const next: GlassSpecification = { ...spec };

  next.width = analysis.outline.widthMm;
  next.height = analysis.outline.heightMm;
  applied.push({ field: 'Width', value: `${formatMm(next.width)} mm` });
  applied.push({ field: 'Height', value: `${formatMm(next.height)} mm` });

  next.shape = analysis.outline.shape;
  applied.push({ field: 'Shape', value: `${shapeName(next.shape)} (${analysis.outline.shapeLabel})` });

  next.radiusCorners = analysis.outline.radiusCorners;
  applied.push({ field: 'Radius corners', value: next.radiusCorners ? `Yes (R${analysis.outline.cornerRadiiMm.map(formatMm).join(' / R')})` : 'No' });

  next.holes = analysis.holes.count > 0;
  next.numHoles = analysis.holes.count;
  applied.push({ field: 'Holes', value: next.holes ? `${next.numHoles} (Ø${analysis.holes.diametersMm.map(formatMm).join(', Ø')} mm)` : 'None' });

  const edgework = edgeworkForGeometry(spec.edgework, analysis.outline.hasCurvedEdges);
  if (edgework !== spec.edgework) {
    next.edgework = edgework;
    applied.push({ field: 'Edgework', value: `${edgework} (${analysis.outline.hasCurvedEdges ? 'curved edges detected' : 'no curved edges'})` });
  }

  next.cadOutline = outline;
  applied.push({ field: 'Measured area', value: `${analysis.outline.areaSqM.toFixed(4)} m²` });
  applied.push({ field: 'Measured perimeter', value: `${analysis.outline.perimeterM.toFixed(3)} m` });

  return { spec: next, applied };
}

export function shapeName(shape: GlassSpecification['shape']): string {
  switch (shape) {
    case 'RECTANGLE':
      return 'Rectangle';
    case 'TRIANGLE':
      return 'Triangle';
    case 'SIMPLE':
      return 'Simple Shape';
    case 'COMPLEX':
      return 'Complex Shape';
  }
}
