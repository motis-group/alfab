// Browser-side orchestration for the CAD import panel: reads the file, converts DWG on the server,
// and parses DXF/SVG locally.

import { CadDocument, CadFileFormat, CadImportError, MAX_CAD_FILE_BYTES, describeUnsupported, detectCadFormat, parseCadDocument } from './index';

export interface LoadedCadFile {
  fileName: string;
  format: CadFileFormat;
  document: CadDocument;
  sizeBytes: number;
}

async function convertDwgOnServer(file: File): Promise<Uint8Array> {
  const body = new FormData();
  body.append('file', file, file.name);

  let response: Response;
  try {
    response = await fetch('/api/cad/convert', { method: 'POST', body, credentials: 'same-origin' });
  } catch {
    throw new CadImportError('Could not reach the DWG conversion service.', 'Check your connection and try again, or export the drawing as DXF and upload that.');
  }

  if (!response.ok) {
    let message = `DWG conversion failed (HTTP ${response.status}).`;
    let hint = 'Export the drawing as DXF from your CAD package and upload that instead.';
    try {
      const payload = await response.json();
      if (payload && typeof payload.error === 'string') message = payload.error;
      if (payload && typeof payload.hint === 'string') hint = payload.hint;
    } catch {
      // Non-JSON error body (for example a login redirect); keep the defaults.
    }
    throw new CadImportError(message, hint);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function loadCadFile(file: File): Promise<LoadedCadFile> {
  if (file.size > MAX_CAD_FILE_BYTES) {
    throw new CadImportError('The file is larger than 40 MB.', 'Export only the glass outline (without title blocks or 3D data) and upload that.');
  }
  if (!file.size) {
    throw new CadImportError('The file is empty.', 'Re-export the drawing and try again.');
  }

  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  const detection = detectCadFormat(file.name, bytes);
  if (detection.kind === 'unsupported') {
    const description = describeUnsupported(detection.reason);
    throw new CadImportError(description.message, description.hint);
  }

  let format: CadFileFormat = detection.format;
  let parseName = file.name;
  if (detection.format === 'dwg') {
    bytes = await convertDwgOnServer(file);
    parseName = file.name.replace(/\.dwg$/i, '') + '.dxf';
    format = 'dwg';
  }

  const parsed = parseCadDocument(parseName, bytes);
  return { fileName: file.name, format, document: parsed.document, sizeBytes: file.size };
}
