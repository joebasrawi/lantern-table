import { currentUser } from '../../../lib/auth';
import { notifications } from '#platform-notifications';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  const user = await currentUser();
  return notifications(request, user?.id ?? null);
}
export const GET = handle;
export const POST = handle;
