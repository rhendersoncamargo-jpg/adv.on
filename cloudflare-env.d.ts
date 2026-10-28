declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SESSION_SECRET?: string;
    ADMIN_SETUP_TOKEN?: string;
  }
}
