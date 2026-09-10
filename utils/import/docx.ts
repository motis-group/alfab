import { inflateRawSync } from 'zlib';

// A .docx is a ZIP holding one XML document. Reading a single entry out of it is a few lines of
// zlib, which is why there is no ZIP dependency here. ZIP64 is not handled: a Word document that
// needed it would be over 4 GB.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const MAX_COMMENT_BYTES = 0xffff;

export class DocxReadError extends Error {
  hint: string;

  constructor(message: string, hint = '') {
    super(message);
    this.name = 'DocxReadError';
    this.hint = hint;
  }
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const earliest = Math.max(0, zip.length - MAX_COMMENT_BYTES - 22);
  for (let offset = zip.length - 22; offset >= earliest; offset -= 1) {
    if (zip.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new DocxReadError('The file is not a readable Word document.', 'Save as .docx and upload again.');
}

/** The bytes of one entry, by name. Null when the archive has no such entry. */
export function readZipEntry(zip: Buffer, entryName: string): Buffer | null {
  const eocd = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new DocxReadError('The Word document could not be read.', 'Re-save it from Word and upload it again.');
    }

    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');

    if (name === entryName) {
      // The central directory's name and extra lengths do not have to match the local header's,
      // so the data offset is read from the local header rather than assumed.
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = zip.subarray(start, start + compressedSize);
      if (method === 0) {
        return Buffer.from(data);
      }
      if (method === 8) {
        return inflateRawSync(data);
      }
      throw new DocxReadError(`The Word document uses an unsupported compression method (${method}).`, 'Re-save it from Word and upload it again.');
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXmlText(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return XML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * The document's text, one line per paragraph. Tabs, table cells and formatting are dropped:
 * a cut list is read for its numbers, not its layout.
 */
export function docxToText(file: Buffer): string {
  const xml = readZipEntry(file, 'word/document.xml');
  if (!xml) {
    throw new DocxReadError('The Word document has no readable text.', 'Check the file opens in Word.');
  }

  return decodeXmlText(
    xml
      .toString('utf8')
      .replace(/<w:(?:br|tab)\b[^>]*\/?>/g, ' ')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]*>/g, '')
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface CutListEntry {
  /** The first number as written. Which of the pair is width is the shop's convention, not ours. */
  widthMm: number;
  heightMm: number;
  quantity: number;
  /** The line it came from, kept so the reviewer can check it against the customer's document. */
  sourceLine: string;
}

export interface CutListReading {
  entries: CutListEntry[];
  /** Lines that look like a size but did not parse. Reported, never dropped silently. */
  unparsedLines: string[];
}

// "1120 x 530 – 1 off", "2275 x 1705 -1 off", "2635 X 2315 — 4 off".
const CUT_LINE = /(\d{2,5})\s*[x×]\s*(\d{2,5})\s*[-–—]\s*(\d+)\s*off/i;
const LOOKS_LIKE_A_SIZE = /\d{2,5}\s*[x×]\s*\d{2,5}/i;

/**
 * The sizes and quantities in a typed cut list. Deterministic on purpose: a list of numbers is
 * something code reads exactly, and a model asked to copy 43 of them can drop one without saying so.
 */
export function readCutList(text: string): CutListReading {
  const entries: CutListEntry[] = [];
  const unparsedLines: string[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = CUT_LINE.exec(trimmed);
    if (match) {
      entries.push({
        widthMm: Number(match[1]),
        heightMm: Number(match[2]),
        quantity: Math.max(1, Number(match[3])),
        sourceLine: trimmed,
      });
      continue;
    }

    if (LOOKS_LIKE_A_SIZE.test(trimmed)) {
      unparsedLines.push(trimmed);
    }
  }

  return { entries, unparsedLines };
}
