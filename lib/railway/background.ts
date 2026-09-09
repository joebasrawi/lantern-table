import { deliverNotifications } from './push-delivery';
import { db, sqlite } from './storage';
import { cleanupDeletedImages } from './account-deletion';
import { processDeadlines } from '../game/scheduler';
let started = false;
export async function register() {
  if (started) return;
  started = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await cleanupDeletedImages(sqlite());
      if (process.env.LANTERN_BACKGROUND_TURNS === 'true') {
        const result = await processDeadlines(db);
        if (result.failed)
          console.error('Background turn failures:', result.failed);
      }
      const notifications = await deliverNotifications(sqlite());
      if (notifications.failed)
        console.error('Notification delivery failures:', notifications.failed);
    } catch {
      console.error('Background turns temporarily unavailable');
    } finally {
      running = false;
    }
  };
  setInterval(() => {
    void tick();
  }, 60_000).unref();
  await tick();
}
