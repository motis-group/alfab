import { NextResponse } from 'next/server';

import { hasAppSession } from '@utils/auth-session';
import { getBillingEstimate } from '@utils/billing';

export async function GET() {
  const isSignedIn = await hasAppSession();
  if (!isSignedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const estimate = getBillingEstimate();
  return NextResponse.json({ estimate });
}
