// Checks for reading a customer's order. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { GlassSpecification, getEffectiveArea, getEffectivePerimeter } from '../calculations';
import { docxToText, readCutList, readZipEntry } from './docx';
import { applySketchToSpec, sketchToSvg } from './outline';
import { SKETCH_SCHEMA } from './extract-server';

/** A one-entry ZIP, built the way Word builds one, so the reader is tested against real bytes. */
function zipWith(entryName: string, contents: string, store = false): Buffer {
  const name = Buffer.from(entryName, 'utf8');
  const raw = Buffer.from(contents, 'utf8');
  const data = store ? raw : deflateRawSync(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(store ? 0 : 8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);

  const localEntry = Buffer.concat([local, name, data]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(store ? 0 : 8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);

  const centralEntry = Buffer.concat([central, name]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralEntry.length, 12);
  eocd.writeUInt32LE(localEntry.length, 16);

  return Buffer.concat([localEntry, centralEntry, eocd]);
}

test('a Word document is read back as the text of its paragraphs', () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>6mm Supergrey</w:t></w:r></w:p><w:p><w:r><w:t>1120 x 530 &#8211; 1 off</w:t></w:r></w:p></w:body></w:document>';
  assert.equal(docxToText(zipWith('word/document.xml', xml)), '6mm Supergrey\n1120 x 530 – 1 off');
  assert.equal(docxToText(zipWith('word/document.xml', xml, true)), '6mm Supergrey\n1120 x 530 – 1 off', 'an uncompressed entry reads the same');
  assert.equal(readZipEntry(zipWith('word/document.xml', xml), 'word/other.xml'), null, 'a missing entry is null, not a throw');
});

test('every size and quantity in a cut list is read, and a line that is not read is reported', () => {
  const reading = readCutList(
    [
      'Glass order for project – TH',
      '1120 x 530 – 1 off', // en dash, spaces
      '1120 x 425 - 4 off', // hyphen
      '2275 x 1705 -1 off', // no space before the quantity
      '2635 X 2315 — 4 off', // capital X, em dash
      '2400 × 240 - 2 off', // multiplication sign
      '1200 x 900 twice', // a size, but not in a form that can be read
      'Delivery to Eildon please',
    ].join('\n')
  );

  assert.equal(reading.entries.length, 5, 'five lines carry a size and a quantity');
  assert.equal(
    reading.entries.reduce((total, entry) => total + entry.quantity, 0),
    12,
    '1 + 4 + 1 + 4 + 2 pieces'
  );
  assert.deepEqual(reading.entries[3], { widthMm: 2635, heightMm: 2315, quantity: 4, sourceLine: '2635 X 2315 — 4 off' });
  assert.deepEqual(reading.unparsedLines, ['1200 x 900 twice'], 'an unread size is surfaced, never dropped in silence');
});

const spec: GlassSpecification = {
  width: 0,
  height: 0,
  thickness: 6,
  glassType: 'Super Grey',
  edgework: 'FLAT POLISH - STRAIGHT',
  ceramicBand: false,
  shape: 'RECTANGLE',
  holes: false,
  numHoles: 0,
  radiusCorners: false,
  scanning: false,
};

test('a sketched rectangle with a hole measures as itself', () => {
  const { spec: applied } = applySketchToSpec(
    spec,
    {
      points: [
        [0, 0],
        [1695, 0],
        [1695, 2375],
        [0, 2375],
      ],
      holes: [{ x: 510, y: 610, d: 88 }],
    },
    'sketch.pdf'
  );

  assert.equal(applied.width, 1695);
  assert.equal(applied.height, 2375);
  assert.equal(applied.shape, 'RECTANGLE');
  assert.equal(applied.numHoles, 1, 'the hole is counted, and priced by count');
  assert.ok(Math.abs(getEffectiveArea(applied) - 4.0256) < 0.005, `1695 x 2375 is 4.026 m², got ${getEffectiveArea(applied)}`);
});

test('a notched piece is priced on the glass it uses, not on its bounding box', () => {
  // The TH sketch: a 317 x 2153 body with a 112 x 155 tab, which a bounding box overstates by 4.5%.
  const { spec: applied } = applySketchToSpec(
    spec,
    {
      points: [
        [205, 0],
        [317, 0],
        [317, 2308],
        [0, 2308],
        [0, 155],
        [205, 155],
      ],
    },
    'sketch.pdf'
  );

  const boundingArea = (317 * 2308) / 1e6;
  const trueArea = (317 * 2153 + 112 * 155) / 1e6;

  assert.notEqual(applied.shape, 'RECTANGLE', 'a notch is not a rectangle, and carries a shape charge');
  assert.ok(Math.abs(getEffectiveArea(applied) - trueArea) < 0.002, `the notch is taken off the area: expected ${trueArea}, got ${getEffectiveArea(applied)}`);
  assert.ok(getEffectiveArea(applied) < boundingArea - 0.02, 'the bounding box would overcharge, so it is not used');
  assert.ok(Math.abs(getEffectivePerimeter(applied) - (112 + 2308 + 317 + 2153 + 205 + 155) / 1000) < 0.01, 'edgework is charged on the real edge length');
});

test('a sketch too small to be a shape is refused rather than priced', () => {
  assert.throws(() => sketchToSvg({ points: [[0, 0], [10, 0]] }), /three points/);
  assert.throws(() => sketchToSvg({ points: [[0, 0], [10, 0], [20, 0]] }), /no area/);
});

/**
 * Structured outputs take a subset of JSON Schema, and reject the rest at request time with a 400.
 * `minimum` on an integer cost an estimator an upload and a confusing error; the code already
 * clamps every one of these, so the schema was stating a constraint twice rather than adding one.
 */
test('the sketch schema uses only keywords structured outputs accept', () => {
  const banned = ['minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'format'];
  const found: string[] = [];

  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (banned.includes(key)) {
        found.push(`${path}.${key}`);
      }
      walk(value, `${path}.${key}`);
    }
  };

  walk(SKETCH_SCHEMA, 'schema');
  assert.deepEqual(found, [], `these keywords are rejected by output_config.format.schema: ${found.join(', ')}`);
});
