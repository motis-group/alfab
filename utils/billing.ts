const DEFAULT_MONTHLY_HOURS = 730;
const DEFAULT_EC2_HOURLY_AUD = 0.0132;
const DEFAULT_RDS_HOURLY_AUD = 0.028;
const DEFAULT_EC2_STORAGE_GB = 8;
const DEFAULT_EC2_STORAGE_GB_MONTH_AUD = 0.096;
const DEFAULT_RDS_STORAGE_GB = 20;
const DEFAULT_RDS_STORAGE_GB_MONTH_AUD = 0.138;
const DEFAULT_MISC_BUFFER_AUD = 6;
const DEFAULT_MARGIN_PERCENT = 35;

export interface BillingEstimate {
  currency: 'aud';
  assumptions: {
    monthlyHours: number;
    ec2HourlyAud: number;
    rdsHourlyAud: number;
    ec2StorageGb: number;
    ec2StorageGbMonthAud: number;
    rdsStorageGb: number;
    rdsStorageGbMonthAud: number;
    miscBufferAud: number;
    marginPercent: number;
  };
  costs: {
    ec2ComputeAud: number;
    rdsComputeAud: number;
    ec2StorageAud: number;
    rdsStorageAud: number;
    miscBufferAud: number;
    infraSubtotalAud: number;
    marginAud: number;
    targetMonthlyAud: number;
    targetMonthlyCents: number;
  };
}

function parseEnvNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getBillingEstimate(overrides?: { marginPercent?: number }): BillingEstimate {
  const monthlyHours = parseEnvNumber(process.env.BILLING_MONTHLY_HOURS, DEFAULT_MONTHLY_HOURS);
  const ec2HourlyAud = parseEnvNumber(process.env.BILLING_EC2_HOURLY_AUD, DEFAULT_EC2_HOURLY_AUD);
  const rdsHourlyAud = parseEnvNumber(process.env.BILLING_RDS_HOURLY_AUD, DEFAULT_RDS_HOURLY_AUD);
  const ec2StorageGb = parseEnvNumber(process.env.BILLING_EC2_STORAGE_GB, DEFAULT_EC2_STORAGE_GB);
  const ec2StorageGbMonthAud = parseEnvNumber(process.env.BILLING_EC2_STORAGE_GB_MONTH_AUD, DEFAULT_EC2_STORAGE_GB_MONTH_AUD);
  const rdsStorageGb = parseEnvNumber(process.env.BILLING_RDS_STORAGE_GB, DEFAULT_RDS_STORAGE_GB);
  const rdsStorageGbMonthAud = parseEnvNumber(process.env.BILLING_RDS_STORAGE_GB_MONTH_AUD, DEFAULT_RDS_STORAGE_GB_MONTH_AUD);
  const miscBufferAud = parseEnvNumber(process.env.BILLING_MISC_BUFFER_AUD, DEFAULT_MISC_BUFFER_AUD);
  const marginPercent = Math.max(0, overrides?.marginPercent ?? parseEnvNumber(process.env.BILLING_MARGIN_PERCENT, DEFAULT_MARGIN_PERCENT));

  const ec2ComputeAud = roundMoney(ec2HourlyAud * monthlyHours);
  const rdsComputeAud = roundMoney(rdsHourlyAud * monthlyHours);
  const ec2StorageAud = roundMoney(ec2StorageGb * ec2StorageGbMonthAud);
  const rdsStorageAud = roundMoney(rdsStorageGb * rdsStorageGbMonthAud);

  const infraSubtotalAud = roundMoney(ec2ComputeAud + rdsComputeAud + ec2StorageAud + rdsStorageAud + miscBufferAud);
  const marginAud = roundMoney((infraSubtotalAud * marginPercent) / 100);
  const targetMonthlyAud = roundMoney(infraSubtotalAud + marginAud);
  const targetMonthlyCents = Math.max(100, Math.round(targetMonthlyAud * 100));

  return {
    currency: 'aud',
    assumptions: {
      monthlyHours,
      ec2HourlyAud,
      rdsHourlyAud,
      ec2StorageGb,
      ec2StorageGbMonthAud,
      rdsStorageGb,
      rdsStorageGbMonthAud,
      miscBufferAud,
      marginPercent,
    },
    costs: {
      ec2ComputeAud,
      rdsComputeAud,
      ec2StorageAud,
      rdsStorageAud,
      miscBufferAud,
      infraSubtotalAud,
      marginAud,
      targetMonthlyAud,
      targetMonthlyCents,
    },
  };
}

export function formatAud(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
