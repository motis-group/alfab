import { NextResponse } from 'next/server';

import { BUILD_ID } from '@utils/build-id';

export const runtime = 'nodejs';
// The answer must come from the running server, not from `next build`.
export const dynamic = 'force-dynamic';

/** Returns the build that this server runs. components/NewVersionNotice.tsx compares it with the build of an open page. */
export function GET() {
  return NextResponse.json({ buildId: BUILD_ID }, { headers: { 'Cache-Control': 'no-store' } });
}
