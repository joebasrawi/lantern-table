import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  const railway = process.env.LANTERN_HOSTING === 'railway';
  const standalone = process.env.LANTERN_HOSTING === 'standalone';
  const standaloneConfig =
    process.env.LANTERN_STANDALONE_CONFIG || 'wrangler.standalone.json';
  if (standalone && !existsSync(standaloneConfig))
    throw new Error(
      'Copy wrangler.standalone.example.json to wrangler.standalone.json and configure your account first.',
    );
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    define: {
      __LANTERN_STANDALONE__: JSON.stringify(standalone),
      __LANTERN_RAILWAY__: JSON.stringify(railway),
    },
    resolve: {
      alias: {
        '#platform-background': fileURLToPath(
          new URL(
            railway
              ? './lib/railway/background.ts'
              : './lib/railway/background-disabled.ts',
            import.meta.url,
          ),
        ),
        '#platform-notifications': fileURLToPath(
          new URL(
            railway
              ? './lib/railway/notifications.ts'
              : './lib/railway/notifications-disabled.ts',
            import.meta.url,
          ),
        ),
        '#platform-auth': fileURLToPath(
          new URL(
            railway
              ? './lib/railway/auth.ts'
              : './lib/railway/auth-disabled.ts',
            import.meta.url,
          ),
        ),
        ...(railway
          ? {
              'cloudflare:workers': fileURLToPath(
                new URL('./lib/railway/env.ts', import.meta.url),
              ),
            }
          : {}),
      },
    },
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      ...(standalone || railway ? [] : [sites()]),
      ...(railway
        ? []
        : [
            cloudflare({
              viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
              ...(standalone
                ? { configPath: standaloneConfig }
                : {
                    config: {
                      ...localBindingConfig,
                      ...(command === 'serve' && process.env.OPENAI_API_KEY
                        ? {
                            vars: {
                              OPENAI_API_KEY: process.env.OPENAI_API_KEY,
                            },
                          }
                        : {}),
                    },
                  }),
            }),
          ]),
    ],
  };
});
