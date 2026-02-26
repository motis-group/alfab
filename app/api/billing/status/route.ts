import { NextResponse } from 'next/server';

import { getAppSession, userHasPermission } from '@utils/auth-session';
import { getBillingEstimate } from '@utils/billing';
import { getBillingDefaults } from '@utils/billing-config';
import { getBillingAccountByKey } from '@utils/billing-db';

export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!userHasPermission(session, 'billing:read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const defaults = getBillingDefaults();
    const account = await getBillingAccountByKey(defaults.accountKey);
    const accountMargin = Number(account?.margin_percent);
    const estimate = getBillingEstimate({
      marginPercent: Number.isFinite(accountMargin) ? accountMargin : undefined,
    });

    return NextResponse.json({
      defaults,
      estimate,
      account,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Failed to load billing status',
      },
      { status: 500 }
    );
  }
}
