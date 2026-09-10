import { GlassSpecification } from '@utils/calculations';

export const IMPORT_ACCEPTED_EXTENSIONS = ['.docx', '.pdf'];
export const IMPORT_ACCEPT_ATTRIBUTE = IMPORT_ACCEPTED_EXTENSIONS.join(',');
export const MAX_IMPORT_FILE_BYTES = 30 * 1024 * 1024;

export type ImportSourceKind = 'docx' | 'pdf';

/**
 * How much of a piece was read rather than inferred. A typed cut list is `read`; a size taken off a
 * handwritten sketch is `check`, and the reviewer is told to hold the drawing next to the screen.
 */
export type PieceConfidence = 'read' | 'check';

export interface ExtractedPiece {
  /** What the piece is called on the quote. Empty when the document did not name it. */
  name: string;
  quantity: number;
  spec: GlassSpecification;
  confidence: PieceConfidence;
  /** Where in the document this came from, so a reviewer can find it. */
  source: string;
  /** Anything the reviewer has to decide. Shown next to the row. */
  notes: string[];
}

export interface ImportReading {
  kind: ImportSourceKind;
  fileName: string;
  pieces: ExtractedPiece[];
  /** What the header of the document said, in its own words, so the spec can be checked against it. */
  specSummary: string;
  /** Problems with the whole document: unread lines, an unpriceable glass, an assumed default. */
  warnings: string[];
}
