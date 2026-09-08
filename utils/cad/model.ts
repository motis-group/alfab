// Shared document model produced by the format parsers and consumed by the outline analysis.

import { BoundingBox, Point, Primitive, boundingBox, dedupePolygon, distance, flattenPrimitive, primitiveEnd, primitiveLength, primitiveStart, primitiveTangent, reversePrimitive, signedPolygonArea } from './geometry';

export type CadSpace = 'model' | 'paper';

// A contiguous chain of primitives as drawn in the file (one entity, or one SVG sub-path).
export interface CadPath {
  primitives: Primitive[];
  closed: boolean;
  layer: string;
  source: string;
  space: CadSpace;
}

export type CadSourceFormat = 'dxf' | 'svg';

export interface CadDocument {
  format: CadSourceFormat;
  // Multiply file coordinates by this to get millimetres. Null when the file does not say.
  unitsToMm: number | null;
  unitsLabel: string;
  // Best guess to use when unitsToMm is null (for example DXF $MEASUREMENT hints at imperial).
  unitsHint: number | null;
  unitsHintLabel: string | null;
  // DXF drawings are y-up, SVG is y-down. Only affects how previews are drawn.
  yUp: boolean;
  paths: CadPath[];
  warnings: string[];
  entityCounts: Record<string, number>;
  skippedCounts: Record<string, number>;
}

export interface CadLoop {
  primitives: Primitive[];
  polygon: Point[];
  area: number;
  signedArea: number;
  perimeter: number;
  bbox: BoundingBox;
  layer: string;
  sources: string[];
  space: CadSpace;
}

export interface LoopBuildResult {
  loops: CadLoop[];
  openChains: number;
}

interface Strand {
  primitives: Primitive[];
  start: Point;
  end: Point;
  layer: string;
  source: string;
  space: CadSpace;
  used: boolean;
}

interface EndpointRef {
  strand: number;
  atStart: boolean;
}

export function countBy(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] || 0) + amount;
}

function splitDisconnected(primitives: Primitive[], tolerance: number): Primitive[][] {
  const chains: Primitive[][] = [];
  let current: Primitive[] = [];
  primitives.forEach((primitive) => {
    if (primitiveLength(primitive) <= tolerance * 0.01) {
      return;
    }
    if (current.length && distance(primitiveEnd(current[current.length - 1]), primitiveStart(primitive)) > tolerance) {
      chains.push(current);
      current = [];
    }
    current.push(primitive);
  });
  if (current.length) {
    chains.push(current);
  }
  return chains;
}

function reverseStrand(primitives: Primitive[]): Primitive[] {
  return primitives
    .slice()
    .reverse()
    .map((primitive) => reversePrimitive(primitive));
}

function cellKey(p: Point, cell: number): string {
  return `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
}

function buildEndpointIndex(strands: Strand[], cell: number): Map<string, EndpointRef[]> {
  const index = new Map<string, EndpointRef[]>();
  const add = (p: Point, ref: EndpointRef) => {
    const key = cellKey(p, cell);
    const bucket = index.get(key);
    if (bucket) {
      bucket.push(ref);
    } else {
      index.set(key, [ref]);
    }
  };
  strands.forEach((strand, i) => {
    add(strand.start, { strand: i, atStart: true });
    add(strand.end, { strand: i, atStart: false });
  });
  return index;
}

function queryEndpoints(index: Map<string, EndpointRef[]>, p: Point, cell: number): EndpointRef[] {
  const cx = Math.floor(p.x / cell);
  const cy = Math.floor(p.y / cell);
  const refs: EndpointRef[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const bucket = index.get(`${cx + dx}:${cy + dy}`);
      if (bucket) {
        bucket.forEach((ref) => refs.push(ref));
      }
    }
  }
  return refs;
}

// Closes a chain back to `target`: curves are extended so the closing piece stays curved.
function closeChain(primitives: Primitive[], target: Point, tolerance: number): Primitive[] {
  const last = primitives[primitives.length - 1];
  const end = primitiveEnd(last);
  if (distance(end, target) <= tolerance * 0.01) {
    return primitives;
  }
  if (last.kind === 'curve') {
    const extended: Primitive = { kind: 'curve', points: last.points.concat([target]), label: last.label };
    return primitives.slice(0, -1).concat([extended]);
  }
  return primitives.concat([{ kind: 'line', start: end, end: target }]);
}

export function loopFromPrimitives(primitives: Primitive[], layer: string, sources: string[], space: CadSpace, flattenTolerance: number): CadLoop | null {
  const points: Point[] = [];
  primitives.forEach((primitive, i) => {
    const flat = flattenPrimitive(primitive, flattenTolerance);
    flat.forEach((p, j) => {
      if (i > 0 && j === 0) {
        return;
      }
      points.push(p);
    });
  });
  const polygon = dedupePolygon(points, flattenTolerance * 0.5);
  if (polygon.length < 3) {
    return null;
  }
  const signedArea = signedPolygonArea(polygon);
  const area = Math.abs(signedArea);
  const perimeter = primitives.reduce((sum, primitive) => sum + primitiveLength(primitive), 0);
  return { primitives, polygon, area, signedArea, perimeter, bbox: boundingBox(polygon), layer, sources, space };
}

// Joins open paths whose endpoints meet (within `joinTolerance`) into closed loops.
export function buildLoops(paths: CadPath[], joinTolerance: number, flattenTolerance: number): LoopBuildResult {
  const loops: CadLoop[] = [];
  const strands: Strand[] = [];
  let openChains = 0;
  const minimumArea = joinTolerance * joinTolerance * 4;

  paths.forEach((path) => {
    const chains = splitDisconnected(path.primitives, joinTolerance);
    chains.forEach((chain, chainIndex) => {
      const start = primitiveStart(chain[0]);
      const end = primitiveEnd(chain[chain.length - 1]);
      const totalLength = chain.reduce((sum, primitive) => sum + primitiveLength(primitive), 0);
      const explicitlyClosed = path.closed && chains.length === 1;
      const meetsItself = distance(start, end) <= joinTolerance && totalLength > joinTolerance * 4;

      if (explicitlyClosed || meetsItself) {
        const primitives = closeChain(chain.slice(), start, joinTolerance);
        const loop = loopFromPrimitives(primitives, path.layer, [path.source], path.space, flattenTolerance);
        if (loop && loop.area >= minimumArea) {
          loops.push(loop);
        }
        return;
      }

      strands.push({ primitives: chain, start, end, layer: path.layer, source: path.source, space: path.space, used: false });
    });
  });

  const cell = Math.max(joinTolerance, 1e-9);
  const index = buildEndpointIndex(strands, cell);

  strands.forEach((seed, seedIndex) => {
    if (seed.used) {
      return;
    }
    seed.used = true;
    let chain = seed.primitives.slice();
    const sources = [seed.source];
    const head = seed.start;
    let tail = seed.end;
    let closed = false;
    let guard = 0;

    while (guard < strands.length + 1) {
      guard += 1;
      const chainLength = chain.reduce((sum, primitive) => sum + primitiveLength(primitive), 0);
      if (distance(tail, head) <= joinTolerance && chainLength > joinTolerance * 4) {
        closed = true;
        break;
      }

      const candidates = queryEndpoints(index, tail, cell).filter((ref) => {
        const strand = strands[ref.strand];
        if (strand.used || ref.strand === seedIndex) {
          return false;
        }
        const endpoint = ref.atStart ? strand.start : strand.end;
        return distance(endpoint, tail) <= joinTolerance;
      });

      if (!candidates.length) {
        break;
      }

      const outgoing = primitiveTangent(chain[chain.length - 1], true);
      let best: EndpointRef = candidates[0];
      let bestScore = -Infinity;
      candidates.forEach((ref) => {
        const strand = strands[ref.strand];
        let incoming: Point;
        if (ref.atStart) {
          incoming = primitiveTangent(strand.primitives[0], false);
        } else {
          const t = primitiveTangent(strand.primitives[strand.primitives.length - 1], true);
          incoming = { x: -t.x, y: -t.y };
        }
        const score = outgoing.x * incoming.x + outgoing.y * incoming.y;
        if (score > bestScore) {
          bestScore = score;
          best = ref;
        }
      });

      const next = strands[best.strand];
      next.used = true;
      sources.push(next.source);
      const primitives = best.atStart ? next.primitives : reverseStrand(next.primitives);
      chain = chain.concat(primitives);
      tail = primitiveEnd(chain[chain.length - 1]);
    }

    if (!closed) {
      openChains += 1;
      return;
    }

    const primitives = closeChain(chain.slice(), head, joinTolerance);
    const loop = loopFromPrimitives(primitives, seed.layer, sources, seed.space, flattenTolerance);
    if (loop && loop.area >= minimumArea) {
      loops.push(loop);
    }
  });

  return { loops, openChains };
}
