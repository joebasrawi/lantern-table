import { processDeadlines } from './lib/game/scheduler';
const worker = {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: Cloudflare.Env) {
    const result = await processDeadlines(env.DB).catch((e: unknown) => {
      console.error(
        'Deadline worker failed',
        e instanceof Error ? e.message : 'Unknown error',
      );
      throw e;
    });
    console.log('Deadline processing', result);
    if (result.failed)
      throw new Error(
        'Some expired turns could not be saved; retry on the next run.',
      );
  },
};

export default worker;
