// Pure 2D geometry helpers used by the CAD importers and the outline analysis.
// Everything here is unit-agnostic: callers decide whether values are mm, inches or SVG user units.

export interface Point {
  x: number;
  y: number;
}

export interface LinePrimitive {
  kind: 'line';
  start: Point;
  end: Point;
}

// Circular arc. Angles are radians; a positive sweep travels counter-clockwise from the start angle.
export interface ArcPrimitive {
  kind: 'arc';
  center: Point;
  radius: number;
  startAngle: number;
  sweepAngle: number;
}

// Free-form curve (spline, ellipse, bezier) already flattened to a polyline.
export interface CurvePrimitive {
  kind: 'curve';
  points: Point[];
  label: 'spline' | 'ellipse' | 'bezier' | 'arc';
}

export type Primitive = LinePrimitive | ArcPrimitive | CurvePrimitive;

// Affine matrix using the SVG convention: x' = a*x + c*y + e, y' = b*x + d*y + f.
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface OrientedRectangle {
  width: number;
  height: number;
  angle: number; // radians, rotation of the "width" edge relative to the x axis, normalised to (-45deg, 45deg]
  area: number;
}

export const TWO_PI = Math.PI * 2;
export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function pt(x: number, y: number): Point {
  return { x, y };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function normalizeAngle(angle: number): number {
  let value = angle % TWO_PI;
  if (value < 0) {
    value += TWO_PI;
  }
  return value;
}

export function unit(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

// Returns m1 * m2 (apply m2 first, then m1) using the SVG convention.
export function multiplyMatrix(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function translationMatrix(tx: number, ty: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scaleMatrix(sx: number, sy: number): Matrix {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function rotationMatrix(rad: number): Matrix {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export interface SimilarityInfo {
  isSimilarity: boolean;
  scale: number;
  reflects: boolean;
}

// A similarity keeps circles circular: uniform scale + rotation (+ optional reflection) + translation.
export function describeSimilarity(m: Matrix): SimilarityInfo {
  const lenX = Math.hypot(m.a, m.b);
  const lenY = Math.hypot(m.c, m.d);
  const dot = m.a * m.c + m.b * m.d;
  const det = m.a * m.d - m.b * m.c;
  const tolerance = 1e-6 * Math.max(1, lenX, lenY);
  const isSimilarity = Math.abs(lenX - lenY) <= tolerance && Math.abs(dot) <= tolerance && lenX > 0;
  return { isSimilarity, scale: lenX, reflects: det < 0 };
}

export function arcPoint(arc: ArcPrimitive, angle: number): Point {
  return { x: arc.center.x + arc.radius * Math.cos(angle), y: arc.center.y + arc.radius * Math.sin(angle) };
}

export function arcEndAngle(arc: ArcPrimitive): number {
  return arc.startAngle + arc.sweepAngle;
}

export function isFullCircle(arc: ArcPrimitive): boolean {
  return Math.abs(Math.abs(arc.sweepAngle) - TWO_PI) < 1e-6;
}

export function primitiveStart(p: Primitive): Point {
  switch (p.kind) {
    case 'line':
      return p.start;
    case 'arc':
      return arcPoint(p, p.startAngle);
    case 'curve':
      return p.points[0];
  }
}

export function primitiveEnd(p: Primitive): Point {
  switch (p.kind) {
    case 'line':
      return p.end;
    case 'arc':
      return arcPoint(p, arcEndAngle(p));
    case 'curve':
      return p.points[p.points.length - 1];
  }
}

export function reversePrimitive(p: Primitive): Primitive {
  switch (p.kind) {
    case 'line':
      return { kind: 'line', start: p.end, end: p.start };
    case 'arc':
      return { kind: 'arc', center: p.center, radius: p.radius, startAngle: arcEndAngle(p), sweepAngle: -p.sweepAngle };
    case 'curve':
      return { kind: 'curve', points: [...p.points].reverse(), label: p.label };
  }
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

export function primitiveLength(p: Primitive): number {
  switch (p.kind) {
    case 'line':
      return distance(p.start, p.end);
    case 'arc':
      return Math.abs(p.sweepAngle) * p.radius;
    case 'curve':
      return polylineLength(p.points);
  }
}

// Unit tangent in the direction of travel at the start or end of a primitive.
export function primitiveTangent(p: Primitive, atEnd: boolean): Point {
  switch (p.kind) {
    case 'line':
      return unit({ x: p.end.x - p.start.x, y: p.end.y - p.start.y });
    case 'arc': {
      const angle = atEnd ? arcEndAngle(p) : p.startAngle;
      const ccw = { x: -Math.sin(angle), y: Math.cos(angle) };
      return p.sweepAngle >= 0 ? ccw : { x: -ccw.x, y: -ccw.y };
    }
    case 'curve': {
      const pts = p.points;
      if (pts.length < 2) {
        return { x: 0, y: 0 };
      }
      if (atEnd) {
        const a = pts[pts.length - 2];
        const b = pts[pts.length - 1];
        return unit({ x: b.x - a.x, y: b.y - a.y });
      }
      return unit({ x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y });
    }
  }
}

// Number of straight segments needed so the chord never deviates from the arc by more than `tolerance`.
export function arcSegmentCount(radius: number, sweep: number, tolerance: number): number {
  const absSweep = Math.abs(sweep);
  if (absSweep === 0) {
    return 1;
  }
  let step = Math.PI / 4;
  if (radius > tolerance && tolerance > 0) {
    step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / radius)));
  }
  const minStep = degToRad(0.5);
  const maxStep = degToRad(15);
  step = Math.max(minStep, Math.min(maxStep, step));
  return Math.max(1, Math.ceil(absSweep / step));
}

export function flattenArc(arc: ArcPrimitive, tolerance: number): Point[] {
  const count = arcSegmentCount(arc.radius, arc.sweepAngle, tolerance);
  const points: Point[] = [];
  for (let i = 0; i <= count; i += 1) {
    points.push(arcPoint(arc, arc.startAngle + (arc.sweepAngle * i) / count));
  }
  return points;
}

export function flattenPrimitive(p: Primitive, tolerance: number): Point[] {
  switch (p.kind) {
    case 'line':
      return [p.start, p.end];
    case 'arc':
      return flattenArc(p, tolerance);
    case 'curve':
      return p.points;
  }
}

// DXF/LWPOLYLINE bulge: bulge = tan(sweep / 4); positive bulge bends counter-clockwise from start to end.
export function arcFromBulge(start: Point, end: Point, bulge: number): Primitive {
  const chord = distance(start, end);
  if (Math.abs(bulge) < 1e-9 || chord < 1e-12) {
    return { kind: 'line', start, end };
  }
  const sweep = 4 * Math.atan(bulge);
  const radius = (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const normal = { x: -(end.y - start.y) / chord, y: (end.x - start.x) / chord };
  const offset = (chord * (1 - bulge * bulge)) / (4 * bulge);
  const center = { x: mid.x + normal.x * offset, y: mid.y + normal.y * offset };
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  return { kind: 'arc', center, radius, startAngle, sweepAngle: sweep };
}

export function transformPoints(points: Point[], m: Matrix): Point[] {
  return points.map((p) => applyMatrix(m, p));
}

export function transformPrimitive(p: Primitive, m: Matrix, flattenTolerance = 0.01): Primitive {
  switch (p.kind) {
    case 'line':
      return { kind: 'line', start: applyMatrix(m, p.start), end: applyMatrix(m, p.end) };
    case 'curve':
      return { kind: 'curve', points: transformPoints(p.points, m), label: p.label };
    case 'arc': {
      const info = describeSimilarity(m);
      if (!info.isSimilarity) {
        return { kind: 'curve', points: transformPoints(flattenArc(p, flattenTolerance), m), label: 'arc' };
      }
      const center = applyMatrix(m, p.center);
      const startDir = { x: Math.cos(p.startAngle), y: Math.sin(p.startAngle) };
      const imageDir = { x: m.a * startDir.x + m.c * startDir.y, y: m.b * startDir.x + m.d * startDir.y };
      const startAngle = Math.atan2(imageDir.y, imageDir.x);
      return {
        kind: 'arc',
        center,
        radius: p.radius * info.scale,
        startAngle,
        sweepAngle: info.reflects ? -p.sweepAngle : p.sweepAngle,
      };
    }
  }
}

export function signedPolygonArea(points: Point[]): number {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonArea(points: Point[]): number {
  return Math.abs(signedPolygonArea(points));
}

export function polygonCentroid(points: Point[]): Point {
  const area = signedPolygonArea(points);
  if (Math.abs(area) < 1e-12) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / Math.max(1, points.length), y: sum.y / Math.max(1, points.length) };
  }
  let cx = 0;
  let cy = 0;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function boundingBox(points: Point[]): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  if (!points.length) {
    minX = minY = maxX = maxY = 0;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function boxContains(outer: BoundingBox, inner: BoundingBox, tolerance = 0): boolean {
  return inner.minX >= outer.minX - tolerance && inner.minY >= outer.minY - tolerance && inner.maxX <= outer.maxX + tolerance && inner.maxY <= outer.maxY + tolerance;
}

// Even-odd ray casting.
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.y > p.y !== b.y > p.y;
    if (crosses) {
      const xAtY = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < xAtY) {
        inside = !inside;
      }
    }
  }
  return inside;
}

// Andrew's monotone chain. Returns the hull in counter-clockwise order without the repeated first point.
export function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) {
    return sorted;
  }
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  sorted.forEach((p) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  });
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Minimum-area enclosing rectangle via rotating calipers over the convex hull.
export function minimumAreaRectangle(points: Point[]): OrientedRectangle {
  const hull = convexHull(points);
  const box = boundingBox(points);
  let best: OrientedRectangle = { width: box.width, height: box.height, angle: 0, area: box.width * box.height };
  if (hull.length < 3) {
    return best;
  }
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const dir = unit({ x: b.x - a.x, y: b.y - a.y });
    if (dir.x === 0 && dir.y === 0) {
      continue;
    }
    const perp = { x: -dir.y, y: dir.x };
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    hull.forEach((p) => {
      const u = p.x * dir.x + p.y * dir.y;
      const v = p.x * perp.x + p.y * perp.y;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    });
    const width = maxU - minU;
    const height = maxV - minV;
    const area = width * height;
    if (area < best.area - 1e-9) {
      best = { width, height, angle: Math.atan2(dir.y, dir.x), area };
    }
  }
  return normalizeOrientedRectangle(best);
}

// A rectangle has two axes; report as "width" the side whose axis is closest to horizontal,
// with the angle of that axis normalised to (-45deg, 45deg].
export function normalizeOrientedRectangle(rect: OrientedRectangle): OrientedRectangle {
  const half = Math.PI;
  const quarter = Math.PI / 2;
  const eighth = Math.PI / 4;
  let angle = ((rect.angle % half) + half) % half; // [0, 180deg)
  let width = rect.width;
  let height = rect.height;
  if (angle > eighth && angle < half - eighth) {
    // The other axis is closer to horizontal.
    angle -= quarter;
    const swap = width;
    width = height;
    height = swap;
  } else if (angle >= half - eighth) {
    angle -= half;
  }
  return { width, height, angle, area: rect.area };
}

// Intersection of the infinite lines through p1 (direction d1) and p2 (direction d2).
export function intersectLines(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-12) {
    return null;
  }
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

// Evaluates a (possibly rational) B-spline at parameter t using de Boor's algorithm.
export function evaluateNurbs(degree: number, knots: number[], controlPoints: Point[], weights: number[] | null, t: number): Point {
  const n = controlPoints.length - 1;
  let span = degree;
  const maxSpan = n;
  if (t >= knots[n + 1]) {
    span = n;
  } else {
    while (span < maxSpan && knots[span + 1] <= t) {
      span += 1;
    }
  }
  const wx: number[] = [];
  const wy: number[] = [];
  const ww: number[] = [];
  for (let j = 0; j <= degree; j += 1) {
    const idx = span - degree + j;
    const w = weights ? weights[idx] : 1;
    wx.push(controlPoints[idx].x * w);
    wy.push(controlPoints[idx].y * w);
    ww.push(w);
  }
  for (let r = 1; r <= degree; r += 1) {
    for (let j = degree; j >= r; j -= 1) {
      const i = span - degree + j;
      const denom = knots[i + degree - r + 1] - knots[i];
      const alpha = denom === 0 ? 0 : (t - knots[i]) / denom;
      wx[j] = (1 - alpha) * wx[j - 1] + alpha * wx[j];
      wy[j] = (1 - alpha) * wy[j - 1] + alpha * wy[j];
      ww[j] = (1 - alpha) * ww[j - 1] + alpha * ww[j];
    }
  }
  const w = ww[degree] || 1;
  return { x: wx[degree] / w, y: wy[degree] / w };
}

export function sampleNurbs(degree: number, knots: number[], controlPoints: Point[], weights: number[] | null, samples: number): Point[] {
  const n = controlPoints.length - 1;
  if (n < degree || knots.length < n + degree + 2) {
    return controlPoints.slice();
  }
  const tStart = knots[degree];
  const tEnd = knots[n + 1];
  const points: Point[] = [];
  const count = Math.max(2, samples);
  for (let i = 0; i <= count; i += 1) {
    const t = tStart + ((tEnd - tStart) * i) / count;
    points.push(evaluateNurbs(degree, knots, controlPoints, weights, t));
  }
  return points;
}

export function sampleCubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, segments = 32): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const mt = 1 - t;
    points.push({
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return points;
}

export function sampleQuadraticBezier(p0: Point, p1: Point, p2: Point, segments = 24): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const mt = 1 - t;
    points.push({
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    });
  }
  return points;
}

// Smooth interpolation through fit points (uniform Catmull-Rom), used when a spline only stores fit points.
export function sampleCatmullRom(points: Point[], closed: boolean, samplesPerSpan = 16): Point[] {
  const n = points.length;
  if (n < 3) {
    return points.slice();
  }
  const at = (i: number): Point => {
    if (closed) {
      return points[((i % n) + n) % n];
    }
    return points[Math.max(0, Math.min(n - 1, i))];
  };
  const spans = closed ? n : n - 1;
  const result: Point[] = [];
  for (let span = 0; span < spans; span += 1) {
    const p0 = at(span - 1);
    const p1 = at(span);
    const p2 = at(span + 1);
    const p3 = at(span + 2);
    for (let step = 0; step < samplesPerSpan; step += 1) {
      const t = step / samplesPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      result.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  result.push(closed ? points[0] : points[n - 1]);
  return result;
}

// Samples an ellipse arc given its centre, major axis vector, minor/major ratio and a parameter range (radians).
export function sampleEllipse(center: Point, majorAxis: Point, ratio: number, startParam: number, endParam: number): Point[] {
  const minor = { x: -majorAxis.y * ratio, y: majorAxis.x * ratio };
  let sweep = endParam - startParam;
  if (sweep <= 1e-9) {
    sweep += TWO_PI;
  }
  const count = Math.max(16, Math.ceil(Math.abs(sweep) / degToRad(1.5)));
  const points: Point[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = startParam + (sweep * i) / count;
    points.push({
      x: center.x + Math.cos(t) * majorAxis.x + Math.sin(t) * minor.x,
      y: center.y + Math.cos(t) * majorAxis.y + Math.sin(t) * minor.y,
    });
  }
  return points;
}

// Removes consecutive duplicate points (and a trailing point equal to the first one).
export function dedupePolygon(points: Point[], tolerance: number): Point[] {
  const result: Point[] = [];
  points.forEach((p) => {
    if (!result.length || distance(result[result.length - 1], p) > tolerance) {
      result.push(p);
    }
  });
  while (result.length > 1 && distance(result[0], result[result.length - 1]) <= tolerance) {
    result.pop();
  }
  return result;
}

// Keeps at most `maxPoints` points, always preserving the first point. Used for previews.
export function decimatePolygon(points: Point[], maxPoints: number): Point[] {
  if (points.length <= maxPoints) {
    return points;
  }
  const step = points.length / maxPoints;
  const result: Point[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    result.push(points[Math.floor(i * step)]);
  }
  return result;
}
