import { CadAnalysis, analyzeCadDocument, applyCadAnalysisToSpec, buildCadOutline, parseCadDocument } from '@utils/cad';
import { GlassSpecification } from '@utils/calculations';

export interface SketchHole {
  x: number;
  y: number;
  d: number;
}

export interface SketchOutline {
  /** Millimetres, origin anywhere, y increasing downward. Closed implicitly: do not repeat the first point. */
  points: Array<[number, number]>;
  holes?: SketchHole[];
}

function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * The outline as an SVG in millimetres, at 1:1.
 *
 * A sketch read off a drawing arrives as bare points, which is exactly what a DXF outline reduces
 * to. Rendering it as SVG and sending it back through the CAD pipeline means a shape read from a
 * customer's sketch is classified, measured and priced by the same code as the same shape imported
 * from a DXF, instead of by a second implementation that could disagree with it.
 */
export function sketchToSvg(outline: SketchOutline): string {
  if (outline.points.length < 3) {
    throw new Error('An outline needs at least three points.');
  }

  const xs = outline.points.map(([x]) => x);
  const ys = outline.points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;

  if (!(width > 0) || !(height > 0)) {
    throw new Error('The outline has no area.');
  }

  const path = outline.points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${formatNumber(x - minX)} ${formatNumber(y - minY)}`).join(' ');
  const circles = (outline.holes || [])
    .filter((hole) => hole.d > 0)
    .map((hole) => `<circle cx="${formatNumber(hole.x - minX)}" cy="${formatNumber(hole.y - minY)}" r="${formatNumber(hole.d / 2)}" fill="none" stroke="black"/>`)
    .join('');

  // No id or class on any element: the analyser reads those as layer names, and a name matching
  // its border pattern would make it discard the outline.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(width)}mm" height="${formatNumber(height)}mm" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}"><path d="${path} Z" fill="none" stroke="black"/>${circles}</svg>`;
}

export interface AppliedSketch {
  spec: GlassSpecification;
  analysis: CadAnalysis;
}

/**
 * Measures a sketched outline and writes it into a specification: size, shape, holes, radius
 * corners, edgework curvature, and the measured area and perimeter that price it. Glass type,
 * thickness, ceramic banding and scanning are left as the caller set them, exactly as a CAD import
 * leaves them.
 */
export function applySketchToSpec(spec: GlassSpecification, outline: SketchOutline, fileName: string): AppliedSketch {
  const svg = sketchToSvg(outline);
  const { document } = parseCadDocument('sketch.svg', new TextEncoder().encode(svg));
  const analysis = analyzeCadDocument(document);
  const cadOutline = buildCadOutline(analysis, { fileName, format: 'svg', priceOnMeasured: true });
  return { spec: applyCadAnalysisToSpec(spec, analysis, cadOutline).spec, analysis };
}
