declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ACCESS_ISSUER?: string;
    ACCESS_AUDIENCE?: string;
    PORTRAITS: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
  }
}
