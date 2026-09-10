import { NextResponse } from 'next/server';

import { getAppSession } from '@utils/auth-session';
import { DocxReadError } from '@utils/import/docx';
import { ImportExtractionError, readDocxOrder, readPdfOrder } from '@utils/import/extract-server';
import { MAX_IMPORT_FILE_BYTES } from '@utils/import/model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Reading a drawing takes longer than a normal request: the model looks at every page.
export const maxDuration = 300;

const DOCX_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46];

function startsWith(bytes: Buffer, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ available: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart upload with a "file" field.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return NextResponse.json({ error: 'That file is larger than 30 MB.', hint: 'Send the pages holding the glass sizes on their own.' }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || 'order';

  try {
    if (startsWith(bytes, PDF_SIGNATURE)) {
      return NextResponse.json(await readPdfOrder(bytes, fileName));
    }
    if (startsWith(bytes, DOCX_SIGNATURE)) {
      return NextResponse.json(await readDocxOrder(bytes, fileName));
    }
    return NextResponse.json({ error: 'That file is neither a PDF nor a Word document.', hint: 'A scan or a photograph has to be saved as a PDF first.' }, { status: 415 });
  } catch (error: any) {
    if (error instanceof ImportExtractionError) {
      return NextResponse.json({ error: error.message, hint: error.hint }, { status: error.status });
    }
    if (error instanceof DocxReadError) {
      return NextResponse.json({ error: error.message, hint: error.hint }, { status: 422 });
    }
    return NextResponse.json({ error: error?.message || 'The order could not be read.', hint: 'Enter the pieces by hand.' }, { status: 500 });
  }
}
