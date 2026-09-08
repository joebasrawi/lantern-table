declare const __LANTERN_STANDALONE__: boolean;

declare const __LANTERN_RAILWAY__: boolean;
declare module '#platform-auth' {
  export function railwayUser(
    token?: string,
  ): Promise<{ id: string; name: string } | null>;
  export function authGet(request: Request): Promise<Response>;
  export function authPost(request: Request): Promise<Response>;
}

declare module '#platform-background' {
  export function register(): Promise<void>;
}

declare module '#platform-notifications' {
  export function notifications(
    request: Request,
    userId: string | null,
  ): Promise<Response>;
}
