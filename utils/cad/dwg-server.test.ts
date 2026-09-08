import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { convertDwgBufferToDxf, isDwgBuffer } from './dwg-server';
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
    assert.match(result.hint || '', /libredwg/);
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

  it('surfaces converter failures with their output', async () => {
    process.env.CAD_DWG2DXF_PATH = writeStubConverter('#!/bin/sh\necho "ERROR: Unsupported DWG version" >&2\nexit 3\n');
    const result = await convertDwgBufferToDxf(Buffer.from('AC1032 fake'));
    assert.equal(result.ok, false);
    assert.equal(result.status, 422);
    assert.match(result.hint || '', /Unsupported DWG version/);
  });
});
