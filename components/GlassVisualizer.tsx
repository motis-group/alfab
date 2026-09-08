'use client';

import styles from '@components/GlassVisualizer.module.scss';

import * as React from 'react';
import * as Utilities from '@common/utilities';

import Text from '@components/Text';

import { CadOutlineGeometry, GlassSpecification, getEffectiveArea, getEffectivePerimeter, glassTypeToRGB, usesMeasuredGeometry } from '@utils/calculations';

// The drawing is laid out in a fixed viewBox so stroke widths and label sizes stay constant
// whatever the real size of the glass. Millimetres are mapped into this space. The box is kept
// tight because this renders in the calculator's narrow sidebar column, where a larger viewBox
// would shrink the dimension labels below a readable size.
const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 500;
const PAD_LEFT = 66;
const PAD_RIGHT = 24;
const PAD_TOP = 24;
const PAD_BOTTOM = 56;

const SHAPE_NAMES: Record<GlassSpecification['shape'], string> = {
  RECTANGLE: 'Rectangle',
  TRIANGLE: 'Triangle',
  SIMPLE: 'Simple shape',
  COMPLEX: 'Complex shape',
};

type Point = { x: number; y: number };

interface Drawing {
  // Outline path in millimetre space, origin at the top-left of the glass.
  path: string;
  widthMm: number;
  heightMm: number;
  holes: Array<{ x: number; y: number; d: number }>;
  cutouts: string[];
  // True when the outline is the real profile rather than a width x height stand-in.
  exact: boolean;
  holesAreIndicative: boolean;
  source: string;
  notes: string[];
}

function formatMm(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function polygonPath(points: Array<[number, number]>): string {
  return `${points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} Z`;
}

function roundedRectPath(width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  if (r === 0) {
    return `M0 0 L${width} 0 L${width} ${height} L0 ${height} Z`;
  }
  return [`M${r} 0`, `L${width - r} 0`, `A${r} ${r} 0 0 1 ${width} ${r}`, `L${width} ${height - r}`, `A${r} ${r} 0 0 1 ${width - r} ${height}`, `L${r} ${height}`, `A${r} ${r} 0 0 1 0 ${height - r}`, `L0 ${r}`, `A${r} ${r} 0 0 1 ${r} 0`, 'Z'].join(' ');
}

// Evenly spaced points around an inset rectangle, used to suggest where holes sit when the
// specification only carries a count.
function indicativeHolePositions(width: number, height: number, count: number): Point[] {
  const inset = Math.max(Math.min(width, height) * 0.08, Math.min(width, height) * 0.05);
  const left = inset;
  const top = inset;
  const right = Math.max(left, width - inset);
  const bottom = Math.max(top, height - inset);
  const w = right - left;
  const h = bottom - top;
  const perimeter = 2 * (w + h);

  if (perimeter <= 0) {
    return [];
  }

  const positions: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    let distance = (perimeter * i) / count;
    if (distance < w) {
      positions.push({ x: left + distance, y: top });
      continue;
    }
    distance -= w;
    if (distance < h) {
      positions.push({ x: right, y: top + distance });
      continue;
    }
    distance -= h;
    if (distance < w) {
      positions.push({ x: right - distance, y: bottom });
      continue;
    }
    distance -= w;
    positions.push({ x: left, y: bottom - distance });
  }
  return positions;
}

function geometryIsUsable(geometry: CadOutlineGeometry | null | undefined): geometry is CadOutlineGeometry {
  return !!geometry && Array.isArray(geometry.points) && geometry.points.length >= 3 && geometry.boundingWidthMm > 0 && geometry.boundingHeightMm > 0;
}

function buildDrawing(spec: GlassSpecification): Drawing | null {
  const outline = spec.cadOutline || null;
  const geometry = outline?.geometry;

  if (geometryIsUsable(geometry)) {
    return {
      path: polygonPath(geometry.points),
      widthMm: geometry.boundingWidthMm,
      heightMm: geometry.boundingHeightMm,
      holes: geometry.holes || [],
      cutouts: (geometry.cutouts || []).filter((polygon) => polygon.length >= 3).map(polygonPath),
      exact: true,
      holesAreIndicative: false,
      source: `Measured from ${outline!.fileName}`,
      notes: [],
    };
  }

  const width = Number.isFinite(spec.width) ? spec.width : 0;
  const height = Number.isFinite(spec.height) ? spec.height : 0;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const notes: string[] = [];
  const knownRadius = outline?.cornerRadiiMm?.length ? outline.cornerRadiiMm[0] : null;
  let path: string;
  let exact: boolean;

  if (spec.shape === 'TRIANGLE') {
    // The costing formulas treat a triangle as right-angled with the entered width and height as its legs.
    path = `M0 ${height} L${width} ${height} L0 0 Z`;
    exact = true;
  } else if (spec.shape === 'RECTANGLE') {
    const radius = spec.radiusCorners ? knownRadius ?? Math.min(width, height) * 0.08 : 0;
    path = roundedRectPath(width, height, radius);
    exact = true;
    if (spec.radiusCorners && knownRadius === null) {
      notes.push('Corner radius is not recorded, so the corners are drawn at a nominal size.');
    }
  } else {
    path = roundedRectPath(width, height, 0);
    exact = false;
    notes.push(`A ${spec.shape === 'SIMPLE' ? 'simple' : 'complex'} profile is not described by width and height alone. Upload the CAD file to draw the real outline.`);
  }

  const holes = spec.holes && spec.numHoles > 0 ? indicativeHolePositions(width, height, spec.numHoles).map((point) => ({ x: point.x, y: point.y, d: Math.max(Math.min(width, height) * 0.03, 6) })) : [];
  if (holes.length) {
    notes.push('Hole positions and sizes are indicative; only the count affects the price.');
  }

  return {
    path,
    widthMm: width,
    heightMm: height,
    holes,
    cutouts: [],
    exact,
    holesAreIndicative: true,
    source: 'Drawn from the entered width and height',
    notes,
  };
}

interface GlassVisualizerProps {
  spec: GlassSpecification;
}

export default function GlassVisualizer({ spec }: GlassVisualizerProps) {
  const drawing = React.useMemo(() => buildDrawing(spec), [spec]);
  const clipId = React.useId();

  if (!drawing) {
    return (
      <div className={styles.root}>
        <Text>
          <span className="status-warning">Enter a width and height, or upload a CAD file, to see the glass.</span>
        </Text>
      </div>
    );
  }

  const availableWidth = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT;
  const availableHeight = VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const scale = Math.min(availableWidth / drawing.widthMm, availableHeight / drawing.heightMm);
  const drawnWidth = drawing.widthMm * scale;
  const drawnHeight = drawing.heightMm * scale;
  const originX = PAD_LEFT + (availableWidth - drawnWidth) / 2;
  const originY = PAD_TOP + (availableHeight - drawnHeight) / 2;

  // Ceramic banding is drawn as an inner band by stroking the outline and clipping it to the glass.
  const bandMm = Math.max(Math.min(drawing.widthMm, drawing.heightMm) * 0.045, 10);

  const widthLabel = `${formatMm(spec.cadOutline && drawing.exact ? spec.cadOutline.widthMm : drawing.widthMm)} mm`;
  const heightLabel = `${formatMm(spec.cadOutline && drawing.exact ? spec.cadOutline.heightMm : drawing.heightMm)} mm`;
  const dimensionY = originY + drawnHeight + 28;
  const dimensionX = originX - 28;
  const measured = usesMeasuredGeometry(spec);

  // The CAD label ("Rectangle with R50 corners") already says what the shape is, so prefer it over
  // repeating the generic shape name next to it.
  const shapeSummary = spec.cadOutline?.shapeLabel || SHAPE_NAMES[spec.shape];
  const featureSummary = [drawing.holes.length ? `${drawing.holes.length} hole${drawing.holes.length === 1 ? '' : 's'}` : 'No holes', spec.ceramicBand ? 'ceramic band' : null, spec.radiusCorners && !spec.cadOutline ? 'radius corners' : null].filter(Boolean).join(' · ');

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        <svg className={styles.canvas} viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${widthLabel} by ${heightLabel} ${spec.thickness}mm ${spec.glassType} glass, ${spec.shape.toLowerCase()} shape`}>
          <defs>
            <clipPath id={clipId}>
              <path d={drawing.path} transform={`translate(${originX} ${originY}) scale(${scale})`} />
            </clipPath>
          </defs>

          <g transform={`translate(${originX} ${originY}) scale(${scale})`}>
            <path className={Utilities.classNames(styles.glass, drawing.exact ? null : styles.glassUnknown)} d={drawing.path} fill={glassTypeToRGB[spec.glassType]} style={{ strokeWidth: 2.5 / scale, strokeDasharray: drawing.exact ? undefined : `${10 / scale} ${7 / scale}` }} />
          </g>

          {spec.ceramicBand ? (
            <g clipPath={`url(#${clipId})`}>
              <path className={styles.ceramic} d={drawing.path} transform={`translate(${originX} ${originY}) scale(${scale})`} style={{ strokeWidth: bandMm * 2 }} />
            </g>
          ) : null}

          <g transform={`translate(${originX} ${originY})`}>
            {drawing.cutouts.map((cutout, index) => (
              <path key={`cutout-${index}`} className={styles.cutout} d={cutout} transform={`scale(${scale})`} style={{ strokeWidth: 2 / scale, strokeDasharray: `${7 / scale} ${5 / scale}` }} />
            ))}
            {drawing.holes.map((hole, index) => (
              <circle key={`hole-${index}`} className={Utilities.classNames(styles.hole, drawing.holesAreIndicative ? styles.holeIndicative : null)} cx={hole.x * scale} cy={hole.y * scale} r={Math.max((hole.d / 2) * scale, drawing.holesAreIndicative ? 8 : 4)} />
            ))}
          </g>

          <g className={styles.dimension}>
            <line x1={originX} y1={dimensionY} x2={originX + drawnWidth} y2={dimensionY} />
            <line x1={originX} y1={dimensionY - 7} x2={originX} y2={dimensionY + 7} />
            <line x1={originX + drawnWidth} y1={dimensionY - 7} x2={originX + drawnWidth} y2={dimensionY + 7} />
            <line x1={dimensionX} y1={originY} x2={dimensionX} y2={originY + drawnHeight} />
            <line x1={dimensionX - 7} y1={originY} x2={dimensionX + 7} y2={originY} />
            <line x1={dimensionX - 7} y1={originY + drawnHeight} x2={dimensionX + 7} y2={originY + drawnHeight} />
          </g>

          <text className={styles.dimensionLabel} x={originX + drawnWidth / 2} y={dimensionY + 26} textAnchor="middle">
            {widthLabel}
          </text>
          <text className={styles.dimensionLabel} x={dimensionX - 10} y={originY + drawnHeight / 2} textAnchor="middle" transform={`rotate(-90 ${dimensionX - 10} ${originY + drawnHeight / 2})`}>
            {heightLabel}
          </text>
        </svg>
      </div>

      <div className={styles.facts}>
        <Text>
          {spec.thickness}mm {spec.glassType} · {shapeSummary}
        </Text>
        <Text>
          {getEffectiveArea(spec).toFixed(3)} m² · {getEffectivePerimeter(spec).toFixed(2)} m edge{measured ? ' (measured)' : ''}
        </Text>
        <Text>{featureSummary}</Text>
        <Text>
          <span className={styles.note}>{drawing.source}</span>
        </Text>
      </div>

      {drawing.notes.map((note) => (
        <Text key={note}>
          <span className="status-warning">{note}</span>
        </Text>
      ))}
    </div>
  );
}
