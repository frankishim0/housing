import assert from 'node:assert/strict';
import { NotificationType } from '@prisma/client';
import { deliverNotifications } from '../lib/notifications';

const persisted: string[] = [];
const published: string[] = [];

async function run() {
  await deliverNotifications({
    userIds: ['owner-1', 'owner-1', '', 'agent-1'],
    type: NotificationType.PROPERTY,
    message: 'A listing update is available.',
    eventName: 'notification',
    eventData: { propertyId: 'property-1' },
  }, {
    persist: async (userId) => { persisted.push(userId); },
    publish: async (userId) => { published.push(userId); },
  });

  assert.deepEqual(persisted.sort(), ['agent-1', 'owner-1']);
  assert.deepEqual(published.sort(), ['agent-1', 'owner-1']);

  let realtimeAfterPersistenceFailure = false;
  await assert.doesNotReject(() => deliverNotifications({
    userIds: ['owner-1'],
    type: NotificationType.PROPERTY,
    message: 'A listing update is available.',
    eventName: 'notification',
  }, {
    persist: async () => { throw new Error('database unavailable'); },
    publish: async () => { realtimeAfterPersistenceFailure = true; },
  }));
  assert.equal(realtimeAfterPersistenceFailure, true);

  let persistenceBeforeRealtimeFailure = false;
  await assert.doesNotReject(() => deliverNotifications({
    userIds: ['owner-1'],
    type: NotificationType.PROPERTY,
    message: 'A listing update is available.',
    eventName: 'notification',
  }, {
    persist: async () => { persistenceBeforeRealtimeFailure = true; },
    publish: async () => { throw new Error('realtime unavailable'); },
  }));
  assert.equal(persistenceBeforeRealtimeFailure, true);

  console.log('Notification delivery resilience tests passed.');
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
