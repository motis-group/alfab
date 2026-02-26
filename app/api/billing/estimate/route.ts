import { NextResponse } from 'next/server';

import { getAppSession, userHasPermission } from '@utils/auth-session';
import { getBillingEstimate } from '@utils/billing';

export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!userHasPermission(session, 'billing:read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const estimate = getBillingEstimate();
  return NextResponse.json({ estimate });
}
