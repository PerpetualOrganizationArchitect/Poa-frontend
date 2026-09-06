import { createClient } from '@/lib/ipfs/verifiedFetchClient';
import { serveVerifiedFetchWorker } from '@/lib/ipfs/verifiedFetchWorkerBridge';

void serveVerifiedFetchWorker(self, createClient);
