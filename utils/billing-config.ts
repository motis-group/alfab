export function getBillingDefaults() {
  return {
    accountKey: process.env.BILLING_ACCOUNT_KEY || 'alfab',
    companyName: process.env.BILLING_COMPANY_NAME || 'Alfab Pty Ltd',
    billingEmail: process.env.BILLING_DEFAULT_EMAIL || 'nick@alfab.com.au',
  };
}

export function getRequestOrigin(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || 'localhost:3000';
  const protocol = forwardedProto || (host.includes('localhost') ? 'http' : 'https');

  return `${protocol}://${host}`;
}

export function normalizeMarginPercent(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return fallback;
}
