import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { convertDwgBufferToDxf, hasDxfEntities, isDwgBuffer } from './dwg-server';
import { analyzeCadDocument, parseCadDocument } from './index';

const FIXTURES = path.join(__dirname, '__fixtures__');
const originalPath = process.env.CAD_DWG2DXF_PATH;

function writeStubConverter(script: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfab-dwg-stub-'));
  const file = path.join(dir, 'dwg2dxf');
  fs.writeFileSync(file, script, { mode: 0o755 });
  return file;
}

afterEach(() => {
  if (originalPath === undefined) {
    delete process.env.CAD_DWG2DXF_PATH;
  } else {
    process.env.CAD_DWG2DXF_PATH = originalPath;
  }
});

describe('DWG conversion helper', () => {
  it('recognises DWG headers', () => {
    assert.equal(isDwgBuffer(Buffer.from('AC1027 rest of file')), true);
    assert.equal(isDwgBuffer(Buffer.from('AC1.40 legacy')), true);
    assert.equal(isDwgBuffer(Buffer.from('0\nSECTION')), false);
  });

  it('reports a clear error when the converter is not installed', async () => {
    process.env.CAD_DWG2DXF_PATH = '/nonexistent/dwg2dxf-not-here';
    const result = await convertDwgBufferToDxf(Buffer.from('AC1027 fake'));
    assert.equal(result.ok, false);
    assert.equal(result.status, 501);
    // The message is read by sales staff, so it has to tell them what they can do about it.
    assert.match(result.hint || '', /Export the drawing as DXF/);
  });

  it('returns the DXF written by the converter and cleans up', async () => {
    const fixture = path.join(FIXTURES, 'rounded-rect-lines-arcs-r12.dxf');
    process.env.CAD_DWG2DXF_PATH = writeStubConverter(`#!/bin/sh\n# stub: dwg2dxf -o OUT IN\ncp "${fixture}" "$2"\n`);
    const result = await convertDwgBufferToDxf(Buffer.from('AC1027 fake dwg body'));
    assert.equal(result.ok, true);
    assert.ok(result.dxf && result.dxf.length > 1000);
    const { document, format } = parseCadDocument('converted.dxf', new Uint8Array(result.dxf!));
    assert.equal(format, 'dxf');
    const analysis = analyzeCadDocument(document);
    assert.equal(analysis.outline.widthMm, 1000);
    assert.equal(analysis.outline.heightMm, 600);
    const leftovers = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('alfab-cad-'));
    assert.equal(leftovers.length, 0);
  });

  it('detects whether a DXF actually carries entities', () => {
    const real = fs.readFileSync(path.join(FIXTURES, 'rounded-rect-lines-arcs-r12.dxf'));
    assert.equal(hasDxfEntities(real), true);
    assert.equal(hasDxfEntities(Buffer.from('  0\nSECTION\n  2\nHEADER\n  0\nENDSEC\n  0\nEOF\n')), false);
    assert.equal(hasDxfEntities(Buffer.from('  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n  0\nEOF\n')), false);
  });

  // dwg2dxf exits 0 on a partially understood drawing, leaving an empty ENTITIES section.
  it('rejects a conversion that produced no geometry, quoting the converter', async () => {
    process.env.CAD_DWG2DXF_PATH = writeStubConverter('#!/bin/sh\necho "ERROR: BLOCK_CONTROL missing" >&2\nprintf \'  0\\nSECTION\\n  2\\nENTITIES\\n  0\\nENDSEC\\n  0\\nEOF\\n\' > "$2"\nexit 0\n');
    const result = await convertDwgBufferToDxf(Buffer.from('AC1027 fake'));
    assert.equal(result.ok, false);
    assert.equal(result.status, 422);
    assert.match(result.error || '', /no drawable geometry/i);
    assert.match(result.hint || '', /BLOCK_CONTROL missing/);
  });

  it('surfaces converter failures with their output', async () => {
    process.env.CAD_DWG2DXF_PATH = writeStubConverter('#!/bin/sh\necho "ERROR: Unsupported DWG version" >&2\nexit 3\n');
    const result = await convertDwgBufferToDxf(Buffer.from('AC1032 fake'));
    assert.equal(result.ok, false);
    assert.equal(result.status, 422);
    assert.match(result.hint || '', /Unsupported DWG version/);
  });
});
