import assert from 'node:assert/strict';
import { ViewingStatus } from '@prisma/client';
import {
  canManageViewingTransition,
  canRequesterUpdateViewing,
  parseViewingSchedule,
  viewingSlotWindow,
} from '../lib/viewings';

const now = new Date('2030-01-01T00:00:00.000Z');
const schedule = parseViewingSchedule(
  '2030-04-10T14:30:00.000Z',
  '2030-04-10',
  '14:30',
  0,
  now,
);

assert.equal(schedule.scheduledAt.toISOString(), '2030-04-10T14:30:00.000Z');
assert.equal(schedule.preferredDate.toISOString(), '2030-04-10T00:00:00.000Z');
assert.equal(schedule.preferredTime, '14:30');

assert.throws(
  () => parseViewingSchedule('2029-12-31T23:59:00.000Z', '2029-12-31', '23:59', 0, now),
  /future/i,
);
assert.throws(
  () => parseViewingSchedule('2030-02-30T14:30:00.000Z', '2030-02-30', '14:30', 0, now),
  /valid viewing date/i,
);
assert.throws(
  () => parseViewingSchedule('2030-04-10T14:30:00.000Z', '2030-04-10', '25:30', 0, now),
  /valid viewing date/i,
);
assert.throws(
  () => parseViewingSchedule('2030-04-10T14:30:00.000Z', '2030-04-10', '14:30', -60, now),
  /do not match/i,
);

const window = viewingSlotWindow(schedule.scheduledAt);
assert.equal(window.gt.toISOString(), '2030-04-10T13:30:00.000Z');
assert.equal(window.lt.toISOString(), '2030-04-10T15:30:00.000Z');

assert.equal(canManageViewingTransition(ViewingStatus.REQUESTED, 'approve'), true);
assert.equal(canManageViewingTransition(ViewingStatus.RESCHEDULED, 'reject'), true);
assert.equal(canManageViewingTransition(ViewingStatus.ACCEPTED, 'propose'), false);
assert.equal(canRequesterUpdateViewing(ViewingStatus.RESCHEDULED, 'confirm'), true);
assert.equal(canRequesterUpdateViewing(ViewingStatus.REQUESTED, 'confirm'), false);
assert.equal(canRequesterUpdateViewing(ViewingStatus.ACCEPTED, 'cancel'), false);

console.log('Viewing scheduling and transition tests passed.');
