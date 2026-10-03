export const REPORT_CATEGORIES = ['FRAUD_SCAM', 'INCORRECT_INFORMATION', 'DUPLICATE_LISTING', 'INAPPROPRIATE_CONTENT', 'FAKE_PROPERTY', 'SUSPICIOUS_BEHAVIOR', 'OTHER'] as const;
export const REPORT_TARGET_TYPES = ['PROPERTY', 'USER', 'AGENT', 'MESSAGE'] as const;

export type ReportCategory = typeof REPORT_CATEGORIES[number];
export type ReportTargetType = typeof REPORT_TARGET_TYPES[number];

export function isReportCategory(value: string): value is ReportCategory {
  return (REPORT_CATEGORIES as readonly string[]).includes(value);
}

export function isReportTargetType(value: string): value is ReportTargetType {
  return (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}
