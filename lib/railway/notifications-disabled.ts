export async function notifications(_request: Request, _userId: string | null) {
  return Response.json(
    {
      enabled: false,
      error: 'Browser notifications are not available on this host.',
    },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}
