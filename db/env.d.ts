declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ACCESS_ISSUER?: string;
    ACCESS_AUDIENCE?: string;
    PORTRAITS: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    OPENAI_IMAGE_MODEL?: string;
    LANTERN_PORTRAITS_ENABLED?: string;
    LANTERN_SCENES_ENABLED?: string;
    LANTERN_PORTRAIT_DAILY_LIMIT?: string;
    LANTERN_AI_DAILY_LIMIT?: string;
  }
}
