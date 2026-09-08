// Server-only helper: converts DWG bytes to DXF by shelling out to LibreDWG's dwg2dxf.
// Kept separate from the route so it can be unit tested with a stub converter.

import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

export const DWG_CONVERT_TIMEOUT_MS = 90 * 1000;
export const DWG_MAX_OUTPUT_BYTES = 200 * 1024 * 1024;

export interface DwgConversionResult {
  ok: boolean;
  dxf?: Buffer;
  error?: string;
  hint?: string;
  status?: number;
}

interface ConverterRun {
  code: number | null;
  stdout: string;
  stderr: string;
  missing: boolean;
  timedOut: boolean;
}

// Ubuntu does not package LibreDWG, so the server builds it from source via
// scripts/install-libredwg.sh (see projects/costing/development/specs/cad-import.md). Override the binary with CAD_DWG2DXF_PATH.
export function dwgConverterPath(): string {
  return (process.env.CAD_DWG2DXF_PATH || '').trim() || 'dwg2dxf';
}

export function isDwgBuffer(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 6).toString('latin1');
  return /^AC1\d{3}/.test(head) || /^AC1\.\d/.test(head);
}

function runConverter(binary: string, args: string[], cwd: string, timeoutMs: number): Promise<ConverterRun> {
  return new Promise((resolve) => {
    execFile(binary, args, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error: any, stdout, stderr) => {
      const out = String(stdout || '');
      const err = String(stderr || '');
      if (error && (error.code === 'ENOENT' || error.code === 'EACCES')) {
        resolve({ code: null, stdout: out, stderr: err, missing: true, timedOut: false });
        return;
      }
      if (!error) {
        resolve({ code: 0, stdout: out, stderr: err, missing: false, timedOut: false });
        return;
      }
      const timedOut = Boolean(error.killed) && error.signal === 'SIGTERM';
      resolve({ code: typeof error.code === 'number' ? error.code : 1, stdout: out, stderr: err, missing: false, timedOut });
    });
  });
}

export async function checkDwgConverter(): Promise<boolean> {
  const probe = await runConverter(dwgConverterPath(), ['--version'], tmpdir(), 10 * 1000);
  return !probe.missing;
}

// True when the DXF has a non-empty ENTITIES section. Reads only the tail of the buffer that can
// hold the section, so a large conversion is not copied into a string in full.
export function hasDxfEntities(dxf: Buffer): boolean {
  const text = dxf.toString('latin1');
  const start = text.indexOf('ENTITIES');
  if (start < 0) {
    return false;
  }

  const end = text.indexOf('ENDSEC', start);
  const body = end < 0 ? text.slice(start) : text.slice(start, end);
  // Every entity in the section starts with a `0` group code naming its type.
  return /\r?\n\s*0\r?\n\s*[A-Z][A-Z0-9_]*\s*\r?\n/.test(body);
}

function converterErrorDetail(stderr: string, stdout: string): string {
  const lines = `${stderr}\n${stdout}`
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(ERROR|Warning)\b/i.test(line));
  return lines.slice(0, 2).join('; ').slice(0, 300);
}

export async function convertDwgBufferToDxf(input: Buffer, timeoutMs = DWG_CONVERT_TIMEOUT_MS): Promise<DwgConversionResult> {
  const workDir = await mkdtemp(path.join(tmpdir(), 'alfab-cad-'));
  const inputPath = path.join(workDir, 'input.dwg');
  const outputPath = path.join(workDir, 'output.dxf');

  try {
    await writeFile(inputPath, input);
    const result = await runConverter(dwgConverterPath(), ['-o', outputPath, inputPath], workDir, timeoutMs);

    if (result.missing) {
      return {
        ok: false,
        status: 501,
        error: 'DWG conversion is not available on this server.',
        hint: 'Export the drawing as DXF from your CAD package and upload that instead. DWG support has not been switched on for this server yet.',
      };
    }

    let output: Buffer | null = null;
    try {
      output = await readFile(outputPath);
    } catch {
      // Older dwg2dxf builds ignore -o and write next to the input file.
      try {
        output = await readFile(path.join(workDir, 'input.dxf'));
      } catch {
        output = null;
      }
    }

    if (!output || !output.length) {
      const detail = (result.stderr || result.stdout || '').trim().split('\n').slice(-3).join(' ');
      return {
        ok: false,
        status: 422,
        error: result.timedOut ? 'DWG conversion timed out.' : 'The DWG file could not be converted.',
        hint: detail ? `Converter output: ${detail.slice(0, 400)}` : 'The file may be password protected, corrupt, or a very new DWG version. Export it as DXF instead.',
      };
    }

    if (output.length > DWG_MAX_OUTPUT_BYTES) {
      return { ok: false, status: 413, error: 'The converted drawing is too large to process.', hint: 'Export only the glass outline as DXF and upload that.' };
    }

    // dwg2dxf exits 0 even when it only partially understood the drawing, writing a DXF whose
    // ENTITIES section is empty. Catch that here so the failure is reported against the conversion
    // rather than surfacing later as "no geometry in the file", which blames the customer's drawing.
    if (!hasDxfEntities(output)) {
      const detail = converterErrorDetail(result.stderr, result.stdout);
      return {
        ok: false,
        status: 422,
        error: 'The DWG file was converted but contained no drawable geometry.',
        hint: detail ? `The converter reported: ${detail}. Export the drawing as DXF from your CAD package and upload that instead.` : 'The drawing may use features the converter does not support. Export it as DXF from your CAD package and upload that instead.',
      };
    }

    return { ok: true, dxf: output };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
