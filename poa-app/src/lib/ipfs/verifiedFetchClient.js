import { Helia } from '@helia/utils';
import { createLibp2p } from 'libp2p';
import { createVerifiedFetchWithHelia } from '@helia/verified-fetch';
import { trustlessGateway } from '@helia/block-brokers';
import { delegatedHTTPRouting, httpGatewayRouting } from '@helia/routers';
import { IDBBlockstore } from 'blockstore-idb';
import { IDBDatastore } from 'datastore-idb';

const TRUSTLESS_GATEWAYS = [
  'https://trustless-gateway.link',
  'https://gateway.pinata.cloud',
];

export async function createClient() {
  const blockstore = new IDBBlockstore('poa-helia-blocks');
  const datastore = new IDBDatastore('poa-helia-data');
  let libp2p;
  let helia;
  try {
    await blockstore.open();
    await datastore.open();
    // Helia 6 requires a real libp2p instance, but HTTP retrieval does not need
    // transports, listeners, peer discovery, or a persistent peer keychain.
    // Explicit HTTP routers below handle provider discovery and fallback.
    libp2p = await createLibp2p({
      start: false,
      addresses: { listen: [] },
      transports: [],
      connectionEncrypters: [],
      streamMuxers: [],
      peerDiscovery: [],
      services: {},
    });
    helia = new Helia({
      libp2p,
      blockstore,
      datastore,
      blockBrokers: [trustlessGateway()],
      routers: [
        delegatedHTTPRouting({ url: 'https://delegated-ipfs.dev' }),
        httpGatewayRouting({ gateways: TRUSTLESS_GATEWAYS }),
      ],
    });
    await helia.start();
    // This entry point excludes the default WebRTC/Bitswap factory from the
    // dependency graph, while retaining UnixFS/IPLD verification and caching.
    const verifiedFetch = await createVerifiedFetchWithHelia(helia);
    return { verifiedFetch, disabled: false };
  } catch (error) {
    // Release partially initialized resources before gateway-only fallback.
    await Promise.allSettled([helia ? helia.stop() : libp2p?.stop()]);
    await Promise.allSettled([blockstore.close(), datastore.close()]);
    throw error;
  }
}
