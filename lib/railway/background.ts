import { db } from './storage';
import { processDeadlines } from '../game/scheduler';
let started = false;
export async function register() {
  if (started || process.env.LANTERN_BACKGROUND_TURNS !== 'true') return;
  started = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await processDeadlines(db);
      if (result.failed)
        console.error('Background turn failures:', result.failed);
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
