import Anthropic from '@anthropic-ai/sdk';

import { EdgeworkType, GlassSpecification, GlassThickness, GlassType, getAvailableGlassTypes } from '@utils/calculations';
import { CutListEntry, docxToText, readCutList } from '@utils/import/docx';
import { ExtractedPiece, ImportReading } from '@utils/import/model';
import { applySketchToSpec } from '@utils/import/outline';

// Reading a customer's order is split the way the rest of this system splits work: code reads what
// is unambiguous, the model reads what needs judgement, and code prices the result. A typed cut list
// is parsed with a regular expression, because a model asked to copy 43 sizes can drop one and say
// nothing. The model is asked only what the words mean — which glass, how thick, what edge — and,
// for a handwritten sketch, what the drawing shows.

const MODEL = 'claude-opus-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const THICKNESSES: GlassThickness[] = [4, 5, 6, 8, 10, 12];
const GLASS_TYPES: GlassType[] = ['Clear', 'Green', 'Grey', 'Dark Grey', 'Super Grey'];
const EDGEWORK: EdgeworkType[] = ['ROUGH ARRIS', 'FLAT GRIND - STRAIGHT', 'FLAT GRIND - CURVED', 'FLAT POLISH - STRAIGHT', 'FLAT POLISH - CURVED'];

export class ImportExtractionError extends Error {
  hint: string;
  status: number;

  constructor(message: string, hint = '', status = 502) {
    super(message);
    this.name = 'ImportExtractionError';
    this.hint = hint;
    this.status = status;
  }
}

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ImportExtractionError('Reading customer orders is not switched on for this server.', 'Set ANTHROPIC_API_KEY on the server and restart it.', 503);
  }
  return new Anthropic();
}

const SPEC_PROPERTIES = {
  specSummary: { type: 'string', description: 'What the document says the glass is, in its own words. One line.' },
  thickness: { type: 'integer', enum: THICKNESSES },
  glassType: { type: 'string', enum: GLASS_TYPES },
  edgework: { type: 'string', enum: EDGEWORK },
  ceramicBand: { type: 'boolean' },
  notes: { type: 'array', items: { type: 'string' }, description: 'Anything the estimator has to decide, such as a treatment this calculator does not price.' },
} as const;

const SPEC_REQUIRED = ['specSummary', 'thickness', 'glassType', 'edgework', 'ceramicBand', 'notes'];

const SPEC_GUIDANCE = `The calculator prices a cut piece of glass. It knows a thickness, a glass type, an edge finish and
ceramic banding, and nothing else. Toughening, laminating, stamps and delivery are not fields it has:
put anything like that in notes so the estimator prices it by hand.

Map the customer's words onto the options given. "Supergrey" and "super grey" are Super Grey.
"Polished edges" is FLAT POLISH - STRAIGHT. "Ground edges" is FLAT GRIND - STRAIGHT. Choose a CURVED
variant only for a piece with a curved edge. When the document does not say, choose ROUGH ARRIS and
say so in notes. Never invent a treatment the document does not mention.`;

interface SpecReading {
  specSummary: string;
  thickness: GlassThickness;
  glassType: GlassType;
  edgework: EdgeworkType;
  ceramicBand: boolean;
  notes: string[];
}

async function ask(content: Anthropic.Beta.BetaContentBlockParam[], schema: Record<string, unknown>, effort: 'low' | 'high'): Promise<any> {
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort, format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ImportExtractionError('The server was not able to sign in to read the document.', 'Check ANTHROPIC_API_KEY on the server.', 503);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ImportExtractionError('Too many documents are being read at once.', 'Wait a moment and upload the file again.', 429);
    }
    if (error instanceof Anthropic.APIError) {
      throw new ImportExtractionError(`The document could not be read: ${error.message}`, 'Try again; if it keeps failing, enter the pieces by hand.');
    }
    throw error;
  }

  if (response.stop_reason === 'refusal') {
    throw new ImportExtractionError('The document was declined and could not be read.', 'Enter the pieces by hand.');
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  try {
    return JSON.parse(text);
  } catch {
    throw new ImportExtractionError('The document was read but the answer could not be understood.', 'Try again, or enter the pieces by hand.');
  }
}

/** Keeps the model inside combinations the calculator can price, rather than letting one throw later. */
function settleSpec(reading: SpecReading, warnings: string[]): SpecReading {
  const thickness = THICKNESSES.includes(reading.thickness) ? reading.thickness : 6;
  if (thickness !== reading.thickness) {
    warnings.push(`${reading.thickness} mm is not a thickness this calculator holds; 6 mm was used instead. Check it.`);
  }

  const available = getAvailableGlassTypes(thickness);
  const glassType = available.includes(reading.glassType) ? reading.glassType : available[0];
  if (glassType !== reading.glassType) {
    warnings.push(`${reading.glassType} is not stocked in ${thickness} mm; ${glassType} was used instead. Check it.`);
  }

  const edgework = EDGEWORK.includes(reading.edgework) ? reading.edgework : 'ROUGH ARRIS';
  return { ...reading, thickness, glassType, edgework };
}

function baseSpec(reading: SpecReading): GlassSpecification {
  return {
    width: 0,
    height: 0,
    thickness: reading.thickness,
    glassType: reading.glassType,
    edgework: reading.edgework,
    ceramicBand: reading.ceramicBand,
    shape: 'RECTANGLE',
    holes: false,
    numHoles: 0,
    radiusCorners: false,
    scanning: false,
  };
}

export async function readDocxOrder(file: Buffer, fileName: string): Promise<ImportReading> {
  const text = docxToText(file);
  const cutList = readCutList(text);
  const warnings: string[] = [];

  if (!cutList.entries.length) {
    throw new ImportExtractionError('No sizes were found in that document.', 'A cut list reads like "1200 x 600 - 2 off", one size per line.', 422);
  }

  const reading = (await ask(
    [
      {
        type: 'text',
        text: `${SPEC_GUIDANCE}

Below is the text of a customer's glass order. ${cutList.entries.length} sizes have already been read
from it by hand, so ignore the sizes: say only what glass the order is for.

---
${text}
---`,
      },
    ],
    { type: 'object', properties: SPEC_PROPERTIES, required: SPEC_REQUIRED, additionalProperties: false },
    'low'
  )) as SpecReading;

  const settled = settleSpec(reading, warnings);
  warnings.push(...(settled.notes || []));
  for (const line of cutList.unparsedLines) {
    warnings.push(`This line looks like a size but was not read, so it is not on the quote: "${line}"`);
  }

  const pieces: ExtractedPiece[] = cutList.entries.map((entry: CutListEntry) => ({
    name: `${entry.widthMm} x ${entry.heightMm}`,
    quantity: entry.quantity,
    spec: { ...baseSpec(settled), width: entry.widthMm, height: entry.heightMm },
    confidence: 'read',
    source: entry.sourceLine,
    notes: [],
  }));

  return { kind: 'docx', fileName, pieces, specSummary: settled.specSummary, warnings };
}

const SKETCH_SCHEMA = {
  type: 'object',
  properties: {
    ...SPEC_PROPERTIES,
    warnings: { type: 'array', items: { type: 'string' }, description: 'Anything you could not read with confidence.' },
    pieces: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'A short label, such as the page or a mark on the drawing.' },
          quantity: { type: 'integer', minimum: 1, description: 'How many off. Default 1 when the drawing does not say.' },
          widthMm: { type: 'number' },
          heightMm: { type: 'number' },
          rectangular: { type: 'boolean', description: 'True when the piece is a plain rectangle.' },
          outline: {
            type: ['object', 'null'],
            description: 'Required for any piece that is not a plain rectangle. Null for a rectangle.',
            properties: {
              points: {
                type: 'array',
                minItems: 3,
                items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
                description: 'Corners in order around the outline, in millimetres, origin top-left, y downward. Do not repeat the first point.',
              },
              holes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { x: { type: 'number' }, y: { type: 'number' }, d: { type: 'number' } },
                  required: ['x', 'y', 'd'],
                  additionalProperties: false,
                },
              },
            },
            required: ['points', 'holes'],
            additionalProperties: false,
          },
          holeCount: { type: 'integer', minimum: 0 },
          notes: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'quantity', 'widthMm', 'heightMm', 'rectangular', 'outline', 'holeCount', 'notes'],
        additionalProperties: false,
      },
    },
  },
  required: [...SPEC_REQUIRED, 'warnings', 'pieces'],
  additionalProperties: false,
} as const;

const SKETCH_GUIDANCE = `${SPEC_GUIDANCE}

The attached document is a customer's drawing of glass to be cut, usually by hand. Read every piece
on every page.

Dimensions are millimetres. A dimension written along an edge is that edge's length. "x2 off" or
"2 off" beside a piece is its quantity; assume 1 when nothing says otherwise.

For a plain rectangle set rectangular true, give widthMm and heightMm, and leave outline null.
For anything else — a notch, a cut corner, a rake, a curve — set rectangular false and give the
outline as points, because the piece is priced on the area inside those points and a bounding box
would overcharge the customer. Put the points in order around the shape and make every dimension on
the drawing agree with the points you give.

Give a hole as a centre and a diameter in the outline's holes, positioned from the outline's
top-left corner. A rectangular piece with a hole still needs an outline: give its four corners.

Say in warnings anything you could not read: a smudged figure, a dimension that does not add up, a
note you are unsure of. Never guess a number to fill a gap — an estimator checking your reading is
faster than one finding a wrong price after the glass is cut.`;

export async function readPdfOrder(file: Buffer, fileName: string): Promise<ImportReading> {
  const reading = await ask(
    [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.toString('base64') } },
      { type: 'text', text: SKETCH_GUIDANCE },
    ],
    SKETCH_SCHEMA as unknown as Record<string, unknown>,
    'high'
  );

  const warnings: string[] = [...(reading.warnings || [])];
  const settled = settleSpec(reading as SpecReading, warnings);
  warnings.push(...(settled.notes || []));

  const pieces: ExtractedPiece[] = (reading.pieces || []).map((piece: any) => {
    const notes: string[] = [...(piece.notes || [])];
    let spec: GlassSpecification = {
      ...baseSpec(settled),
      width: Math.round(piece.widthMm || 0),
      height: Math.round(piece.heightMm || 0),
      holes: (piece.holeCount || 0) > 0,
      numHoles: piece.holeCount || 0,
    };

    if (piece.outline?.points?.length >= 3) {
      try {
        // The measured outline wins over the counts read off the drawing, so a piece is priced on
        // its geometry. Where the two disagree the estimator is told, because one of them is wrong.
        spec = applySketchToSpec(spec, { points: piece.outline.points, holes: piece.outline.holes || [] }, fileName).spec;
        const claimed = piece.holeCount || 0;
        if (claimed !== spec.numHoles) {
          notes.push(`The drawing reads as ${claimed} hole${claimed === 1 ? '' : 's'} but ${spec.numHoles} ${spec.numHoles === 1 ? 'was' : 'were'} measured, and ${spec.numHoles} ${spec.numHoles === 1 ? 'is' : 'are'} charged. Check the drawing.`);
        }
      } catch (error: any) {
        notes.push(`The outline could not be measured (${error?.message || 'unknown reason'}), so this piece is priced on its width and height.`);
      }
    } else if (piece.rectangular === false) {
      notes.push('This piece is not a rectangle but no outline was read, so it is priced on its width and height. Check the area.');
    }

    return {
      name: piece.name || '',
      quantity: Math.max(1, piece.quantity || 1),
      spec,
      confidence: 'check',
      source: piece.name || fileName,
      notes,
    };
  });

  if (!pieces.length) {
    throw new ImportExtractionError('No glass was found in that drawing.', 'Check the pages show sizes, then upload it again.', 422);
  }

  return { kind: 'pdf', fileName, pieces, specSummary: settled.specSummary, warnings };
}
