import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// E2E mode: pull burner key + passkey seed + Pimlico key from a single
// machine-level file so workspaces don't need per-clone env files. Only runs
// when the explicit E2E flag is set, so production builds never read the file
// even if it exists.
const E2E_ON = process.env.NEXT_PUBLIC_E2E_MODE === 'true';
if (E2E_ON) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const e2eEnvPath = path.join(os.homedir(), '.poa', 'e2e.env');
  if (fs.existsSync(e2eEnvPath)) {
    for (const line of fs.readFileSync(e2eEnvPath, 'utf8').split('\n')) {
      const m = line.match(/^POA_(.+?)=(.*)$/);
      if (!m) continue;
      let key = m[1];
      // The Pimlico API key matches the production env name with no E2E prefix.
      if (key === 'E2E_PIMLICO_API_KEY' || key === 'PIMLICO_API_KEY') {
        key = 'PIMLICO_API_KEY';
      }
      const targetKey = `NEXT_PUBLIC_${key}`;
      if (!process.env[targetKey]) process.env[targetKey] = m[2];
    }
  } else {
    console.warn(`[e2e] NEXT_PUBLIC_E2E_MODE=true but ${e2eEnvPath} not found. Run: node scripts/e2e/setup-machine.js`);
  }
}

// Force-inline the E2E env vars at build time. Next.js only does literal
// substitution when an env var is *defined* at build; missing ones stay as
// runtime lookups against the `process.env` polyfill — which defeats
// `if (E2E_ENABLED)` tree-shaking. Defaulting to empty/'false' here gives
// webpack a constant to fold against in production builds.
const e2eEnvInlines = {
  NEXT_PUBLIC_E2E_MODE: E2E_ON ? 'true' : 'false',
  NEXT_PUBLIC_E2E_BURNER_PK: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_BURNER_PK || '') : '',
  NEXT_PUBLIC_E2E_PASSKEY_SEED: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_PASSKEY_SEED || '') : '',
  NEXT_PUBLIC_E2E_ORG_NAME: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_ORG_NAME || 'Test6') : '',
  NEXT_PUBLIC_E2E_HAT_ID: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_HAT_ID || '') : '',
  NEXT_PUBLIC_E2E_ORG_ID: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_ORG_ID || '') : '',
  NEXT_PUBLIC_E2E_AS: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_AS || 'eoa') : '',
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  webpack: (config, { webpack, isServer }) => {
    // Force-inline the E2E env vars as string literals. Next.js's `env`
    // config field skips empty-string values, leaving them as runtime lookups
    // (`process.env.NEXT_PUBLIC_X || ""`) which keeps the env var names in
    // the production bundle. DefinePlugin substitutes them unconditionally.
    config.plugins.push(new webpack.DefinePlugin(
      Object.fromEntries(
        Object.entries(e2eEnvInlines).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)]),
      ),
    ));

    // Client-side ZK Email proving (snarkjs + @zk-email/helpers, dynamically imported only on the
    // /claim prove path) pull in Node built-ins. webpack 5 ignores resolve.fallback for `node:`-
    // scheme imports, so strip the prefix first, then polyfill the modules the DKIM parser + snarkjs
    // actually use at runtime (streams/crypto/buffer), and stub the truly node-only ones.
    // Client bundle ONLY: the static-export/data-collection pass runs in Node and needs the real
    // built-ins (e.g. process.cwd() for getStaticPaths), so never shim them server-side.
    if (isServer) return config;
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (r) => {
        r.request = r.request.replace(/^node:/, '');
      }),
    );
    config.plugins.push(
      new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'], process: 'process/browser' }),
    );
    config.resolve.fallback = {
      ...config.resolve.fallback,
      assert: require.resolve('assert/'),
      buffer: require.resolve('buffer/'),
      constants: require.resolve('constants-browserify'),
      crypto: require.resolve('crypto-browserify'),
      events: require.resolve('events/'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      os: require.resolve('os-browserify/browser'),
      path: require.resolve('path-browserify'),
      process: require.resolve('process/browser'),
      querystring: require.resolve('querystring-es3'),
      stream: require.resolve('stream-browserify'),
      url: require.resolve('url/'),
      util: require.resolve('util/'),
      vm: require.resolve('vm-browserify'),
      zlib: require.resolve('browserify-zlib'),
      fs: false,
      net: false,
      tls: false,
      child_process: false,
      readline: false,
      dns: false,
    };
    return config;
  },
  async redirects() {
    return [
      {
        source: '/',
        has: [{ type: 'host', value: 'poa.on-fleek.app' }],
        destination: 'https://poa.box',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'poa.on-fleek.app' }],
        destination: 'https://poa.box/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
