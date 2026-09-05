import { ApolloProvider } from '@apollo/client';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import Notification from '@/components/Notifications';
import WhiteLabelUrlCleaner from '@/components/WhiteLabelUrlCleaner';
import { AuthProvider } from '@/context/AuthContext';
import { IPFSprovider } from '@/context/ipfsContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { RefreshProvider } from '@/context/RefreshContext';
import E2EAutoConnect from '@/services/e2e/E2EAutoConnect';
import apolloClient from '@/util/apolloClient';
import {
  rainbowKitAppInfo,
  rainbowKitTheme,
  wagmiConfig,
} from '@/components/providers/web3Config';

const queryClient = new QueryClient();

/**
 * Wallet/account providers used by the interactive landing page, protocol
 * donations, and every organization route. Static reading routes skip this
 * entire async bundle.
 */
export default function CoreProviders({ children }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <AuthProvider>
        <ApolloProvider client={apolloClient}>
          <QueryClientProvider client={queryClient}>
            {/* Do not force the Arbitrum home chain here. Org routes select
                their own chain, and an initial chain would cause an extra
                Arbitrum prompt before switching to Gnosis. */}
            <RainbowKitProvider
              theme={rainbowKitTheme}
              appInfo={rainbowKitAppInfo}
            >
              <RefreshProvider>
                <IPFSprovider>
                  <NotificationProvider>
                    <E2EAutoConnect />
                    <WhiteLabelUrlCleaner />
                    <Notification />
                    {children}
                  </NotificationProvider>
                </IPFSprovider>
              </RefreshProvider>
            </RainbowKitProvider>
          </QueryClientProvider>
        </ApolloProvider>
      </AuthProvider>
    </WagmiProvider>
  );
}
