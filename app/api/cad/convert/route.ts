import { NextResponse } from 'next/server';

import { getAppSession } from '@utils/auth-session';
import { checkDwgConverter, convertDwgBufferToDxf, dwgConverterPath, isDwgBuffer } from '@utils/cad/dwg-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

// DWG is a closed binary format, so conversion is delegated to LibreDWG's dwg2dxf on the server.
// See docs/cad-import.md for installation notes.

export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const available = await checkDwgConverter();
  return NextResponse.json({ available, converter: dwgConverterPath() });
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

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'The DWG file is larger than 40 MB.', hint: 'Export only the glass outline as DXF and upload that.' }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isDwgBuffer(bytes)) {
    return NextResponse.json({ error: 'The uploaded file is not a DWG drawing.', hint: 'DXF and SVG files are read directly in the browser; only DWG files need conversion.' }, { status: 415 });
  }

  const outcome = await convertDwgBufferToDxf(bytes);
  if (!outcome.ok || !outcome.dxf) {
    return NextResponse.json({ error: outcome.error, hint: outcome.hint }, { status: outcome.status || 500 });
  }

  return new NextResponse(outcome.dxf, {
    status: 200,
    headers: {
      'Content-Type': 'application/dxf',
      'Content-Disposition': `inline; filename="${(file.name || 'drawing').replace(/\.dwg$/i, '')}.dxf"`,
      'Cache-Control': 'no-store',
    },
  });
}
