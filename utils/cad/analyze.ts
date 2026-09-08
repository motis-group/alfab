// Turns a parsed CAD document into the numbers the costing calculator needs:
// glass outline size, measured area/perimeter, shape classification, radius corners and holes.

import { ShapeType } from '../calculations';
import { ArcPrimitive, LinePrimitive, Point, Primitive, TWO_PI, boxContains, decimatePolygon, degToRad, distance, intersectLines, isFullCircle, minimumAreaRectangle, normalizeOrientedRectangle, pointInPolygon, polygonCentroid, primitiveLength, primitiveTangent, radToDeg, scaleMatrix, transformPrimitive } from './geometry';
import { CadDocument, CadLoop, CadPath, buildLoops } from './model';

export interface CadAnalysisOptions {
  unitsToMm?: number | null;
  outlineIndex?: number | null;
}

export interface CadCandidate {
  index: number;
  label: string;
  widthMm: number;
  heightMm: number;
  areaSqM: number;
  layer: string;
  shapeLabel: string;
  frameLike: boolean;
  frameReason: string | null;
  preferred: boolean;
}

export interface CadOutlineDetails {
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  boundingWidthMm: number;
  boundingHeightMm: number;
  areaSqM: number;
  perimeterM: number;
  shape: ShapeType;
  shapeLabel: string;
  radiusCorners: boolean;
  cornerRadiiMm: number[];
  hasCurvedEdges: boolean;
  straightEdges: number;
  curvedEdges: number;
  reasons: string[];
  layer: string;
  polygon: Point[];
}

export interface CadHoleDetails {
  count: number;
  diametersMm: number[];
  centers: Point[];
  cutouts: number;
  cutoutPolygons: Point[][];
}

export interface CadAnalysis {
  units: { toMm: number; label: string; assumed: boolean; overridden: boolean };
  candidates: CadCandidate[];
  outlineIndex: number;
  outline: CadOutlineDetails;
  holes: CadHoleDetails;
  previewWidthMm: number;
  previewHeightMm: number;
  warnings: string[];
  stats: { loops: number; openChains: number; entityCounts: Record<string, number>; skippedCounts: Record<string, number> };
}

export interface LoopClassification {
  shape: ShapeType;
  label: string;
  reasons: string[];
  radiusCorners: boolean;
  cornerRadii: number[];
  hasCurvedEdges: boolean;
  straightEdges: number;
  curvedEdges: number;
  corners: Point[];
  isRectangle: boolean;
  isCircle: boolean;
  circle: { center: Point; radius: number } | null;
  rectangleSides: { width: number; height: number; angle: number } | null;
}

const MAX_CANDIDATES = 12;
// Small closed loops are holes, not outline candidates.
const HOLE_CANDIDATE_MAX_MM = 60;
const FRAME_LAYER_PATTERN = /border|title|frame|sheet|paper|layout|dimension|\bdim\b|annot|\btext\b|notes?\b|defpoints|viewport|legend/i;
const GLASS_LAYER_PATTERN = /glass|glaz|panel|pane|cut|profile|outline|window|screen/i;
const FILLET_TANGENT_COS = Math.cos(degToRad(4));
const COLLINEAR_COS = Math.cos(degToRad(0.5));

export class CadAnalysisError extends Error {
  hint: string;

  constructor(message: string, hint = '') {
    super(message);
    this.name = 'CadAnalysisError';
    this.hint = hint;
    Object.setPrototypeOf(this, CadAnalysisError.prototype);
  }
}

export function formatMm(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}

function mergePair(a: Primitive, b: Primitive, tolerance: number): Primitive | null {
  if (a.kind === 'line' && b.kind === 'line') {
    const da = primitiveTangent(a, true);
    const db = primitiveTangent(b, false);
    if (da.x * db.x + da.y * db.y >= COLLINEAR_COS) {
      return { kind: 'line', start: a.start, end: b.end };
    }
    return null;
  }
  if (a.kind === 'arc' && b.kind === 'arc') {
    const sameCircle = distance(a.center, b.center) <= tolerance * 2 && Math.abs(a.radius - b.radius) <= Math.max(tolerance * 2, a.radius * 1e-4);
    const sameDirection = Math.sign(a.sweepAngle) === Math.sign(b.sweepAngle);
    if (sameCircle && sameDirection && Math.abs(a.sweepAngle) + Math.abs(b.sweepAngle) <= TWO_PI + 1e-6) {
      return { kind: 'arc', center: a.center, radius: a.radius, startAngle: a.startAngle, sweepAngle: a.sweepAngle + b.sweepAngle };
    }
  }
  return null;
}

// Drops negligible pieces and merges consecutive collinear lines / co-circular arcs (cyclically).
export function normalizePrimitives(primitives: Primitive[], tolerance: number): Primitive[] {
  let list = primitives.filter((primitive) => primitiveLength(primitive) > tolerance);
  let changed = true;
  let guard = 0;
  while (changed && guard < 64 && list.length > 1) {
    changed = false;
    guard += 1;
    const merged: Primitive[] = [];
    list.forEach((current) => {
      const previous = merged.length ? merged[merged.length - 1] : null;
      const combined = previous ? mergePair(previous, current, tolerance) : null;
      if (combined) {
        merged[merged.length - 1] = combined;
        changed = true;
      } else {
        merged.push(current);
      }
    });
    if (merged.length > 1) {
      const wrapped = mergePair(merged[merged.length - 1], merged[0], tolerance);
      if (wrapped) {
        merged.pop();
        merged[0] = wrapped;
        changed = true;
      }
    }
    list = merged;
  }
  return list;
}

function detectCircle(loop: CadLoop, primitives: Primitive[], tolerance: number): { center: Point; radius: number } | null {
  if (primitives.length === 1 && primitives[0].kind === 'arc' && isFullCircle(primitives[0])) {
    return { center: primitives[0].center, radius: primitives[0].radius };
  }
  if (loop.polygon.length < 8) {
    return null;
  }
  const center = polygonCentroid(loop.polygon);
  const radii = loop.polygon.map((p) => distance(p, center));
  const mean = radii.reduce((sum, r) => sum + r, 0) / radii.length;
  if (mean <= 0) {
    return null;
  }
  const maxDeviation = radii.reduce((max, r) => Math.max(max, Math.abs(r - mean)), 0);
  if (maxDeviation <= Math.max(tolerance * 4, mean * 0.005)) {
    return { center, radius: mean };
  }
  return null;
}

function lineDirection(line: LinePrimitive): Point {
  return primitiveTangent(line, false);
}

function isFilletArc(primitives: Primitive[], index: number, minDim: number): boolean {
  const n = primitives.length;
  if (n < 3) {
    return false;
  }
  const arc = primitives[index];
  const previous = primitives[(index - 1 + n) % n];
  const next = primitives[(index + 1) % n];
  if (arc.kind !== 'arc' || previous.kind !== 'line' || next.kind !== 'line') {
    return false;
  }
  if (Math.abs(arc.sweepAngle) > degToRad(170) || arc.radius > 0.5 * minDim) {
    return false;
  }
  const incoming = primitiveTangent(previous, true);
  const arcStart = primitiveTangent(arc, false);
  const arcEnd = primitiveTangent(arc, true);
  const outgoing = primitiveTangent(next, false);
  const tangentIn = incoming.x * arcStart.x + incoming.y * arcStart.y >= FILLET_TANGENT_COS;
  const tangentOut = arcEnd.x * outgoing.x + arcEnd.y * outgoing.y >= FILLET_TANGENT_COS;
  return tangentIn && tangentOut;
}

function turnAngles(corners: Point[]): number[] {
  const n = corners.length;
  const turns: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = corners[(i - 1 + n) % n];
    const current = corners[i];
    const next = corners[(i + 1) % n];
    const e1 = { x: current.x - prev.x, y: current.y - prev.y };
    const e2 = { x: next.x - current.x, y: next.y - current.y };
    const cross = e1.x * e2.y - e1.y * e2.x;
    const dot = e1.x * e2.x + e1.y * e2.y;
    turns.push(Math.atan2(cross, dot));
  }
  return turns;
}

// Removes very short edges (CAD clean-up artefacts) by intersecting their neighbours, then drops collinear corners.
function simplifyCorners(corners: Point[], minDim: number): Point[] {
  let list = corners.slice();
  const collapseTolerance = Math.max(0.2, Math.min(2, 0.01 * minDim));
  let guard = 0;
  while (list.length > 3 && guard < 32) {
    guard += 1;
    const n = list.length;
    let shortest = -1;
    let shortestLength = Infinity;
    for (let i = 0; i < n; i += 1) {
      const length = distance(list[i], list[(i + 1) % n]);
      if (length < shortestLength) {
        shortestLength = length;
        shortest = i;
      }
    }
    if (shortest < 0 || shortestLength > collapseTolerance) {
      break;
    }
    const a = list[(shortest - 1 + n) % n];
    const b = list[shortest];
    const c = list[(shortest + 1) % n];
    const d = list[(shortest + 2) % n];
    const meet = intersectLines(a, { x: b.x - a.x, y: b.y - a.y }, c, { x: d.x - c.x, y: d.y - c.y });
    const replacement = meet && distance(meet, b) < minDim ? meet : { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    const next: Point[] = [];
    for (let i = 0; i < n; i += 1) {
      if (i === shortest) {
        next.push(replacement);
      } else if (i !== (shortest + 1) % n) {
        next.push(list[i]);
      }
    }
    list = next;
  }

  // Drop corners that do not change direction.
  let removed = true;
  guard = 0;
  while (removed && list.length > 3 && guard < 64) {
    guard += 1;
    removed = false;
    const turns = turnAngles(list);
    for (let i = 0; i < list.length; i += 1) {
      if (Math.abs(turns[i]) < degToRad(0.5)) {
        list.splice(i, 1);
        removed = true;
        break;
      }
    }
  }
  return list;
}

export function classifyLoop(loop: CadLoop, tolerance: number): LoopClassification {
  const primitives = normalizePrimitives(loop.primitives, tolerance);
  const minDim = Math.max(1e-9, Math.min(loop.bbox.width, loop.bbox.height));
  const reasons: string[] = [];

  const circle = detectCircle(loop, primitives, tolerance);
  if (circle) {
    reasons.push(`Closed circle Ø${formatMm(circle.radius * 2)} → complex shape with curved edgework`);
    return {
      shape: 'COMPLEX',
      label: `Circle Ø${formatMm(circle.radius * 2)}`,
      reasons,
      radiusCorners: false,
      cornerRadii: [],
      hasCurvedEdges: true,
      straightEdges: 0,
      curvedEdges: 1,
      corners: [],
      isRectangle: false,
      isCircle: true,
      circle,
      rectangleSides: null,
    };
  }

  const n = primitives.length;
  const fillets = primitives.map((_primitive, i) => isFilletArc(primitives, i, minDim));
  const cornerRadii: number[] = [];
  const corners: Point[] = [];
  let curvedEdges = 0;
  let straightEdges = 0;
  let ellipseLike = false;

  for (let i = 0; i < n; i += 1) {
    const primitive = primitives[i];
    if (primitive.kind === 'line') {
      straightEdges += 1;
      const previousIndex = (i - 1 + n) % n;
      if (fillets[previousIndex]) {
        const previousLine = primitives[(i - 2 + n) % n] as LinePrimitive;
        const meet = intersectLines(previousLine.start, lineDirection(previousLine), primitive.start, lineDirection(primitive));
        corners.push(meet || primitive.start);
      } else {
        corners.push(primitive.start);
      }
      continue;
    }
    if (fillets[i]) {
      cornerRadii.push((primitive as ArcPrimitive).radius);
      continue;
    }
    curvedEdges += 1;
    if (primitive.kind === 'curve' && primitive.label === 'ellipse') {
      ellipseLike = true;
    }
  }

  const radiusCorners = cornerRadii.length > 0;
  const uniqueRadii = uniqueRounded(cornerRadii);
  if (radiusCorners) {
    reasons.push(`${cornerRadii.length} tangent corner arc${cornerRadii.length === 1 ? '' : 's'} (R${uniqueRadii.map(formatMm).join(' / R')}) → radius corners`);
  }

  if (curvedEdges > 0) {
    const label = ellipseLike && straightEdges === 0 && curvedEdges === 1 ? 'Ellipse' : `Curved shape (${curvedEdges} curved edge${curvedEdges === 1 ? '' : 's'}${straightEdges ? `, ${straightEdges} straight` : ''})`;
    reasons.push(`${curvedEdges} curved edge${curvedEdges === 1 ? '' : 's'} → complex shape with curved edgework`);
    return {
      shape: 'COMPLEX',
      label,
      reasons,
      radiusCorners,
      cornerRadii: uniqueRadii,
      hasCurvedEdges: true,
      straightEdges,
      curvedEdges,
      corners,
      isRectangle: false,
      isCircle: false,
      circle: null,
      rectangleSides: null,
    };
  }

  const simplified = simplifyCorners(corners, minDim);
  const sides = simplified.length;
  const turns = turnAngles(simplified);
  const orientation = turns.reduce((sum, turn) => sum + turn, 0) >= 0 ? 1 : -1;
  const reflex = turns.filter((turn) => Math.sign(turn) === -orientation && Math.abs(turn) > degToRad(2)).length;
  const rightAngles = turns.filter((turn) => Math.abs(Math.abs(turn) - Math.PI / 2) <= degToRad(1.5)).length;
  const isRectangle = sides === 4 && rightAngles === 4;

  let shape: ShapeType;
  let label: string;
  let rectangleSides: LoopClassification['rectangleSides'] = null;

  if (isRectangle) {
    shape = 'RECTANGLE';
    const side1 = distance(simplified[0], simplified[1]);
    const side2 = distance(simplified[1], simplified[2]);
    const angle = Math.atan2(simplified[1].y - simplified[0].y, simplified[1].x - simplified[0].x);
    const normalized = normalizeOrientedRectangle({ width: side1, height: side2, angle, area: side1 * side2 });
    rectangleSides = { width: normalized.width, height: normalized.height, angle: normalized.angle };
    label = radiusCorners ? `Rectangle with R${uniqueRadii.map(formatMm).join(' / R')} corners` : 'Rectangle';
    reasons.push('4 straight edges meeting at right angles → rectangle');
  } else if (sides === 3) {
    shape = 'TRIANGLE';
    label = rightAngles === 1 ? 'Right-angle triangle' : 'Triangle';
    reasons.push('3 straight edges → triangle');
  } else if (sides < 3) {
    shape = 'COMPLEX';
    label = 'Unrecognised outline';
    reasons.push('Could not identify the edges of the outline → treated as complex');
  } else if (reflex > 0) {
    shape = 'COMPLEX';
    label = `${sides}-sided shape with ${reflex} notch${reflex === 1 ? '' : 'es'}`;
    reasons.push(`${sides} straight edges including ${reflex} internal corner${reflex === 1 ? '' : 's'} → complex shape`);
  } else if (sides <= 6) {
    shape = 'SIMPLE';
    label = sides === 4 ? 'Four-sided shape (trapezoid / rake)' : `${sides}-sided shape`;
    reasons.push(`${sides} straight edges, no curves → simple shape`);
  } else {
    shape = 'COMPLEX';
    label = `${sides}-sided shape`;
    reasons.push(`${sides} straight edges → complex shape`);
  }

  return {
    shape,
    label,
    reasons,
    radiusCorners,
    cornerRadii: uniqueRadii,
    hasCurvedEdges: false,
    straightEdges,
    curvedEdges: 0,
    corners: simplified,
    isRectangle,
    isCircle: false,
    circle: null,
    rectangleSides,
  };
}

function uniqueRounded(values: number[]): number[] {
  const seen: number[] = [];
  values.forEach((value) => {
    const rounded = roundMm(value);
    if (!seen.some((existing) => Math.abs(existing - rounded) < 0.05)) {
      seen.push(rounded);
    }
  });
  return seen.sort((a, b) => a - b);
}

function scalePaths(paths: CadPath[], factor: number): CadPath[] {
  if (factor === 1) {
    return paths;
  }
  const matrix = scaleMatrix(factor, factor);
  return paths.map((path) => ({ ...path, primitives: path.primitives.map((primitive) => transformPrimitive(primitive, matrix, 0.01)) }));
}

function pathsExtent(paths: CadPath[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (p: Point) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  paths.forEach((path) => {
    path.primitives.forEach((primitive) => {
      if (primitive.kind === 'line') {
        consider(primitive.start);
        consider(primitive.end);
      } else if (primitive.kind === 'arc') {
        consider({ x: primitive.center.x - primitive.radius, y: primitive.center.y - primitive.radius });
        consider({ x: primitive.center.x + primitive.radius, y: primitive.center.y + primitive.radius });
      } else {
        primitive.points.forEach(consider);
      }
    });
  });
  if (!Number.isFinite(minX)) {
    return 0;
  }
  return Math.max(maxX - minX, maxY - minY);
}

interface LoopWithClassification {
  loop: CadLoop;
  classification: LoopClassification;
}

function candidateFrameReason(entry: LoopWithClassification, others: CadLoop[]): string | null {
  if (FRAME_LAYER_PATTERN.test(entry.loop.layer)) {
    return `layer "${entry.loop.layer}" looks like a drawing border or annotation layer`;
  }
  if (entry.classification.isRectangle) {
    const contained = others.filter((other) => other !== entry.loop && other.area >= entry.loop.area * 0.05 && other.area < entry.loop.area && boxContains(entry.loop.bbox, other.bbox, 1e-6) && pointInPolygon(other.polygon[0], entry.loop.polygon));
    if (contained.length) {
      return `it encloses ${contained.length} other outline${contained.length === 1 ? '' : 's'}, like a drawing border would`;
    }
  }
  return null;
}

function toPreview(p: Point, origin: Point, maxY: number, yUp: boolean): Point {
  return { x: p.x - origin.x, y: yUp ? maxY - p.y : p.y - origin.y };
}

export function analyzeCadDocument(doc: CadDocument, options: CadAnalysisOptions = {}): CadAnalysis {
  const overridden = options.unitsToMm !== undefined && options.unitsToMm !== null;
  const toMm = overridden ? (options.unitsToMm as number) : doc.unitsToMm !== null ? doc.unitsToMm : doc.unitsHint !== null ? doc.unitsHint : 1;
  const assumed = !overridden && doc.unitsToMm === null;
  const unitsLabel = overridden ? 'manual' : doc.unitsToMm !== null ? doc.unitsLabel : `${doc.unitsHintLabel || 'mm'} (assumed)`;
  const warnings: string[] = [];

  if (!doc.paths.length) {
    throw new CadAnalysisError('No drawable geometry was found in the file.', 'The file may only contain text, dimensions or 3D solids. Export the flat 2D outline of the glass as DXF or SVG.');
  }

  const scaled = scalePaths(doc.paths, toMm);
  const extent = pathsExtent(scaled);
  const joinTolerance = Math.max(0.05, extent * 2e-4);
  const flattenTolerance = Math.max(0.02, extent * 1e-5);

  const modelPaths = scaled.filter((path) => path.space === 'model' && path.source !== 'HATCH');
  let built = buildLoops(modelPaths, joinTolerance, flattenTolerance);
  if (!built.loops.length) {
    const hatchPaths = scaled.filter((path) => path.space === 'model');
    if (hatchPaths.length !== modelPaths.length) {
      built = buildLoops(hatchPaths, joinTolerance, flattenTolerance);
      if (built.loops.length) {
        warnings.push('The outline was taken from a hatch boundary because no closed lines were found.');
      }
    }
  }
  if (!built.loops.length && scaled.some((path) => path.space === 'paper')) {
    built = buildLoops(scaled, joinTolerance, flattenTolerance);
    if (built.loops.length) {
      warnings.push('No closed outline was found in model space; paper space geometry was used instead.');
    }
  }
  if (!built.loops.length) {
    throw new CadAnalysisError(
      built.openChains ? `The drawing has ${built.openChains} open line chain${built.openChains === 1 ? '' : 's'} but no closed outline.` : 'No closed outline was found in the drawing.',
      'The glass outline must be a closed shape (a closed polyline, or lines and arcs whose ends meet). Check for gaps at the corners and re-export.'
    );
  }

  const loops = built.loops.slice().sort((a, b) => b.area - a.area);
  const largestArea = loops[0].area;
  const candidateLoops = loops.filter((loop) => loop.area >= largestArea * 0.002 && !(loop.bbox.width <= HOLE_CANDIDATE_MAX_MM && loop.bbox.height <= HOLE_CANDIDATE_MAX_MM && loops.length > 1)).slice(0, MAX_CANDIDATES);
  const candidateEntries: LoopWithClassification[] = (candidateLoops.length ? candidateLoops : loops.slice(0, 1)).map((loop) => ({ loop, classification: classifyLoop(loop, joinTolerance) }));

  const candidates: CadCandidate[] = candidateEntries.map((entry, index) => {
    const frameReason = candidateFrameReason(entry, loops);
    const preferred = GLASS_LAYER_PATTERN.test(entry.loop.layer) && !frameReason;
    const dims = loopDimensions(entry);
    return {
      index,
      label: `${index + 1}. ${formatMm(dims.widthMm)} × ${formatMm(dims.heightMm)} mm · ${entry.classification.label}${entry.loop.layer && entry.loop.layer !== '0' && entry.loop.layer !== 'svg' ? ` · ${entry.loop.layer}` : ''}`,
      widthMm: dims.widthMm,
      heightMm: dims.heightMm,
      areaSqM: entry.loop.area / 1e6,
      layer: entry.loop.layer,
      shapeLabel: entry.classification.label,
      frameLike: !!frameReason,
      frameReason,
      preferred,
    };
  });

  let outlineIndex = 0;
  if (options.outlineIndex !== undefined && options.outlineIndex !== null && options.outlineIndex >= 0 && options.outlineIndex < candidates.length) {
    outlineIndex = options.outlineIndex;
  } else {
    const preferred = candidates.find((candidate) => candidate.preferred);
    const firstNonFrame = candidates.find((candidate) => !candidate.frameLike);
    const chosen = preferred || firstNonFrame || candidates[0];
    outlineIndex = chosen.index;
    if (chosen.index !== 0 && candidates[0].frameLike) {
      warnings.push(`Outline 1 was skipped because ${candidates[0].frameReason}; using outline ${chosen.index + 1} instead. Change the outline selection if this is wrong.`);
    }
  }

  const outlineEntry = candidateEntries[outlineIndex];
  const outlineLoop = outlineEntry.loop;
  const classification = outlineEntry.classification;
  const dims = loopDimensions(outlineEntry);

  // Holes and cutouts: closed loops sitting inside the outline.
  const circles: Array<{ center: Point; radius: number }> = [];
  const cutoutLoops: CadLoop[] = [];
  loops.forEach((loop) => {
    if (loop === outlineLoop || loop.area >= outlineLoop.area * 0.999 || loop.sources.indexOf('HATCH') >= 0) {
      return;
    }
    if (!boxContains(outlineLoop.bbox, loop.bbox, joinTolerance) || !pointInPolygon(loop.polygon[0], outlineLoop.polygon)) {
      return;
    }
    const circle = detectCircle(loop, normalizePrimitives(loop.primitives, joinTolerance), joinTolerance);
    if (circle) {
      circles.push(circle);
    } else {
      cutoutLoops.push(loop);
    }
  });

  // Concentric circles (hole + countersink) count as one hole; keep the smallest diameter.
  const holes: Array<{ center: Point; radius: number }> = [];
  circles
    .slice()
    .sort((a, b) => a.radius - b.radius)
    .forEach((circle) => {
      const duplicate = holes.some((hole) => distance(hole.center, circle.center) <= Math.max(1, hole.radius * 0.05));
      if (!duplicate) {
        holes.push(circle);
      }
    });
  const cutouts = cutoutLoops.filter((loop) => !holes.some((hole) => distance(polygonCentroid(loop.polygon), hole.center) <= hole.radius));

  const origin = { x: outlineLoop.bbox.minX, y: outlineLoop.bbox.minY };
  const maxY = outlineLoop.bbox.maxY;
  const preview = (p: Point) => toPreview(p, origin, maxY, doc.yUp);

  const outline: CadOutlineDetails = {
    widthMm: dims.widthMm,
    heightMm: dims.heightMm,
    rotationDeg: dims.rotationDeg,
    boundingWidthMm: roundMm(outlineLoop.bbox.width),
    boundingHeightMm: roundMm(outlineLoop.bbox.height),
    areaSqM: outlineLoop.area / 1e6,
    perimeterM: outlineLoop.perimeter / 1000,
    shape: classification.shape,
    shapeLabel: classification.label,
    radiusCorners: classification.radiusCorners,
    cornerRadiiMm: classification.cornerRadii,
    hasCurvedEdges: classification.hasCurvedEdges,
    straightEdges: classification.straightEdges,
    curvedEdges: classification.curvedEdges,
    reasons: classification.reasons.slice(),
    layer: outlineLoop.layer,
    polygon: decimatePolygon(outlineLoop.polygon, 800).map(preview),
  };

  if (dims.rotationDeg !== 0) {
    outline.reasons.push(`Outline is drawn at ${dims.rotationDeg.toFixed(1)}°; width and height are taken from the rotated rectangle around it`);
  }

  if (assumed) {
    warnings.push(`The file does not state its units; ${doc.unitsHintLabel || 'mm'} was assumed. Change the units if the size looks wrong.`);
  }
  const largest = Math.max(outline.widthMm, outline.heightMm);
  if (largest < 50) {
    warnings.push(`The outline is only ${formatMm(largest)} mm across; check the file units (inches or metres?).`);
  } else if (largest > 12000) {
    warnings.push(`The outline is ${formatMm(largest)} mm across; check the file units (centimetres or micrometres?).`);
  }
  if (holes.length) {
    warnings.push(`${holes.length} round hole${holes.length === 1 ? '' : 's'} detected (Ø${uniqueRounded(holes.map((hole) => hole.radius * 2)).map(formatMm).join(', Ø')} mm).`);
  }
  if (cutouts.length) {
    warnings.push(`${cutouts.length} non-round cutout${cutouts.length === 1 ? '' : 's'} inside the outline ${cutouts.length === 1 ? 'is' : 'are'} not priced automatically; review the shape and holes.`);
  }
  if (built.openChains) {
    warnings.push(`${built.openChains} open line chain${built.openChains === 1 ? ' was' : 's were'} ignored (dimension lines, centre lines or construction geometry).`);
  }
  doc.warnings.forEach((warning) => warnings.push(warning));

  let previewWidthMm = outlineLoop.bbox.width;
  let previewHeightMm = outlineLoop.bbox.height;
  const previewPolygons = [outline.polygon];
  const holeCenters = holes.map((hole) => preview(hole.center));
  const cutoutPolygons = cutouts.map((loop) => decimatePolygon(loop.polygon, 200).map(preview));
  cutoutPolygons.forEach((polygon) => previewPolygons.push(polygon));
  previewPolygons.forEach((polygon) => {
    polygon.forEach((p) => {
      if (p.x > previewWidthMm) previewWidthMm = p.x;
      if (p.y > previewHeightMm) previewHeightMm = p.y;
    });
  });

  return {
    units: { toMm, label: unitsLabel, assumed, overridden },
    candidates,
    outlineIndex,
    outline,
    holes: {
      count: holes.length,
      diametersMm: holes.map((hole) => roundMm(hole.radius * 2)),
      centers: holeCenters,
      cutouts: cutouts.length,
      cutoutPolygons,
    },
    previewWidthMm,
    previewHeightMm,
    warnings,
    stats: { loops: loops.length, openChains: built.openChains, entityCounts: doc.entityCounts, skippedCounts: doc.skippedCounts },
  };
}

function loopDimensions(entry: LoopWithClassification): { widthMm: number; heightMm: number; rotationDeg: number } {
  const { loop, classification } = entry;
  if (classification.rectangleSides) {
    const sides = classification.rectangleSides;
    if (Math.abs(sides.angle) <= degToRad(1)) {
      return { widthMm: roundMm(loop.bbox.width), heightMm: roundMm(loop.bbox.height), rotationDeg: 0 };
    }
    return { widthMm: roundMm(sides.width), heightMm: roundMm(sides.height), rotationDeg: Math.round(radToDeg(sides.angle) * 10) / 10 };
  }
  const box = loop.bbox;
  const minRect = minimumAreaRectangle(loop.polygon);
  // Only report rotated dimensions when the drawn orientation clearly wastes stock (>10% larger box).
  if (minRect.area < box.width * box.height * 0.9 && Math.abs(minRect.angle) > degToRad(1)) {
    return { widthMm: roundMm(minRect.width), heightMm: roundMm(minRect.height), rotationDeg: Math.round(radToDeg(minRect.angle) * 10) / 10 };
  }
  return { widthMm: roundMm(box.width), heightMm: roundMm(box.height), rotationDeg: 0 };
}
