# poa-app

The Next.js workspace inside [Poa-frontend](../README.md). See the [repo README](../README.md) for architecture and the subgraph layer, and the [contributing guide](../CONTRIBUTING.md) for setup, conventions, and PR process.

Common commands (run from this directory):

```bash
yarn install
yarn dev          # http://localhost:3000
yarn build        # static export to ./out, used by the IPFS deploy
yarn lint
```

Node 22.23.2 is pinned via Volta in `package.json`. No env vars are required for read-only browsing.
