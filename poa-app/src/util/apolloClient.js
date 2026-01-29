// apolloClient.js
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';

// New POP subgraph on Hoodi testnet
const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  'https://api.studio.thegraph.com/query/73367/poa-2/version/latest';

// Increment this when subgraph schema changes significantly to clear stale cache
const CACHE_VERSION = 'v3';

const client = new ApolloClient({
  link: new HttpLink({
    uri: SUBGRAPH_URL,
  }),
  cache: new InMemoryCache(),
});

// Clear stale cache when version changes (client-side only)
if (typeof window !== 'undefined') {
  const storedVersion = localStorage.getItem('poa-cache-version');
  if (storedVersion !== CACHE_VERSION) {
    client.clearStore().then(() => {
      localStorage.setItem('poa-cache-version', CACHE_VERSION);
      console.log('[Apollo] Cache cleared due to version change');
    });
  }
}

export default client;
