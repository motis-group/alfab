// SVG reader. Converts rect/circle/ellipse/line/polyline/polygon/path elements into CadPaths.
// Uses a small built-in XML tokenizer so it runs identically in the browser and in Node tests.

import { IDENTITY, Matrix, Point, Primitive, TWO_PI, degToRad, multiplyMatrix, rotationMatrix, sampleCubicBezier, sampleEllipse, sampleQuadraticBezier, scaleMatrix, transformPrimitive, translationMatrix } from './geometry';
import { CadDocument, CadPath, countBy } from './model';

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

const SKIPPED_CONTAINERS = new Set(['defs', 'symbol', 'clippath', 'mask', 'marker', 'pattern', 'metadata', 'title', 'desc', 'style', 'text', 'tspan', 'image', 'lineargradient', 'radialgradient', 'filter', 'script', 'foreignobject']);

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    }
    switch (entity) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        return '';
    }
  });
}

function localName(name: string): string {
  const index = name.indexOf(':');
  return (index >= 0 ? name.slice(index + 1) : name).toLowerCase();
}

function parseAttributes(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s=\/>"']+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const rawName = match[1];
    const value = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : '';
    attrs[rawName.toLowerCase()] = decodeEntities(value);
  }
  return attrs;
}

export function parseXml(text: string): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let i = 0;
  const length = text.length;

  while (i < length) {
    const open = text.indexOf('<', i);
    if (open < 0) {
      break;
    }
    if (text.startsWith('<!--', open)) {
      const end = text.indexOf('-->', open + 4);
      i = end < 0 ? length : end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', open)) {
      const end = text.indexOf(']]>', open + 9);
      i = end < 0 ? length : end + 3;
      continue;
    }
    if (text.startsWith('<?', open)) {
      const end = text.indexOf('?>', open + 2);
      i = end < 0 ? length : end + 2;
      continue;
    }
    if (text.startsWith('<!', open)) {
      // DOCTYPE, possibly with an internal subset in [...].
      let j = open + 2;
      let depth = 0;
      while (j < length) {
        const ch = text[j];
        if (ch === '[') depth += 1;
        if (ch === ']') depth -= 1;
        if (ch === '>' && depth <= 0) break;
        j += 1;
      }
      i = j + 1;
      continue;
    }

    // Find the end of the tag, respecting quoted attribute values.
    let j = open + 1;
    let quote = '';
    while (j < length) {
      const ch = text[j];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j += 1;
    }
    const inner = text.slice(open + 1, j);
    i = j + 1;

    if (inner.startsWith('/')) {
      const closing = localName(inner.slice(1).trim());
      for (let k = stack.length - 1; k > 0; k -= 1) {
        if (stack[k].name === closing) {
          stack.length = k;
          break;
        }
      }
      continue;
    }

    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const nameMatch = body.match(/^\s*([^\s\/>]+)/);
    if (!nameMatch) {
      continue;
    }
    const node: XmlNode = { name: localName(nameMatch[1]), attrs: parseAttributes(body.slice(nameMatch[0].length)), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }
  }
  return root;
}

export function looksLikeSvg(text: string): boolean {
  return /<svg[\s>]/i.test(text.slice(0, 20000));
}

const LENGTH_UNITS_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: 25.4 / 96,
};

export interface SvgLength {
  value: number;
  unit: string;
}

export function parseSvgLength(text: string | undefined): SvgLength | null {
  if (!text) {
    return null;
  }
  const match = text.trim().match(/^([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)\s*([a-zA-Z%]*)$/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }
  return { value, unit: match[2].toLowerCase() };
}

function numberAttr(attrs: Record<string, string>, name: string, fallback = 0): number {
  const parsed = parseSvgLength(attrs[name]);
  return parsed ? parsed.value : fallback;
}

export function parseTransform(text: string | undefined): Matrix {
  if (!text) {
    return IDENTITY;
  }
  let matrix = IDENTITY;
  const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const args = match[2]
      .split(/[\s,]+/)
      .filter((part) => part.length)
      .map(Number);
    let next: Matrix = IDENTITY;
    switch (match[1]) {
      case 'matrix':
        if (args.length === 6) {
          next = { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };
        }
        break;
      case 'translate':
        next = translationMatrix(args[0] || 0, args[1] || 0);
        break;
      case 'scale':
        next = scaleMatrix(args[0] === undefined ? 1 : args[0], args[1] === undefined ? (args[0] === undefined ? 1 : args[0]) : args[1]);
        break;
      case 'rotate': {
        const rotation = rotationMatrix(degToRad(args[0] || 0));
        if (args.length >= 3) {
          next = multiplyMatrix(translationMatrix(args[1], args[2]), multiplyMatrix(rotation, translationMatrix(-args[1], -args[2])));
        } else {
          next = rotation;
        }
        break;
      }
      case 'skewX':
        next = { a: 1, b: 0, c: Math.tan(degToRad(args[0] || 0)), d: 1, e: 0, f: 0 };
        break;
      case 'skewY':
        next = { a: 1, b: Math.tan(degToRad(args[0] || 0)), c: 0, d: 1, e: 0, f: 0 };
        break;
      default:
        break;
    }
    matrix = multiplyMatrix(matrix, next);
  }
  return matrix;
}

// --- path data -------------------------------------------------------------

class PathScanner {
  private text: string;
  private index = 0;

  constructor(text: string) {
    this.text = text;
  }

  skipSeparators(): void {
    while (this.index < this.text.length) {
      const ch = this.text[this.index];
      if (ch === ',' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.index += 1;
      } else {
        break;
      }
    }
  }

  peekCommand(): string | null {
    this.skipSeparators();
    if (this.index >= this.text.length) {
      return null;
    }
    const ch = this.text[this.index];
    return /[MmZzLlHhVvCcSsQqTtAa]/.test(ch) ? ch : null;
  }

  readCommand(): string | null {
    const command = this.peekCommand();
    if (command) {
      this.index += 1;
    }
    return command;
  }

  hasNumber(): boolean {
    this.skipSeparators();
    if (this.index >= this.text.length) {
      return false;
    }
    return /[-+.\d]/.test(this.text[this.index]);
  }

  readNumber(): number | null {
    this.skipSeparators();
    const rest = this.text.slice(this.index);
    const match = rest.match(/^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/);
    if (!match) {
      return null;
    }
    this.index += match[0].length;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
  }

  readFlag(): number | null {
    this.skipSeparators();
    if (this.index >= this.text.length) {
      return null;
    }
    const ch = this.text[this.index];
    if (ch === '0' || ch === '1') {
      this.index += 1;
      return ch === '1' ? 1 : 0;
    }
    return null;
  }
}

// Converts an SVG endpoint arc to primitives (circular arcs stay arcs; ellipses are sampled).
function svgArcPrimitives(from: Point, rxIn: number, ryIn: number, rotationDeg: number, largeArc: number, sweepFlag: number, to: Point): Primitive[] {
  if (from.x === to.x && from.y === to.y) {
    return [];
  }
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    return [{ kind: 'line', start: from, end: to }];
  }
  const phi = degToRad(rotationDeg);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  let factor = (rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p) / (rx2 * y1p * y1p + ry2 * x1p * x1p);
  if (factor < 0) factor = 0;
  let coefficient = Math.sqrt(factor);
  if (largeArc === sweepFlag) {
    coefficient = -coefficient;
  }
  const cxp = (coefficient * rx * y1p) / ry;
  const cyp = (-coefficient * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2;

  const angleBetween = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let angle = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) {
      angle = -angle;
    }
    return angle;
  };
  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweepFlag && delta > 0) {
    delta -= TWO_PI;
  } else if (sweepFlag && delta < 0) {
    delta += TWO_PI;
  }

  if (Math.abs(rx - ry) <= 1e-9 * Math.max(rx, ry)) {
    return [{ kind: 'arc', center: { x: cx, y: cy }, radius: rx, startAngle: theta1 + phi, sweepAngle: delta }];
  }

  const major = { x: rx * cosPhi, y: rx * sinPhi };
  const points = sampleEllipse({ x: cx, y: cy }, major, ry / rx, theta1, theta1 + delta);
  if (delta < 0) {
    // sampleEllipse always walks in the positive direction; walk backwards instead.
    const backwards = sampleEllipse({ x: cx, y: cy }, major, ry / rx, theta1 + delta, theta1);
    return [{ kind: 'curve', points: backwards.reverse(), label: 'arc' }];
  }
  return [{ kind: 'curve', points, label: 'arc' }];
}

interface SubPath {
  primitives: Primitive[];
  closed: boolean;
}

export function parsePathData(d: string): SubPath[] {
  const scanner = new PathScanner(d);
  const subPaths: SubPath[] = [];
  let current: SubPath | null = null;
  let position: Point = { x: 0, y: 0 };
  let subPathStart: Point = { x: 0, y: 0 };
  let lastControl: Point | null = null;
  let lastCommand = '';
  let command: string | null = null;

  const startSubPath = (p: Point) => {
    current = { primitives: [], closed: false };
    subPaths.push(current);
    subPathStart = p;
    position = p;
  };
  const push = (primitive: Primitive) => {
    if (!current) {
      startSubPath(position);
    }
    (current as SubPath).primitives.push(primitive);
  };
  const lineTo = (p: Point) => {
    if (p.x !== position.x || p.y !== position.y) {
      push({ kind: 'line', start: position, end: p });
    }
    position = p;
  };

  while ((command = scanner.readCommand() || (scanner.hasNumber() ? command : null))) {
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === 'Z') {
      if (current) {
        if (position.x !== subPathStart.x || position.y !== subPathStart.y) {
          push({ kind: 'line', start: position, end: subPathStart });
        }
        (current as SubPath).closed = true;
      }
      position = subPathStart;
      current = null;
      lastControl = null;
      lastCommand = upper;
      // A Z followed directly by coordinates behaves like an implicit M in some exporters; treat as L.
      command = 'L';
      if (!scanner.hasNumber()) {
        continue;
      }
    }

    const readPoint = (): Point | null => {
      const x = scanner.readNumber();
      const y = scanner.readNumber();
      if (x === null || y === null) {
        return null;
      }
      return relative ? { x: position.x + x, y: position.y + y } : { x, y };
    };

    let first = true;
    let pairIndex = 0;
    while (scanner.hasNumber() || (first && upper === 'Z')) {
      first = false;
      switch (upper) {
        case 'M': {
          const p = readPoint();
          if (!p) break;
          if (pairIndex === 0) {
            // Each M/m command starts a new sub-path; extra coordinate pairs are implicit line-tos.
            startSubPath(p);
          } else {
            lineTo(p);
          }
          pairIndex += 1;
          lastControl = null;
          lastCommand = 'M';
          continue;
        }
        case 'L': {
          const p = readPoint();
          if (!p) break;
          lineTo(p);
          lastControl = null;
          break;
        }
        case 'H': {
          const x = scanner.readNumber();
          if (x === null) break;
          lineTo({ x: relative ? position.x + x : x, y: position.y });
          lastControl = null;
          break;
        }
        case 'V': {
          const y = scanner.readNumber();
          if (y === null) break;
          lineTo({ x: position.x, y: relative ? position.y + y : y });
          lastControl = null;
          break;
        }
        case 'C': {
          const c1 = readPoint();
          const c2 = readPoint();
          const p = readPoint();
          if (!c1 || !c2 || !p) break;
          push({ kind: 'curve', points: sampleCubicBezier(position, c1, c2, p), label: 'bezier' });
          lastControl = c2;
          position = p;
          break;
        }
        case 'S': {
          const c2 = readPoint();
          const p = readPoint();
          if (!c2 || !p) break;
          const c1 = lastControl && (lastCommand === 'C' || lastCommand === 'S') ? { x: 2 * position.x - lastControl.x, y: 2 * position.y - lastControl.y } : position;
          push({ kind: 'curve', points: sampleCubicBezier(position, c1, c2, p), label: 'bezier' });
          lastControl = c2;
          position = p;
          break;
        }
        case 'Q': {
          const c1 = readPoint();
          const p = readPoint();
          if (!c1 || !p) break;
          push({ kind: 'curve', points: sampleQuadraticBezier(position, c1, p), label: 'bezier' });
          lastControl = c1;
          position = p;
          break;
        }
        case 'T': {
          const p = readPoint();
          if (!p) break;
          const c1 = lastControl && (lastCommand === 'Q' || lastCommand === 'T') ? { x: 2 * position.x - lastControl.x, y: 2 * position.y - lastControl.y } : position;
          push({ kind: 'curve', points: sampleQuadraticBezier(position, c1, p), label: 'bezier' });
          lastControl = c1;
          position = p;
          break;
        }
        case 'A': {
          const rx = scanner.readNumber();
          const ry = scanner.readNumber();
          const rotation = scanner.readNumber();
          const largeArc = scanner.readFlag();
          const sweep = scanner.readFlag();
          const p = readPoint();
          if (rx === null || ry === null || rotation === null || largeArc === null || sweep === null || !p) break;
          svgArcPrimitives(position, rx, ry, rotation, largeArc, sweep, p).forEach((primitive) => push(primitive));
          lastControl = null;
          position = p;
          break;
        }
        default:
          break;
      }
      if (upper !== 'M') {
        lastCommand = upper;
      }
      if (upper === 'Z') {
        break;
      }
    }
  }

  return subPaths.filter((subPath) => subPath.primitives.length > 0);
}

// --- element conversion ----------------------------------------------------

function rectPrimitives(attrs: Record<string, string>): { primitives: Primitive[]; closed: boolean } | null {
  const x = numberAttr(attrs, 'x');
  const y = numberAttr(attrs, 'y');
  const width = numberAttr(attrs, 'width');
  const height = numberAttr(attrs, 'height');
  if (width <= 0 || height <= 0) {
    return null;
  }
  let rx = attrs.rx !== undefined ? numberAttr(attrs, 'rx') : attrs.ry !== undefined ? numberAttr(attrs, 'ry') : 0;
  let ry = attrs.ry !== undefined ? numberAttr(attrs, 'ry') : rx;
  rx = Math.max(0, Math.min(rx, width / 2));
  ry = Math.max(0, Math.min(ry, height / 2));

  if (rx === 0 || ry === 0) {
    const corners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
    return {
      primitives: corners.map((corner, i) => ({ kind: 'line', start: corner, end: corners[(i + 1) % 4] }) as Primitive),
      closed: true,
    };
  }

  const primitives: Primitive[] = [];
  const corner = (center: Point, startAngle: number): Primitive => {
    if (Math.abs(rx - ry) <= 1e-9) {
      return { kind: 'arc', center, radius: rx, startAngle, sweepAngle: Math.PI / 2 };
    }
    return { kind: 'curve', points: sampleEllipse(center, { x: rx, y: 0 }, ry / rx, startAngle, startAngle + Math.PI / 2), label: 'ellipse' };
  };
  primitives.push({ kind: 'line', start: { x: x + rx, y }, end: { x: x + width - rx, y } });
  primitives.push(corner({ x: x + width - rx, y: y + ry }, -Math.PI / 2));
  primitives.push({ kind: 'line', start: { x: x + width, y: y + ry }, end: { x: x + width, y: y + height - ry } });
  primitives.push(corner({ x: x + width - rx, y: y + height - ry }, 0));
  primitives.push({ kind: 'line', start: { x: x + width - rx, y: y + height }, end: { x: x + rx, y: y + height } });
  primitives.push(corner({ x: x + rx, y: y + height - ry }, Math.PI / 2));
  primitives.push({ kind: 'line', start: { x, y: y + height - ry }, end: { x, y: y + ry } });
  primitives.push(corner({ x: x + rx, y: y + ry }, Math.PI));
  return { primitives, closed: true };
}

function parsePointsAttr(text: string | undefined): Point[] {
  if (!text) {
    return [];
  }
  const numbers = text
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const points: Point[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return points;
}

function isHidden(attrs: Record<string, string>): boolean {
  if (attrs.display === 'none' || attrs.visibility === 'hidden') {
    return true;
  }
  const style = attrs.style || '';
  return /display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style);
}

interface SvgContext {
  paths: CadPath[];
  warnings: string[];
  entityCounts: Record<string, number>;
  skippedCounts: Record<string, number>;
}

function visit(node: XmlNode, ctm: Matrix, context: SvgContext, layer: string): void {
  node.children.forEach((child) => {
    if (SKIPPED_CONTAINERS.has(child.name)) {
      countBy(context.skippedCounts, child.name);
      return;
    }
    if (isHidden(child.attrs)) {
      countBy(context.skippedCounts, 'hidden');
      return;
    }
    const transform = multiplyMatrix(ctm, parseTransform(child.attrs.transform));
    const childLayer = child.attrs['inkscape:label'] || child.attrs.id || layer;

    let shape: { primitives: Primitive[]; closed: boolean }[] = [];
    switch (child.name) {
      case 'g':
      case 'a':
      case 'svg':
      case 'switch':
        visit(child, transform, context, childLayer);
        return;
      case 'rect': {
        const rect = rectPrimitives(child.attrs);
        if (rect) shape = [rect];
        break;
      }
      case 'circle': {
        const r = numberAttr(child.attrs, 'r');
        if (r > 0) {
          shape = [{ primitives: [{ kind: 'arc', center: { x: numberAttr(child.attrs, 'cx'), y: numberAttr(child.attrs, 'cy') }, radius: r, startAngle: 0, sweepAngle: TWO_PI }], closed: true }];
        }
        break;
      }
      case 'ellipse': {
        const rx = numberAttr(child.attrs, 'rx');
        const ry = numberAttr(child.attrs, 'ry');
        const center = { x: numberAttr(child.attrs, 'cx'), y: numberAttr(child.attrs, 'cy') };
        if (rx > 0 && ry > 0) {
          if (Math.abs(rx - ry) <= 1e-9) {
            shape = [{ primitives: [{ kind: 'arc', center, radius: rx, startAngle: 0, sweepAngle: TWO_PI }], closed: true }];
          } else {
            shape = [{ primitives: [{ kind: 'curve', points: sampleEllipse(center, { x: rx, y: 0 }, ry / rx, 0, TWO_PI), label: 'ellipse' }], closed: true }];
          }
        }
        break;
      }
      case 'line': {
        const start = { x: numberAttr(child.attrs, 'x1'), y: numberAttr(child.attrs, 'y1') };
        const end = { x: numberAttr(child.attrs, 'x2'), y: numberAttr(child.attrs, 'y2') };
        shape = [{ primitives: [{ kind: 'line', start, end }], closed: false }];
        break;
      }
      case 'polyline':
      case 'polygon': {
        const points = parsePointsAttr(child.attrs.points);
        if (points.length >= 2) {
          const primitives: Primitive[] = [];
          for (let i = 1; i < points.length; i += 1) {
            primitives.push({ kind: 'line', start: points[i - 1], end: points[i] });
          }
          shape = [{ primitives, closed: child.name === 'polygon' }];
        }
        break;
      }
      case 'path': {
        shape = parsePathData(child.attrs.d || '');
        break;
      }
      case 'use':
        countBy(context.skippedCounts, 'use');
        return;
      default:
        countBy(context.skippedCounts, child.name);
        return;
    }

    countBy(context.entityCounts, child.name);
    shape.forEach((subPath) => {
      context.paths.push({
        primitives: subPath.primitives.map((primitive) => transformPrimitive(primitive, transform, 0.01)),
        closed: subPath.closed,
        layer: childLayer,
        source: `svg:${child.name}`,
        space: 'model',
      });
    });
  });
}

export function parseSvg(text: string): CadDocument {
  const root = parseXml(text);
  const svg = root.children.find((child) => child.name === 'svg');
  if (!svg) {
    throw new Error('No <svg> element was found in the file.');
  }

  const context: SvgContext = { paths: [], warnings: [], entityCounts: {}, skippedCounts: {} };
  visit(svg, IDENTITY, context, 'svg');

  if (context.skippedCounts.use) {
    context.warnings.push(`${context.skippedCounts.use} <use> references were not expanded; if the outline is missing, export the SVG with shapes flattened.`);
  }

  const width = parseSvgLength(svg.attrs.width);
  const height = parseSvgLength(svg.attrs.height);
  const viewBoxNumbers = (svg.attrs.viewbox || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const viewBox = viewBoxNumbers.length === 4 && viewBoxNumbers[2] > 0 && viewBoxNumbers[3] > 0 ? viewBoxNumbers : null;

  let unitsToMm: number | null = null;
  let unitsLabel = 'user units';
  const physicalWidth = width && width.unit && width.unit !== 'px' && LENGTH_UNITS_TO_MM[width.unit] ? width.value * LENGTH_UNITS_TO_MM[width.unit] : null;
  const physicalHeight = height && height.unit && height.unit !== 'px' && LENGTH_UNITS_TO_MM[height.unit] ? height.value * LENGTH_UNITS_TO_MM[height.unit] : null;

  if (viewBox && physicalWidth !== null) {
    unitsToMm = physicalWidth / viewBox[2];
    unitsLabel = `${width!.unit} (via viewBox)`;
    if (physicalHeight !== null) {
      const vertical = physicalHeight / viewBox[3];
      if (Math.abs(vertical - unitsToMm) > unitsToMm * 0.01) {
        context.warnings.push('The SVG viewBox is scaled differently horizontally and vertically; horizontal scale was used.');
      }
    }
  } else if (viewBox && physicalHeight !== null) {
    unitsToMm = physicalHeight / viewBox[3];
    unitsLabel = `${height!.unit} (via viewBox)`;
  } else if (!viewBox && physicalWidth !== null && width) {
    // Without a viewBox user units are CSS px, unless the drawing extent matches the stated width.
    unitsToMm = LENGTH_UNITS_TO_MM.px;
    unitsLabel = 'px (96/in)';
    const extent = drawingExtent(context.paths);
    if (extent && Math.abs(extent.width - width.value) <= Math.max(1e-6, width.value * 0.02)) {
      unitsToMm = LENGTH_UNITS_TO_MM[width.unit];
      unitsLabel = `${width.unit} (matched width)`;
    }
  }

  return {
    format: 'svg',
    unitsToMm,
    unitsLabel: unitsToMm === null ? 'unspecified' : unitsLabel,
    unitsHint: unitsToMm === null ? 1 : null,
    unitsHintLabel: unitsToMm === null ? 'mm' : null,
    yUp: false,
    paths: context.paths,
    warnings: context.warnings,
    entityCounts: context.entityCounts,
    skippedCounts: context.skippedCounts,
  };
}

function drawingExtent(paths: CadPath[]): { width: number; height: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  paths.forEach((path) => {
    path.primitives.forEach((primitive) => {
      const points = primitive.kind === 'line' ? [primitive.start, primitive.end] : primitive.kind === 'curve' ? primitive.points : [{ x: primitive.center.x - primitive.radius, y: primitive.center.y - primitive.radius }, { x: primitive.center.x + primitive.radius, y: primitive.center.y + primitive.radius }];
      points.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    });
  });
  if (!Number.isFinite(minX)) {
    return null;
  }
  return { width: maxX - minX, height: maxY - minY };
}
