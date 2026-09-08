// DXF (ASCII and binary) reader. Converts the 2D entities of a drawing into CadPaths.
// Only the geometry needed for glass outlines is read: lines, arcs, circles, ellipses,
// polylines, splines, block inserts and hatch boundaries. Text, dimensions and 3D solids are skipped.

import { Matrix, Point, Primitive, TWO_PI, arcFromBulge, degToRad, multiplyMatrix, rotationMatrix, sampleCatmullRom, sampleEllipse, sampleNurbs, scaleMatrix, transformPrimitive, translationMatrix } from './geometry';
import { CadDocument, CadPath, CadSpace, countBy } from './model';

interface Group {
  code: number;
  value: string;
}

interface Entity {
  type: string;
  groups: Group[];
}

interface BlockDefinition {
  name: string;
  base: Point;
  entities: Entity[];
}

interface LayerInfo {
  frozen: boolean;
  off: boolean;
}

interface ParseContext {
  blocks: Map<string, BlockDefinition>;
  layers: Map<string, LayerInfo>;
  paths: CadPath[];
  warnings: string[];
  entityCounts: Record<string, number>;
  skippedCounts: Record<string, number>;
  nonPlanar: number;
  threeD: number;
  flattenTolerance: number;
}

const BINARY_SENTINEL = 'AutoCAD Binary DXF\r\n\x1a\x00';
const MAX_INSERT_DEPTH = 8;
const MAX_ARRAY_INSERTS = 400;

// $INSUNITS values -> millimetres per drawing unit.
const INSUNITS_TO_MM: Record<number, { factor: number; label: string }> = {
  1: { factor: 25.4, label: 'in' },
  2: { factor: 304.8, label: 'ft' },
  3: { factor: 1609344, label: 'mi' },
  4: { factor: 1, label: 'mm' },
  5: { factor: 10, label: 'cm' },
  6: { factor: 1000, label: 'm' },
  7: { factor: 1000000, label: 'km' },
  8: { factor: 0.0000254, label: 'µin' },
  9: { factor: 0.0254, label: 'mil' },
  10: { factor: 914.4, label: 'yd' },
  11: { factor: 1e-7, label: 'Å' },
  12: { factor: 1e-6, label: 'nm' },
  13: { factor: 0.001, label: 'µm' },
  14: { factor: 100, label: 'dm' },
  15: { factor: 10000, label: 'dam' },
  16: { factor: 100000, label: 'hm' },
  17: { factor: 1e12, label: 'Gm' },
  21: { factor: 304.8006096, label: 'US survey ft' },
  22: { factor: 25.40005080, label: 'US survey in' },
  23: { factor: 914.4018288, label: 'US survey yd' },
  24: { factor: 1609347.219, label: 'US survey mi' },
};

const SKIPPED_ENTITY_TYPES = new Set([
  'TEXT',
  'MTEXT',
  'DIMENSION',
  'ARC_DIMENSION',
  'LARGE_RADIAL_DIMENSION',
  'SOLID',
  'POINT',
  'LEADER',
  'MLEADER',
  'MULTILEADER',
  'ATTDEF',
  'ATTRIB',
  'IMAGE',
  'WIPEOUT',
  'VIEWPORT',
  '3DFACE',
  'XLINE',
  'RAY',
  'TRACE',
  'REGION',
  'BODY',
  '3DSOLID',
  'SURFACE',
  'MESH',
  'TOLERANCE',
  'MLINE',
  'ACAD_TABLE',
  'ACAD_PROXY_ENTITY',
  'OLE2FRAME',
  'OLEFRAME',
  'SHAPE',
  'HELIX',
  'LIGHT',
  'SECTION',
  'UNDERLAY',
  'PDFUNDERLAY',
  'DGNUNDERLAY',
  'DWFUNDERLAY',
]);

export function isBinaryDxf(bytes: Uint8Array): boolean {
  if (bytes.length < BINARY_SENTINEL.length) {
    return false;
  }
  for (let i = 0; i < BINARY_SENTINEL.length; i += 1) {
    if (bytes[i] !== BINARY_SENTINEL.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

export function looksLikeAsciiDxf(text: string): boolean {
  const head = text.slice(0, 4000);
  return /^\s*0\s*\r?\n\s*SECTION/m.test(head) || /\n\s*0\s*\r?\n\s*(SECTION|EOF)\s*$/m.test(head) || /\$ACADVER/.test(head);
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    let result = '';
    for (let i = 0; i < bytes.length; i += 1) {
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }
}

export function tokenizeAsciiDxf(text: string): Group[] {
  const lines = text.split(/\r\n|\r|\n/);
  const groups: Group[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeText = lines[i].trim();
    if (codeText === '') {
      // Tolerate stray blank lines by re-synchronising on the next line.
      i -= 1;
      continue;
    }
    const code = parseInt(codeText, 10);
    if (Number.isNaN(code)) {
      continue;
    }
    groups.push({ code, value: lines[i + 1].trim() });
  }
  return groups;
}

function binaryValueKind(code: number): 'string' | 'double' | 'int16' | 'int32' | 'int64' | 'bool' | 'chunk' {
  if ((code >= 10 && code <= 59) || (code >= 110 && code <= 149) || (code >= 210 && code <= 239) || (code >= 460 && code <= 469) || (code >= 1010 && code <= 1059)) {
    return 'double';
  }
  if ((code >= 60 && code <= 79) || (code >= 170 && code <= 179) || (code >= 270 && code <= 289) || (code >= 370 && code <= 389) || (code >= 400 && code <= 409) || (code >= 1060 && code <= 1070)) {
    return 'int16';
  }
  if ((code >= 90 && code <= 99) || (code >= 420 && code <= 429) || (code >= 440 && code <= 459) || code === 1071) {
    return 'int32';
  }
  if (code >= 160 && code <= 169) {
    return 'int64';
  }
  if (code >= 290 && code <= 299) {
    return 'bool';
  }
  if ((code >= 310 && code <= 319) || code === 1004) {
    return 'chunk';
  }
  return 'string';
}

export function tokenizeBinaryDxf(bytes: Uint8Array): Group[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const groups: Group[] = [];
  let offset = BINARY_SENTINEL.length;
  // R13+ writes 2-byte group codes; R12 used a single byte with 255 as an escape.
  const twoByteCodes = bytes[offset] === 0 && bytes[offset + 1] === 0 && bytes[offset + 2] === 0x53;

  const readCode = (): number => {
    if (twoByteCodes) {
      const code = view.getUint16(offset, true);
      offset += 2;
      return code;
    }
    let code = bytes[offset];
    offset += 1;
    if (code === 255) {
      code = view.getUint16(offset, true);
      offset += 2;
    }
    return code;
  };

  const readString = (): string => {
    let end = offset;
    while (end < bytes.length && bytes[end] !== 0) {
      end += 1;
    }
    const text = decodeText(bytes.subarray(offset, end));
    offset = Math.min(bytes.length, end + 1);
    return text;
  };

  while (offset < bytes.length) {
    const code = readCode();
    if (offset > bytes.length) {
      break;
    }
    const kind = binaryValueKind(code);
    let value = '';
    switch (kind) {
      case 'double':
        if (offset + 8 > bytes.length) return groups;
        value = String(view.getFloat64(offset, true));
        offset += 8;
        break;
      case 'int16':
        if (offset + 2 > bytes.length) return groups;
        value = String(view.getInt16(offset, true));
        offset += 2;
        break;
      case 'int32':
        if (offset + 4 > bytes.length) return groups;
        value = String(view.getInt32(offset, true));
        offset += 4;
        break;
      case 'int64':
        if (offset + 8 > bytes.length) return groups;
        value = String(Number(view.getBigInt64(offset, true)));
        offset += 8;
        break;
      case 'bool':
        if (offset + 1 > bytes.length) return groups;
        value = String(bytes[offset]);
        offset += 1;
        break;
      case 'chunk': {
        if (offset + 1 > bytes.length) return groups;
        const length = bytes[offset];
        offset += 1 + length;
        value = '';
        break;
      }
      default:
        value = readString();
        break;
    }
    groups.push({ code, value: value.trim() });
    if (code === 0 && value === 'EOF') {
      break;
    }
  }
  return groups;
}

function numberValue(group: Group | undefined, fallback = 0): number {
  if (!group) {
    return fallback;
  }
  const value = Number(group.value);
  return Number.isFinite(value) ? value : fallback;
}

function firstGroup(entity: Entity, code: number): Group | undefined {
  for (let i = 0; i < entity.groups.length; i += 1) {
    if (entity.groups[i].code === code) {
      return entity.groups[i];
    }
  }
  return undefined;
}

function firstNumber(entity: Entity, code: number, fallback = 0): number {
  return numberValue(firstGroup(entity, code), fallback);
}

function allNumbers(entity: Entity, code: number): number[] {
  const values: number[] = [];
  entity.groups.forEach((group) => {
    if (group.code === code) {
      const value = Number(group.value);
      if (Number.isFinite(value)) {
        values.push(value);
      }
    }
  });
  return values;
}

// Collects x/y pairs in order of appearance (x code followed by y code).
function pointList(entity: Entity, xCode: number, yCode: number): Point[] {
  const points: Point[] = [];
  let current: Point | null = null;
  entity.groups.forEach((group) => {
    if (group.code === xCode) {
      current = { x: numberValue(group), y: 0 };
      points.push(current);
    } else if (group.code === yCode && current) {
      current.y = numberValue(group);
    }
  });
  return points;
}

function entitySpace(entity: Entity): CadSpace {
  return firstNumber(entity, 67, 0) === 1 ? 'paper' : 'model';
}

function entityLayer(entity: Entity): string {
  const group = firstGroup(entity, 8);
  return group ? group.value : '0';
}

function mirrorsX(entity: Entity): boolean {
  const extrusionZ = firstGroup(entity, 230);
  return extrusionZ ? numberValue(extrusionZ, 1) < 0 : false;
}

function isNonPlanar(entity: Entity): boolean {
  const z = firstGroup(entity, 230);
  if (!z) {
    return false;
  }
  return Math.abs(Math.abs(numberValue(z, 1)) - 1) > 1e-6;
}

function mirrorMatrix(): Matrix {
  return scaleMatrix(-1, 1);
}

function makePath(primitives: Primitive[], closed: boolean, entity: Entity, source: string): CadPath {
  return { primitives, closed, layer: entityLayer(entity), source, space: entitySpace(entity) };
}

function applyEntityMirror(primitives: Primitive[], entity: Entity, context: ParseContext): Primitive[] {
  if (!mirrorsX(entity)) {
    return primitives;
  }
  const m = mirrorMatrix();
  return primitives.map((primitive) => transformPrimitive(primitive, m, context.flattenTolerance));
}

function polylineFromVertices(vertices: Array<{ point: Point; bulge: number }>, closed: boolean): Primitive[] {
  const primitives: Primitive[] = [];
  const count = vertices.length;
  const last = closed ? count : count - 1;
  for (let i = 0; i < last; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % count];
    primitives.push(arcFromBulge(a.point, b.point, a.bulge));
  }
  return primitives;
}

function lwpolylinePaths(entity: Entity, context: ParseContext): CadPath[] {
  const vertices: Array<{ point: Point; bulge: number }> = [];
  let current: { point: Point; bulge: number } | null = null;
  entity.groups.forEach((group) => {
    if (group.code === 10) {
      current = { point: { x: numberValue(group), y: 0 }, bulge: 0 };
      vertices.push(current);
    } else if (group.code === 20 && current) {
      current.point.y = numberValue(group);
    } else if (group.code === 42 && current) {
      current.bulge = numberValue(group);
    }
  });
  if (vertices.length < 2) {
    return [];
  }
  const closed = (firstNumber(entity, 70, 0) & 1) === 1;
  const primitives = applyEntityMirror(polylineFromVertices(vertices, closed), entity, context);
  return [makePath(primitives, closed, entity, 'LWPOLYLINE')];
}

function polylinePaths(entity: Entity, vertexEntities: Entity[], context: ParseContext): CadPath[] {
  const flags = firstNumber(entity, 70, 0);
  if (flags & 16 || flags & 64) {
    countBy(context.skippedCounts, 'POLYLINE mesh');
    return [];
  }
  const splineFit = (flags & 4) === 4;
  const hasFitVertices = vertexEntities.some((vertex) => (firstNumber(vertex, 70, 0) & 8) === 8);
  const vertices: Array<{ point: Point; bulge: number }> = [];
  vertexEntities.forEach((vertex) => {
    const vertexFlags = firstNumber(vertex, 70, 0);
    if (splineFit && hasFitVertices && (vertexFlags & 16) === 16) {
      return;
    }
    vertices.push({ point: { x: firstNumber(vertex, 10, 0), y: firstNumber(vertex, 20, 0) }, bulge: firstNumber(vertex, 42, 0) });
  });
  if (vertices.length < 2) {
    return [];
  }
  const closed = (flags & 1) === 1;
  const primitives = applyEntityMirror(polylineFromVertices(vertices, closed), entity, context);
  return [makePath(primitives, closed, entity, 'POLYLINE')];
}

function linePaths(entity: Entity): CadPath[] {
  const start = { x: firstNumber(entity, 10), y: firstNumber(entity, 20) };
  const end = { x: firstNumber(entity, 11), y: firstNumber(entity, 21) };
  return [makePath([{ kind: 'line', start, end }], false, entity, 'LINE')];
}

function arcPaths(entity: Entity, context: ParseContext): CadPath[] {
  const center = { x: firstNumber(entity, 10), y: firstNumber(entity, 20) };
  const radius = firstNumber(entity, 40);
  if (radius <= 0) {
    return [];
  }
  const startAngle = degToRad(firstNumber(entity, 50, 0));
  const endAngle = degToRad(firstNumber(entity, 51, 360));
  let sweep = endAngle - startAngle;
  while (sweep <= 1e-9) {
    sweep += TWO_PI;
  }
  const arc: Primitive = { kind: 'arc', center, radius, startAngle, sweepAngle: sweep };
  return [makePath(applyEntityMirror([arc], entity, context), false, entity, 'ARC')];
}

function circlePaths(entity: Entity, context: ParseContext): CadPath[] {
  const center = { x: firstNumber(entity, 10), y: firstNumber(entity, 20) };
  const radius = firstNumber(entity, 40);
  if (radius <= 0) {
    return [];
  }
  const circle: Primitive = { kind: 'arc', center, radius, startAngle: 0, sweepAngle: TWO_PI };
  return [makePath(applyEntityMirror([circle], entity, context), true, entity, 'CIRCLE')];
}

function ellipsePaths(entity: Entity, context: ParseContext): CadPath[] {
  const center = { x: firstNumber(entity, 10), y: firstNumber(entity, 20) };
  const major = { x: firstNumber(entity, 11), y: firstNumber(entity, 21) };
  const ratio = firstNumber(entity, 40, 1);
  const startParam = firstNumber(entity, 41, 0);
  const endParam = firstNumber(entity, 42, TWO_PI);
  if (Math.hypot(major.x, major.y) <= 0 || ratio <= 0) {
    return [];
  }
  const points = sampleEllipse(center, major, ratio, startParam, endParam);
  const closed = Math.abs(Math.abs(endParam - startParam) - TWO_PI) < 1e-6 || (startParam === 0 && endParam === 0);
  const curve: Primitive = { kind: 'curve', points, label: 'ellipse' };
  return [makePath(applyEntityMirror([curve], entity, context), closed, entity, 'ELLIPSE')];
}

function splinePaths(entity: Entity, context: ParseContext): CadPath[] {
  const flags = firstNumber(entity, 70, 0);
  const degree = Math.max(1, Math.round(firstNumber(entity, 71, 3)));
  const knots = allNumbers(entity, 40);
  const weights = allNumbers(entity, 41);
  const controlPoints = pointList(entity, 10, 20);
  const fitPoints = pointList(entity, 11, 21);
  const closed = (flags & 1) === 1;

  let points: Point[] = [];
  if (controlPoints.length > degree && knots.length >= controlPoints.length + degree + 1) {
    const samples = Math.min(2000, Math.max(64, 24 * (controlPoints.length - degree)));
    points = sampleNurbs(degree, knots, controlPoints, weights.length === controlPoints.length ? weights : null, samples);
  } else if (fitPoints.length >= 2) {
    points = sampleCatmullRom(fitPoints, closed);
    context.warnings.push('A spline without control data was interpolated through its fit points.');
  } else if (controlPoints.length >= 2) {
    points = controlPoints;
  } else {
    return [];
  }

  const curve: Primitive = { kind: 'curve', points, label: 'spline' };
  return [makePath(applyEntityMirror([curve], entity, context), closed, entity, 'SPLINE')];
}

// Hatch boundary paths: used only as a fallback outline source by the analysis.
function hatchPaths(entity: Entity, context: ParseContext): CadPath[] {
  const paths: CadPath[] = [];
  const groups = entity.groups;
  let i = 0;
  while (i < groups.length && groups[i].code !== 91) {
    i += 1;
  }
  if (i >= groups.length) {
    return [];
  }
  const loopCount = numberValue(groups[i]);
  i += 1;
  for (let loopIndex = 0; loopIndex < loopCount && i < groups.length; loopIndex += 1) {
    while (i < groups.length && groups[i].code !== 92) {
      i += 1;
    }
    if (i >= groups.length) {
      break;
    }
    const pathType = numberValue(groups[i]);
    i += 1;
    const primitives: Primitive[] = [];

    if (pathType & 2) {
      // Polyline boundary: 72 has-bulge, 73 closed, 93 vertex count, then 10/20(/42) per vertex.
      let hasBulge = false;
      let closed = true;
      let vertexCount = 0;
      while (i < groups.length && groups[i].code !== 93) {
        if (groups[i].code === 72) hasBulge = numberValue(groups[i]) === 1;
        if (groups[i].code === 73) closed = numberValue(groups[i]) === 1;
        i += 1;
      }
      if (i < groups.length) {
        vertexCount = numberValue(groups[i]);
        i += 1;
      }
      const vertices: Array<{ point: Point; bulge: number }> = [];
      while (vertices.length < vertexCount && i < groups.length) {
        if (groups[i].code === 10) {
          const point = { x: numberValue(groups[i]), y: 0 };
          i += 1;
          if (i < groups.length && groups[i].code === 20) {
            point.y = numberValue(groups[i]);
            i += 1;
          }
          let bulge = 0;
          if (hasBulge && i < groups.length && groups[i].code === 42) {
            bulge = numberValue(groups[i]);
            i += 1;
          }
          vertices.push({ point, bulge });
        } else {
          i += 1;
        }
      }
      if (vertices.length >= 2) {
        polylineFromVertices(vertices, closed).forEach((primitive) => primitives.push(primitive));
      }
      if (primitives.length) {
        paths.push(makePath(applyEntityMirror(primitives, entity, context), true, entity, 'HATCH'));
      }
      continue;
    }

    // Edge list boundary: 93 edge count, then per edge 72 type + data.
    while (i < groups.length && groups[i].code !== 93) {
      i += 1;
    }
    if (i >= groups.length) {
      break;
    }
    const edgeCount = numberValue(groups[i]);
    i += 1;
    for (let edge = 0; edge < edgeCount && i < groups.length; edge += 1) {
      while (i < groups.length && groups[i].code !== 72) {
        i += 1;
      }
      if (i >= groups.length) {
        break;
      }
      const edgeType = numberValue(groups[i]);
      i += 1;
      const take = (code: number, fallback = 0): number => {
        if (i < groups.length && groups[i].code === code) {
          const value = numberValue(groups[i], fallback);
          i += 1;
          return value;
        }
        return fallback;
      };
      if (edgeType === 1) {
        const start = { x: take(10), y: take(20) };
        const end = { x: take(11), y: take(21) };
        primitives.push({ kind: 'line', start, end });
      } else if (edgeType === 2) {
        const center = { x: take(10), y: take(20) };
        const radius = take(40);
        const startDeg = take(50);
        const endDeg = take(51, 360);
        const ccw = take(73, 1) === 1;
        let sweep = degToRad(endDeg) - degToRad(startDeg);
        while (sweep <= 1e-9) sweep += TWO_PI;
        if (ccw) {
          primitives.push({ kind: 'arc', center, radius, startAngle: degToRad(startDeg), sweepAngle: sweep });
        } else {
          // Clockwise arcs are stored with mirrored angles.
          primitives.push({ kind: 'arc', center, radius, startAngle: Math.PI - degToRad(startDeg), sweepAngle: -sweep });
        }
      } else if (edgeType === 3) {
        const center = { x: take(10), y: take(20) };
        const major = { x: take(11), y: take(21) };
        const ratio = take(40, 1);
        const startDeg = take(50);
        const endDeg = take(51, 360);
        take(73, 1);
        primitives.push({ kind: 'curve', points: sampleEllipse(center, major, ratio, degToRad(startDeg), degToRad(endDeg)), label: 'ellipse' });
      } else if (edgeType === 4) {
        const degree = Math.max(1, take(94, 3));
        take(73, 0);
        take(74, 0);
        const knotCount = take(95, 0);
        const controlCount = take(96, 0);
        const knots: number[] = [];
        for (let k = 0; k < knotCount && i < groups.length && groups[i].code === 40; k += 1) {
          knots.push(numberValue(groups[i]));
          i += 1;
        }
        const controls: Point[] = [];
        const weights: number[] = [];
        for (let c = 0; c < controlCount && i < groups.length && groups[i].code === 10; c += 1) {
          const point = { x: numberValue(groups[i]), y: 0 };
          i += 1;
          if (i < groups.length && groups[i].code === 20) {
            point.y = numberValue(groups[i]);
            i += 1;
          }
          if (i < groups.length && groups[i].code === 42) {
            weights.push(numberValue(groups[i]));
            i += 1;
          }
          controls.push(point);
        }
        if (controls.length > degree && knots.length >= controls.length + degree + 1) {
          primitives.push({ kind: 'curve', points: sampleNurbs(degree, knots, controls, weights.length === controls.length ? weights : null, 64), label: 'spline' });
        } else if (controls.length >= 2) {
          primitives.push({ kind: 'curve', points: controls, label: 'spline' });
        }
      } else {
        break;
      }
    }
    if (primitives.length) {
      paths.push(makePath(applyEntityMirror(primitives, entity, context), true, entity, 'HATCH'));
    }
  }
  return paths;
}

function insertPaths(entity: Entity, context: ParseContext, parentTransform: Matrix, depth: number): CadPath[] {
  const nameGroup = firstGroup(entity, 2);
  const name = nameGroup ? nameGroup.value : '';
  if (!name || name.startsWith('*D') || name.startsWith('*X') || name.startsWith('*T') || name.toUpperCase().startsWith('*MODEL_SPACE') || name.toUpperCase().startsWith('*PAPER_SPACE')) {
    countBy(context.skippedCounts, 'INSERT (annotation block)');
    return [];
  }
  const block = context.blocks.get(name.toUpperCase());
  if (!block) {
    countBy(context.skippedCounts, 'INSERT (missing block)');
    return [];
  }
  if (depth >= MAX_INSERT_DEPTH) {
    countBy(context.skippedCounts, 'INSERT (nested too deep)');
    return [];
  }

  const insertPoint = { x: firstNumber(entity, 10), y: firstNumber(entity, 20) };
  const sx = firstNumber(entity, 41, 1) || 1;
  const sy = firstNumber(entity, 42, 1) || 1;
  const rotation = degToRad(firstNumber(entity, 50, 0));
  const columns = Math.max(1, Math.round(firstNumber(entity, 70, 1)));
  const rows = Math.max(1, Math.round(firstNumber(entity, 71, 1)));
  const columnSpacing = firstNumber(entity, 44, 0);
  const rowSpacing = firstNumber(entity, 45, 0);

  let local = multiplyMatrix(rotationMatrix(rotation), multiplyMatrix(scaleMatrix(sx, sy), translationMatrix(-block.base.x, -block.base.y)));
  if (mirrorsX(entity)) {
    local = multiplyMatrix(mirrorMatrix(), local);
  }

  const paths: CadPath[] = [];
  const space = entitySpace(entity);
  const layer = entityLayer(entity);
  let placed = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (placed >= MAX_ARRAY_INSERTS) {
        break;
      }
      placed += 1;
      const offset = { x: insertPoint.x + column * columnSpacing, y: insertPoint.y + row * rowSpacing };
      const transform = multiplyMatrix(parentTransform, multiplyMatrix(translationMatrix(offset.x, offset.y), local));
      block.entities.forEach((child) => {
        const childPaths = entityPaths(child, context, depth + 1);
        childPaths.forEach((path) => {
          paths.push({
            primitives: path.primitives.map((primitive) => transformPrimitive(primitive, transform, context.flattenTolerance)),
            closed: path.closed,
            layer: path.layer === '0' ? layer : path.layer,
            source: `${path.source} (block ${block.name})`,
            space,
          });
        });
      });
    }
  }
  return paths;
}

function layerIsHidden(context: ParseContext, layer: string): boolean {
  const info = context.layers.get(layer.toUpperCase());
  return !!info && (info.frozen || info.off);
}

function entityPaths(entity: Entity, context: ParseContext, depth: number, vertexEntities: Entity[] = []): CadPath[] {
  const layer = entityLayer(entity);
  if (layerIsHidden(context, layer)) {
    countBy(context.skippedCounts, 'hidden layer');
    return [];
  }
  if (firstNumber(entity, 60, 0) === 1) {
    countBy(context.skippedCounts, 'invisible');
    return [];
  }
  if (isNonPlanar(entity)) {
    context.nonPlanar += 1;
  }
  const z = firstGroup(entity, 30);
  if (z && Math.abs(numberValue(z)) > 1e-6) {
    context.threeD += 1;
  }

  countBy(context.entityCounts, entity.type);
  switch (entity.type) {
    case 'LINE':
      return linePaths(entity);
    case 'LWPOLYLINE':
      return lwpolylinePaths(entity, context);
    case 'POLYLINE':
      return polylinePaths(entity, vertexEntities, context);
    case 'ARC':
      return arcPaths(entity, context);
    case 'CIRCLE':
      return circlePaths(entity, context);
    case 'ELLIPSE':
      return ellipsePaths(entity, context);
    case 'SPLINE':
      return splinePaths(entity, context);
    case 'HATCH':
      return hatchPaths(entity, context);
    case 'INSERT':
      return insertPaths(entity, context, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, depth);
    default:
      countBy(context.skippedCounts, SKIPPED_ENTITY_TYPES.has(entity.type) ? entity.type : `${entity.type} (unsupported)`);
      return [];
  }
}

// Splits a run of groups into entities (each starting at a code-0 group).
function collectEntities(groups: Group[], start: number, terminator: string): { entities: Entity[]; next: number } {
  const entities: Entity[] = [];
  let current: Entity | null = null;
  let i = start;
  while (i < groups.length) {
    const group = groups[i];
    if (group.code === 0) {
      if (group.value === terminator || group.value === 'EOF') {
        break;
      }
      current = { type: group.value.toUpperCase(), groups: [] };
      entities.push(current);
    } else if (current) {
      current.groups.push(group);
    }
    i += 1;
  }
  return { entities, next: i };
}

function processEntities(entities: Entity[], context: ParseContext, sink: CadPath[]): void {
  let i = 0;
  while (i < entities.length) {
    const entity = entities[i];
    if (entity.type === 'POLYLINE') {
      const vertices: Entity[] = [];
      let j = i + 1;
      while (j < entities.length && entities[j].type === 'VERTEX') {
        vertices.push(entities[j]);
        j += 1;
      }
      if (j < entities.length && entities[j].type === 'SEQEND') {
        j += 1;
      }
      entityPaths(entity, context, 0, vertices).forEach((path) => sink.push(path));
      i = j;
      continue;
    }
    if (entity.type === 'VERTEX' || entity.type === 'SEQEND') {
      i += 1;
      continue;
    }
    entityPaths(entity, context, 0).forEach((path) => sink.push(path));
    i += 1;
  }
}

export function parseDxf(bytes: Uint8Array): CadDocument {
  const groups = isBinaryDxf(bytes) ? tokenizeBinaryDxf(bytes) : tokenizeAsciiDxf(decodeText(bytes));
  if (!groups.length) {
    throw new Error('The DXF file has no readable group codes.');
  }

  const context: ParseContext = {
    blocks: new Map<string, BlockDefinition>(),
    layers: new Map<string, LayerInfo>(),
    paths: [],
    warnings: [],
    entityCounts: {},
    skippedCounts: {},
    nonPlanar: 0,
    threeD: 0,
    flattenTolerance: 0.01,
  };

  let insUnits: number | null = null;
  let measurement: number | null = null;
  let acadVersion = '';
  const pendingBlockEntities: Array<{ block: BlockDefinition; entities: Entity[] }> = [];
  const entitySectionEntities: Entity[] = [];

  let i = 0;
  while (i < groups.length) {
    const group = groups[i];
    if (group.code !== 0 || group.value !== 'SECTION') {
      i += 1;
      continue;
    }
    const nameGroup = groups[i + 1];
    const sectionName = nameGroup && nameGroup.code === 2 ? nameGroup.value.toUpperCase() : '';
    i += 2;

    if (sectionName === 'HEADER') {
      while (i < groups.length && !(groups[i].code === 0 && groups[i].value === 'ENDSEC')) {
        if (groups[i].code === 9) {
          const variable = groups[i].value.toUpperCase();
          const valueGroup = groups[i + 1];
          if (variable === '$INSUNITS' && valueGroup) insUnits = numberValue(valueGroup, 0);
          if (variable === '$MEASUREMENT' && valueGroup) measurement = numberValue(valueGroup, 1);
          if (variable === '$ACADVER' && valueGroup) acadVersion = valueGroup.value;
        }
        i += 1;
      }
      continue;
    }

    if (sectionName === 'TABLES') {
      while (i < groups.length && !(groups[i].code === 0 && groups[i].value === 'ENDSEC')) {
        if (groups[i].code === 0 && groups[i].value === 'LAYER') {
          const { entities, next } = collectEntitiesUntil(groups, i, 'ENDTAB');
          entities.forEach((entry) => {
            if (entry.type !== 'LAYER') return;
            const name = firstGroup(entry, 2);
            if (!name) return;
            const flags = firstNumber(entry, 70, 0);
            const color = firstNumber(entry, 62, 7);
            context.layers.set(name.value.toUpperCase(), { frozen: (flags & 1) === 1, off: color < 0 });
          });
          i = next;
          continue;
        }
        i += 1;
      }
      continue;
    }

    if (sectionName === 'BLOCKS') {
      while (i < groups.length && !(groups[i].code === 0 && groups[i].value === 'ENDSEC')) {
        if (groups[i].code === 0 && groups[i].value === 'BLOCK') {
          const header: Entity = { type: 'BLOCK', groups: [] };
          let j = i + 1;
          while (j < groups.length && groups[j].code !== 0) {
            header.groups.push(groups[j]);
            j += 1;
          }
          const nameGroupBlock = firstGroup(header, 2);
          const block: BlockDefinition = {
            name: nameGroupBlock ? nameGroupBlock.value : '',
            base: { x: firstNumber(header, 10), y: firstNumber(header, 20) },
            entities: [],
          };
          const { entities, next } = collectEntities(groups, j, 'ENDBLK');
          block.entities = entities;
          if (block.name) {
            context.blocks.set(block.name.toUpperCase(), block);
          }
          pendingBlockEntities.push({ block, entities });
          i = next;
          continue;
        }
        i += 1;
      }
      continue;
    }

    if (sectionName === 'ENTITIES') {
      const { entities, next } = collectEntities(groups, i, 'ENDSEC');
      entities.forEach((entity) => entitySectionEntities.push(entity));
      i = next;
      continue;
    }
  }

  processEntities(entitySectionEntities, context, context.paths);

  if (!context.paths.length && pendingBlockEntities.length) {
    // Some exporters put the whole drawing in a block without inserting it; fall back to block contents.
    pendingBlockEntities.forEach((entry) => {
      if (entry.block.name.startsWith('*')) return;
      processEntities(entry.entities, context, context.paths);
    });
    if (context.paths.length) {
      context.warnings.push('No entities were found in model space; geometry was read from block definitions instead.');
    }
  }

  let unitsToMm: number | null = null;
  let unitsLabel = 'unitless';
  if (insUnits !== null && INSUNITS_TO_MM[insUnits]) {
    unitsToMm = INSUNITS_TO_MM[insUnits].factor;
    unitsLabel = INSUNITS_TO_MM[insUnits].label;
  } else if (insUnits !== null && insUnits !== 0) {
    context.warnings.push(`Unsupported DXF unit code ${insUnits}; units must be confirmed manually.`);
  }

  let unitsHint: number | null = null;
  let unitsHintLabel: string | null = null;
  if (unitsToMm === null) {
    if (measurement === 0) {
      unitsHint = 25.4;
      unitsHintLabel = 'in';
    } else {
      unitsHint = 1;
      unitsHintLabel = 'mm';
    }
  }

  if (context.nonPlanar) {
    context.warnings.push(`${context.nonPlanar} entities are tilted out of the drawing plane; only their XY projection was used.`);
  }
  if (context.threeD) {
    context.warnings.push(`${context.threeD} entities carry Z coordinates; the drawing was flattened onto the XY plane.`);
  }

  return {
    format: 'dxf',
    unitsToMm,
    unitsLabel,
    unitsHint,
    unitsHintLabel,
    yUp: true,
    paths: context.paths,
    warnings: context.warnings,
    entityCounts: context.entityCounts,
    skippedCounts: context.skippedCounts,
  };

  function collectEntitiesUntil(all: Group[], start: number, terminator: string): { entities: Entity[]; next: number } {
    return collectEntities(all, start, terminator);
  }
}

export function dxfVersionLabel(bytes: Uint8Array): string {
  const text = isBinaryDxf(bytes) ? '' : decodeText(bytes.subarray(0, 4000));
  const match = text.match(/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/);
  return match ? match[1] : '';
}
