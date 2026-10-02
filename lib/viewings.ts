import { ViewingStatus } from '@prisma/client';

export const VIEWING_SLOT_MINUTES = 60;
export const ACTIVE_VIEWING_STATUSES = [
  ViewingStatus.REQUESTED,
  ViewingStatus.ACCEPTED,
  ViewingStatus.RESCHEDULED,
] as const;

export function parseViewingSchedule(
  scheduledAtValue: string,
  preferredDateValue: string,
  preferredTimeValue: string,
  timeZoneOffsetMinutes: number,
  now = new Date(),
) {
  const scheduledAt = new Date(scheduledAtValue);
  if (!Number.isFinite(scheduledAt.getTime())) throw new Error('Choose a valid viewing date and time.');
  if (scheduledAt.getTime() <= now.getTime()) throw new Error('Viewing date and time must be in the future.');

  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(preferredDateValue);
  const timeParts = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(preferredTimeValue);
  if (!dateParts || !timeParts) throw new Error('Choose a valid viewing date and time.');
  const [, year, month, day] = dateParts;
  const [, hour, minute] = timeParts;
  const preferredDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (preferredDate.getUTCFullYear() !== Number(year)
    || preferredDate.getUTCMonth() !== Number(month) - 1
    || preferredDate.getUTCDate() !== Number(day)) {
    throw new Error('Choose a valid viewing date and time.');
  }
  if (!Number.isInteger(timeZoneOffsetMinutes) || timeZoneOffsetMinutes < -840 || timeZoneOffsetMinutes > 720) {
    throw new Error('Choose a valid time zone for the viewing.');
  }
  const expectedUtcTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  ) + timeZoneOffsetMinutes * 60_000;
  if (expectedUtcTime !== scheduledAt.getTime()) {
    throw new Error('Viewing date, time, and time zone do not match.');
  }

  return {
    scheduledAt,
    preferredDate,
    preferredTime: preferredTimeValue,
  };
}

export function viewingSlotWindow(scheduledAt: Date) {
  const duration = VIEWING_SLOT_MINUTES * 60_000;
  return {
    gt: new Date(scheduledAt.getTime() - duration),
    lt: new Date(scheduledAt.getTime() + duration),
  };
}

export function canManageViewingTransition(status: ViewingStatus, action: 'approve' | 'reject' | 'propose') {
  if (action === 'approve' || action === 'reject' || action === 'propose') {
    return status === ViewingStatus.REQUESTED || status === ViewingStatus.RESCHEDULED;
  }
  return false;
}

export function canRequesterUpdateViewing(status: ViewingStatus, action: 'confirm' | 'cancel') {
  if (action === 'confirm') return status === ViewingStatus.RESCHEDULED;
  return status === ViewingStatus.REQUESTED || status === ViewingStatus.RESCHEDULED;
}
