import { useAccount } from 'wagmi';
import { useAuth } from '@/context/AuthContext';
import { E2E_BURNER_PK, E2E_ORG_NAME } from '@/services/e2e/e2eMode';

/** Debug surface compiled only into explicit E2E builds. */
export default function TestFixturesPage() {
  const { address: eoaAddress } = useAccount();
  const { passkeyState } = useAuth();
  const hatId = process.env.NEXT_PUBLIC_E2E_HAT_ID || '';
  const orgId = process.env.NEXT_PUBLIC_E2E_ORG_ID || '';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const vouchUrl = (address) => (
    address && hatId
      ? `${baseUrl}/join?org=${encodeURIComponent(E2E_ORG_NAME)}&vouch=${address}&hatId=${encodeURIComponent(hatId)}`
      : ''
  );

  const fixtures = {
    orgName: E2E_ORG_NAME,
    orgId,
    hatId,
    eoa: {
      address: eoaAddress,
      vouchUrl: vouchUrl(eoaAddress),
      hasPrivateKey: Boolean(E2E_BURNER_PK),
    },
    passkey: {
      smartAccount: passkeyState?.accountAddress || null,
      credentialId: passkeyState?.credentialId || null,
      vouchUrl: vouchUrl(passkeyState?.accountAddress),
    },
  };

  return (
    <main style={{ padding: 24, fontFamily: 'monospace', maxWidth: 900 }}>
      <h1>E2E Test Fixtures</h1>
      <pre
        data-testid="e2e-fixtures"
        style={{
          background: '#f4f4f4',
          padding: 16,
          borderRadius: 4,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {JSON.stringify(fixtures, null, 2)}
      </pre>
    </main>
  );
}
