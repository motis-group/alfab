import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { calculateCost, GlassSpecification } from '../calculations';
import { analyzeCadDocument, applyCadAnalysisToSpec, buildCadOutline, CadAnalysis, detectCadFormat, parseCadDocument } from './index';
import { arcFromBulge, boundingBox, minimumAreaRectangle, pointInPolygon, polygonArea, flattenArc, TWO_PI } from './geometry';
import { buildLoops } from './model';
import { parsePathData, parseSvg, parseTransform } from './svg';
import { tokenizeAsciiDxf, tokenizeBinaryDxf } from './dxf';

const FIXTURES = path.join(__dirname, '__fixtures__');

function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)));
}

function analyzeFixture(name: string): { analysis: CadAnalysis; format: string } {
  const { document, format } = parseCadDocument(name, fixtureBytes(name));
  return { analysis: analyzeCadDocument(document), format };
}

function near(actual: number, expected: number, tolerance: number, label: string): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} ± ${tolerance}, got ${actual}`);
}

const baseSpec: GlassSpecification = {
  width: 1000,
  height: 1000,
  thickness: 6,
  glassType: 'Clear',
  edgework: 'FLAT POLISH - STRAIGHT',
  ceramicBand: false,
  shape: 'RECTANGLE',
  holes: false,
  numHoles: 0,
  radiusCorners: false,
  scanning: false,
};

describe('geometry', () => {
  it('converts a 90 degree bulge into a quarter arc', () => {
    const bulge = Math.tan(Math.PI / 8);
    const arc = arcFromBulge({ x: 100, y: 0 }, { x: 150, y: 50 }, bulge);
    assert.equal(arc.kind, 'arc');
    if (arc.kind === 'arc') {
      near(arc.radius, 50, 1e-9, 'radius');
      near(arc.center.x, 100, 1e-9, 'center x');
      near(arc.center.y, 50, 1e-9, 'center y');
      near(arc.sweepAngle, Math.PI / 2, 1e-9, 'sweep');
      const points = flattenArc(arc, 0.01);
      near(points[0].x, 100, 1e-9, 'start x');
      near(points[points.length - 1].y, 50, 1e-9, 'end y');
    }
  });

  it('measures the true sides of a rotated rectangle', () => {
    const angle = Math.PI / 6;
    const corners = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 500 },
      { x: 0, y: 500 },
    ].map((p) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) }));
    const rect = minimumAreaRectangle(corners);
    near(rect.width, 1000, 1e-6, 'width');
    near(rect.height, 500, 1e-6, 'height');
    near(rect.angle, angle, 1e-6, 'angle');
    assert.ok(boundingBox(corners).width > 1000, 'axis-aligned box is larger than the rectangle');
  });

  it('computes circle area from a flattened arc and tests point containment', () => {
    const circle = flattenArc({ kind: 'arc', center: { x: 0, y: 0 }, radius: 100, startAngle: 0, sweepAngle: TWO_PI }, 0.01);
    near(polygonArea(circle), Math.PI * 100 * 100, 30, 'circle area');
    assert.equal(pointInPolygon({ x: 10, y: 10 }, circle), true);
    assert.equal(pointInPolygon({ x: 150, y: 0 }, circle), false);
  });

  it('joins loose lines into a loop within tolerance and counts open chains', () => {
    const result = buildLoops(
      [
        { primitives: [{ kind: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }], closed: false, layer: '0', source: 'LINE', space: 'model' },
        { primitives: [{ kind: 'line', start: { x: 100, y: 0.02 }, end: { x: 100, y: 50 } }], closed: false, layer: '0', source: 'LINE', space: 'model' },
        { primitives: [{ kind: 'line', start: { x: 100, y: 50 }, end: { x: 0, y: 50 } }], closed: false, layer: '0', source: 'LINE', space: 'model' },
        { primitives: [{ kind: 'line', start: { x: 0, y: 50 }, end: { x: 0, y: 0.03 } }], closed: false, layer: '0', source: 'LINE', space: 'model' },
        { primitives: [{ kind: 'line', start: { x: 500, y: 500 }, end: { x: 600, y: 500 } }], closed: false, layer: '0', source: 'LINE', space: 'model' },
      ],
      0.1,
      0.01
    );
    assert.equal(result.loops.length, 1);
    assert.equal(result.openChains, 1);
    near(result.loops[0].area, 5000, 5, 'loop area');
  });
});

describe('format detection', () => {
  it('recognises formats by content before extension', () => {
    const text = (value: string) => new Uint8Array(Buffer.from(value, 'utf8'));
    assert.deepEqual(detectCadFormat('drawing.dwg', text('AC1027xxxx')), { kind: 'supported', format: 'dwg' });
    assert.deepEqual(detectCadFormat('drawing.txt', text('%PDF-1.7')), { kind: 'unsupported', reason: 'pdf' });
    assert.deepEqual(detectCadFormat('drawing.bin', new Uint8Array([0x89, 0x50, 0x4e, 0x47])), { kind: 'unsupported', reason: 'image' });
    assert.deepEqual(detectCadFormat('shape.txt', text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), { kind: 'supported', format: 'svg' });
    assert.deepEqual(detectCadFormat('shape.txt', text('  0\nSECTION\n  2\nHEADER\n')), { kind: 'supported', format: 'dxf' });
    assert.deepEqual(detectCadFormat('model.step', text('ISO-10303-21;')), { kind: 'unsupported', reason: 'step' });
    assert.deepEqual(detectCadFormat('mystery.xyz', text('hello')), { kind: 'unsupported', reason: 'unknown' });
    assert.deepEqual(detectCadFormat('rect-with-border-binary.dxf', fixtureBytes('rect-with-border-binary.dxf')), { kind: 'supported', format: 'dxf-binary' });
  });
});

describe('DXF fixtures', () => {
  it('reads a rectangle and skips the title border, dimensions and text', () => {
    const { analysis } = analyzeFixture('rect-with-border-r2010.dxf');
    assert.equal(analysis.units.label, 'mm');
    assert.equal(analysis.candidates.length, 3);
    assert.equal(analysis.candidates[0].frameLike, true);
    assert.equal(analysis.outlineIndex, 1);
    assert.equal(analysis.outline.widthMm, 1200);
    assert.equal(analysis.outline.heightMm, 800);
    assert.equal(analysis.outline.shape, 'RECTANGLE');
    near(analysis.outline.areaSqM, 0.96, 1e-9, 'area');
    near(analysis.outline.perimeterM, 4, 1e-9, 'perimeter');
    assert.equal(analysis.stats.skippedCounts.DIMENSION, 2);
    assert.equal(analysis.stats.skippedCounts.TEXT, 1);
  });

  it('reads the binary DXF encoding of the same drawing', () => {
    const { analysis, format } = analyzeFixture('rect-with-border-binary.dxf');
    assert.equal(format, 'dxf-binary');
    assert.equal(analysis.outline.widthMm, 1200);
    assert.equal(analysis.outline.heightMm, 800);
    assert.equal(analysis.outlineIndex, 1);
    const ascii = tokenizeAsciiDxf(Buffer.from(fixtureBytes('rect-with-border-r2010.dxf')).toString('utf8'));
    const binary = tokenizeBinaryDxf(fixtureBytes('rect-with-border-binary.dxf'));
    assert.equal(binary.length, ascii.length);
  });

  it('joins R12 lines and arcs into a rounded rectangle and counts holes once per centre', () => {
    const { analysis } = analyzeFixture('rounded-rect-lines-arcs-r12.dxf');
    assert.equal(analysis.units.assumed, true);
    assert.equal(analysis.outline.widthMm, 1000);
    assert.equal(analysis.outline.heightMm, 600);
    assert.equal(analysis.outline.shape, 'RECTANGLE');
    assert.equal(analysis.outline.radiusCorners, true);
    assert.deepEqual(analysis.outline.cornerRadiiMm, [50]);
    assert.equal(analysis.holes.count, 2);
    assert.deepEqual(analysis.holes.diametersMm, [12, 12]);
    assert.equal(analysis.stats.openChains, 1);
    near(analysis.outline.areaSqM, (1000 * 600 - (4 - Math.PI) * 50 * 50) / 1e6, 1e-5, 'area with corner deductions');
    near(analysis.outline.perimeterM, (2 * (900 + 500) + 2 * Math.PI * 50) / 1000, 1e-5, 'perimeter');
  });

  it('converts inches and recognises a right-angle triangle', () => {
    const { analysis } = analyzeFixture('triangle-inches-r2000.dxf');
    assert.equal(analysis.units.label, 'in');
    assert.equal(analysis.outline.widthMm, 914.4);
    assert.equal(analysis.outline.heightMm, 609.6);
    assert.equal(analysis.outline.shape, 'TRIANGLE');
    near(analysis.outline.areaSqM, (0.9144 * 0.6096) / 2, 1e-6, 'area');
  });

  it('reports the true sides of a rotated rectangle', () => {
    const { analysis } = analyzeFixture('rotated-rect-r2010.dxf');
    assert.equal(analysis.outline.shape, 'RECTANGLE');
    assert.equal(analysis.outline.widthMm, 1000);
    assert.equal(analysis.outline.heightMm, 500);
    assert.equal(analysis.outline.rotationDeg, 30);
    near(analysis.outline.areaSqM, 0.5, 1e-9, 'area');
  });

  it('classifies curved and polygonal outlines', () => {
    const arched = analyzeFixture('arched-top-r2010.dxf').analysis.outline;
    assert.equal(arched.shape, 'COMPLEX');
    assert.equal(arched.hasCurvedEdges, true);
    assert.equal(arched.widthMm, 800);
    assert.equal(arched.heightMm, 1000);
    near(arched.areaSqM, (800 * 600 + (Math.PI * 400 * 400) / 2) / 1e6, 1e-4, 'arched area');

    const spline = analyzeFixture('spline-blob-r2010.dxf').analysis.outline;
    assert.equal(spline.shape, 'COMPLEX');
    assert.equal(spline.straightEdges, 0);
    assert.equal(spline.rotationDeg, 0);

    const circle = analyzeFixture('circle-metres-r2010.dxf').analysis.outline;
    assert.equal(circle.shapeLabel, 'Circle Ø900');
    assert.equal(circle.widthMm, 900);
    near(circle.areaSqM, Math.PI * 0.45 * 0.45, 1e-4, 'circle area');

    const ellipse = analyzeFixture('ellipse-r2010.dxf').analysis.outline;
    assert.equal(ellipse.shapeLabel, 'Ellipse');
    assert.equal(ellipse.widthMm, 1000);
    assert.equal(ellipse.heightMm, 600);

    const trapezoid = analyzeFixture('trapezoid-r2010.dxf').analysis.outline;
    assert.equal(trapezoid.shape, 'SIMPLE');
    assert.equal(trapezoid.straightEdges, 4);

    const chamfered = analyzeFixture('chamfered-rect-r2010.dxf').analysis.outline;
    assert.equal(chamfered.shape, 'SIMPLE');
    assert.equal(chamfered.straightEdges, 6);
  });

  it('expands block inserts with scale and rotation', () => {
    const { analysis } = analyzeFixture('block-insert-r2010.dxf');
    assert.equal(analysis.outline.widthMm, 400);
    assert.equal(analysis.outline.heightMm, 600);
    assert.equal(analysis.holes.count, 1);
    assert.deepEqual(analysis.holes.diametersMm, [16]);
  });

  it('handles bulge polylines, old POLYLINE entities and unit codes', () => {
    const cm = analyzeFixture('bulge-rounded-rect-cm-r2010.dxf').analysis;
    assert.equal(cm.units.label, 'cm');
    assert.equal(cm.outline.widthMm, 1200);
    assert.equal(cm.outline.heightMm, 800);
    assert.deepEqual(cm.outline.cornerRadiiMm, [40]);

    const old = analyzeFixture('polyline-rounded-rect-r12.dxf').analysis;
    assert.equal(old.outline.widthMm, 500);
    assert.equal(old.outline.heightMm, 300);
    assert.deepEqual(old.outline.cornerRadiiMm, [25]);
    assert.equal(old.outline.radiusCorners, true);
  });

  it('falls back to hatch boundaries and ignores frozen layers and paper space', () => {
    const hatch = analyzeFixture('hatch-only-r2010.dxf').analysis;
    assert.equal(hatch.outline.widthMm, 700);
    assert.ok(hatch.warnings.some((warning) => /hatch boundary/.test(warning)));

    const paper = analyzeFixture('paperspace-and-frozen-r2010.dxf').analysis;
    assert.equal(paper.candidates.length, 1);
    assert.equal(paper.outline.widthMm, 650);
    assert.equal(paper.outline.heightMm, 450);
    assert.equal(paper.stats.skippedCounts['hidden layer'], 1);
  });

  it('closes a rectangle whose lines leave a tiny gap', () => {
    const { analysis } = analyzeFixture('rect-with-gap-r2010.dxf');
    assert.equal(analysis.outline.shape, 'RECTANGLE');
    assert.equal(analysis.outline.widthMm, 800);
    assert.equal(analysis.outline.heightMm, 500);
  });
});

describe('SVG fixtures', () => {
  it('reads an Inkscape-style rounded rectangle in millimetres with holes', () => {
    const { analysis } = analyzeFixture('rounded-rect-mm.svg');
    assert.equal(analysis.outline.widthMm, 1200);
    assert.equal(analysis.outline.heightMm, 800);
    assert.deepEqual(analysis.outline.cornerRadiiMm, [60]);
    assert.equal(analysis.holes.count, 4);
    assert.equal(analysis.candidates[0].preferred, true);
    assert.equal(analysis.units.assumed, false);
  });

  it('reads path arc commands and converts inches through the viewBox', () => {
    const { analysis } = analyzeFixture('path-arcs-inches.svg');
    assert.equal(analysis.outline.widthMm, 1016);
    assert.equal(analysis.outline.heightMm, 609.6);
    assert.deepEqual(analysis.outline.cornerRadiiMm, [50.8]);
    assert.equal(analysis.outline.shape, 'RECTANGLE');
  });

  it('flags missing units on px-only files', () => {
    const { analysis } = analyzeFixture('px-no-viewbox.svg');
    assert.equal(analysis.units.assumed, true);
    assert.equal(analysis.outline.widthMm, 700);
    assert.equal(analysis.outline.shape, 'SIMPLE');
  });

  it('applies nested transforms, skips the frame and counts holes and cutouts', () => {
    const { analysis } = analyzeFixture('inkscape-transform.svg');
    assert.equal(analysis.candidates[0].frameLike, true);
    assert.equal(analysis.outline.widthMm, 100);
    assert.equal(analysis.outline.heightMm, 150);
    assert.equal(analysis.outline.shape, 'SIMPLE');
    assert.equal(analysis.holes.count, 2);
    assert.equal(analysis.holes.cutouts, 1);
    assert.equal(analysis.stats.openChains, 0);
  });

  it('flattens bezier curves and ignores hidden elements', () => {
    const { analysis } = analyzeFixture('bezier-curved-top.svg');
    assert.equal(analysis.outline.shape, 'COMPLEX');
    assert.equal(analysis.outline.curvedEdges, 2);
    assert.equal(analysis.outline.widthMm, 800);
    assert.equal(analysis.outline.heightMm, 600);
    assert.equal(analysis.stats.skippedCounts.hidden, 1);
  });

  it('parses compact path syntax and transforms', () => {
    const subPaths = parsePathData('M10 10h20v20h-20z m40 0 a5 5 0 1 0 10 0a5 5 0 1010-10 0');
    assert.equal(subPaths.length, 2);
    assert.equal(subPaths[0].closed, true);
    assert.equal(subPaths[0].primitives.length, 4);
    assert.equal(subPaths[1].primitives.length, 2);
    const matrix = parseTransform('translate(10, 20) scale(2)');
    assert.deepEqual(matrix, { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 });
    const doc = parseSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10cm" height="5cm" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>');
    assert.equal(doc.unitsToMm, 1);
    assert.equal(doc.paths.length, 1);
  });
});

describe('applying CAD geometry to a specification', () => {
  it('fills the geometry fields and leaves glass choices alone', () => {
    const { analysis } = analyzeFixture('rounded-rect-lines-arcs-r12.dxf');
    const outline = buildCadOutline(analysis, { fileName: 'panel.dxf', format: 'dxf', priceOnMeasured: true, importedAt: '2026-01-01T00:00:00.000Z' });
    const { spec, applied } = applyCadAnalysisToSpec({ ...baseSpec, glassType: 'Grey', thickness: 6, ceramicBand: true }, analysis, outline);
    assert.equal(spec.width, 1000);
    assert.equal(spec.height, 600);
    assert.equal(spec.shape, 'RECTANGLE');
    assert.equal(spec.radiusCorners, true);
    assert.equal(spec.holes, true);
    assert.equal(spec.numHoles, 2);
    assert.equal(spec.glassType, 'Grey');
    assert.equal(spec.thickness, 6);
    assert.equal(spec.ceramicBand, true);
    assert.equal(spec.edgework, 'FLAT POLISH - STRAIGHT');
    assert.equal(spec.cadOutline?.fileName, 'panel.dxf');
    assert.ok(applied.some((field) => field.field === 'Width' && field.value === '1000 mm'));
  });

  it('stores a compact drawable outline with the specification', () => {
    const rounded = analyzeFixture('rounded-rect-lines-arcs-r12.dxf').analysis;
    const outline = buildCadOutline(rounded, { fileName: 'panel.dxf', format: 'dxf', priceOnMeasured: true });
    const geometry = outline.geometry!;
    assert.ok(geometry.points.length >= 4, 'outline keeps enough points to draw');
    assert.ok(geometry.points.length <= 240, `outline is decimated for storage, got ${geometry.points.length}`);
    near(geometry.boundingWidthMm, 1000, 0.5, 'stored bounding width');
    near(geometry.boundingHeightMm, 600, 0.5, 'stored bounding height');
    assert.equal(geometry.holes?.length, 2);
    geometry.points.forEach(([x, y]) => {
      assert.ok(x >= -0.5 && x <= geometry.boundingWidthMm + 0.5, `x ${x} sits inside the bounding box`);
      assert.ok(y >= -0.5 && y <= geometry.boundingHeightMm + 0.5, `y ${y} sits inside the bounding box`);
      assert.equal(Math.round(x * 10) / 10, x, 'x is rounded to 0.1mm');
    });
    // A spec has to survive a round trip through purchase order line notes.
    const serialized = JSON.stringify(outline);
    assert.ok(serialized.length < 40000, `stored outline stays small, got ${serialized.length} bytes`);
    assert.deepEqual(JSON.parse(serialized).geometry.points[0], geometry.points[0]);
  });

  it('keeps a curved outline drawable without collapsing it to a box', () => {
    const { analysis } = analyzeFixture('spline-blob-r2010.dxf');
    const outline = buildCadOutline(analysis, { fileName: 'blob.dxf', format: 'dxf', priceOnMeasured: true });
    const geometry = outline.geometry!;
    assert.ok(geometry.points.length > 20, 'a curved outline keeps enough points to look curved');
    const distinctX = new Set(geometry.points.map(([x]) => Math.round(x))).size;
    assert.ok(distinctX > 10, 'points vary along x rather than tracing a rectangle');
  });

  it('switches straight edgework to curved when the outline has curved edges', () => {
    const { analysis } = analyzeFixture('arched-top-r2010.dxf');
    const outline = buildCadOutline(analysis, { fileName: 'arch.dxf', format: 'dxf', priceOnMeasured: true });
    const { spec } = applyCadAnalysisToSpec(baseSpec, analysis, outline);
    assert.equal(spec.edgework, 'FLAT POLISH - CURVED');
    assert.equal(spec.shape, 'COMPLEX');
    const rough = applyCadAnalysisToSpec({ ...baseSpec, edgework: 'ROUGH ARRIS' }, analysis, outline).spec;
    assert.equal(rough.edgework, 'ROUGH ARRIS');
  });

  it('prices on the measured outline when attached and on width x height otherwise', () => {
    const { analysis } = analyzeFixture('circle-metres-r2010.dxf');
    const outline = buildCadOutline(analysis, { fileName: 'circle.dxf', format: 'dxf', priceOnMeasured: true });
    const { spec } = applyCadAnalysisToSpec(baseSpec, analysis, outline);
    const measured = calculateCost(spec);
    near(measured.baseGlass, 92.47 * Math.PI * 0.45 * 0.45, 0.05, 'base glass on measured area');
    near(measured.edgework, 12.66 * Math.PI * 0.9, 0.01, 'curved polish on measured perimeter');

    const boxed = calculateCost({ ...spec, cadOutline: { ...outline, priceOnMeasured: false } });
    near(boxed.baseGlass, 92.47 * 0.81, 1e-6, 'base glass on bounding box');
    near(boxed.edgework, 12.66 * 3.6, 1e-6, 'edgework on bounding perimeter');
    assert.ok(measured.total < boxed.total);
  });
});
