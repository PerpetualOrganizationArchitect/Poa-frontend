import { ChakraProvider, extendTheme, CSSReset } from "@chakra-ui/react";
import { IPFSprovider } from "@/context/ipfsContext";
import { Web3Provider } from "@/context/web3Context";
import { DataBaseProvider } from "@/context/dataBaseContext";
import { ProfileHubProvider } from "@/context/profileHubContext";
import { ProjectProvider } from "@/context/ProjectContext";
import { UserProvider } from "@/context/UserContext";
import { POProvider } from "@/context/POContext";
import { VotingProvider } from "@/context/VotingContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { RefreshProvider } from "@/context/RefreshContext";
import { IdentityProvider } from "@/context/IdentityContext";
import { AuthProvider } from "@/context/AuthContext";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { TourProvider } from "@/features/tour/TourContext";
import TourOverlay from "@/features/tour/components/TourOverlay";
import TourPrompt from "@/features/tour/components/TourPrompt";
import '@rainbow-me/rainbowkit/styles.css';
import '../styles/globals.css';
import '/public/css/prism.css';
import {
  connectorsForWallets,
  RainbowKitProvider,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  coinbaseWallet,
  braveWallet,
  rabbyWallet,
  frameWallet,
  safeWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { defineChain } from 'viem';
import { base } from 'viem/chains';
import { NETWORKS, DEFAULT_NETWORK } from '../config/networks';
import { E2E_ENABLED } from '@/services/e2e/e2eMode';
import { burnerConnector } from '@/services/e2e/burnerConnector';
import E2EAutoConnect from '@/services/e2e/E2EAutoConnect';

// Build viem chains for ALL supported networks (needed for useSwitchChain).
// Base mainnet is appended for the cashout-withdraw flow (see CashOutService.fetchOutstandingDeposits / buildWithdrawDeposit) — it is NOT a Poa org chain, so it is NOT in NETWORKS to keep org/subgraph routing untouched.
const allChains = [
  ...Object.values(NETWORKS).map(cfg => defineChain({
    id: cfg.chainId,
    name: cfg.name,
    nativeCurrency: cfg.nativeCurrency,
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
    blockExplorers: { default: { name: 'Explorer', url: cfg.blockExplorer } },
  })),
  base,
];
const defaultChain = allChains.find(c => c.id === NETWORKS[DEFAULT_NETWORK].chainId);
import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query";

import NetworkModalControl from "@/components/NetworkModalControl";
import WhiteLabelUrlCleaner from "@/components/WhiteLabelUrlCleaner";
import { ApolloProvider } from '@apollo/client';
import client from '../util//apolloClient';
import Notification from '@/components/Notifications';



const queryClient = new QueryClient();

// Injected-first wallet list. No WalletConnect — `injectedWallet` uses EIP-6963
// (via wagmi's `injected()` + mipd) to surface every installed wallet as its own
// branded tile. The explicit Brave/Rabby/Frame entries only add install CTAs when
// those extensions aren't present; EIP-6963 takes over when they are.
// `coinbaseWallet` uses Coinbase's own SDK (not WalletConnect). `safeWallet` is
// iframe-only. Deliberately excluded: metaMaskWallet / rainbowWallet / trustWallet
// / ledgerWallet / argentWallet / walletConnectWallet — all use WC under the hood.
const connectors = connectorsForWallets(
  [
    { groupName: 'Recommended', wallets: [injectedWallet, coinbaseWallet] },
    { groupName: 'Privacy',     wallets: [braveWallet, rabbyWallet, frameWallet] },
    { groupName: 'Other',       wallets: [safeWallet] },
  ],
  { appName: 'Poa', projectId: '' }
);

const transports = Object.fromEntries(
  allChains.map(c => [c.id, http(c.rpcUrls.default.http[0])]),
);

// E2E mode REPLACES the wallet connectors with a synthetic burner.
// Prepending isn't enough — wagmi persists `recentConnectorId` and will
// happily reconnect to the user's real MetaMask if it's still in the list,
// shadowing the burner. In production builds, NEXT_PUBLIC_E2E_MODE is unset
// so this branch is dead code and webpack tree-shakes it.
const finalConnectors = E2E_ENABLED ? [burnerConnector()] : connectors;

const config = createConfig({
  connectors: finalConnectors,
  chains: allChains,
  transports,
  ssr: true,
  // EIP-6963 wallet discovery is on for production so installed wallets
  // self-announce. In E2E mode it must be off, otherwise MetaMask hijacks
  // the burner connector.
  multiInjectedProviderDiscovery: !E2E_ENABLED,
});


const theme = extendTheme({
  fonts: {
    heading: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'Roboto Mono', monospace",
  },
  colors: {
    // Primary - Warm Coral (action, warmth)
    coral: {
      50: '#FFF5F2',
      100: '#FFE8E1',
      200: '#FFD0C2',
      300: '#FFB299',
      400: '#FF8F6B',
      500: '#F06543',
      600: '#D64E2C',
      700: '#B33B1D',
      800: '#8C2E17',
      900: '#6B2412',
    },
    // Secondary - Soft Rose (warmth, approachability)
    rose: {
      50: '#FFF5F7',
      100: '#FFE8ED',
      200: '#FFD1DC',
      300: '#FFB3C4',
      400: '#FF8FA8',
      500: '#E85D85',
      600: '#CC4570',
      700: '#A83658',
      800: '#852944',
      900: '#661F34',
    },
    // Accent - Warm Amethyst (governance, creativity)
    amethyst: {
      50: '#F9F5FF',
      100: '#F0E5FF',
      200: '#E0CCFF',
      300: '#C9A8FF',
      400: '#B080FF',
      500: '#9055E8',
      600: '#7340CC',
      700: '#5A2FA8',
      800: '#452485',
      900: '#331A66',
    },
    // Neutral - Warm Gray (not blue-gray)
    warmGray: {
      50: '#FAFAF9',
      100: '#F5F4F2',
      200: '#E8E6E3',
      300: '#D6D3CE',
      400: '#B5B1A9',
      500: '#8F8A80',
      600: '#6B665C',
      700: '#4D4943',
      800: '#33302C',
      900: '#1F1D1A',
    },
  },
  styles: {
    global: {
      body: {
        bgGradient: "linear(135deg, #FFF5F0 0%, #FDF2F8 50%, #F5F3FF 100%)",
        color: "warmGray.900",
      },
    },
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: '500',
        borderRadius: 'lg',
      },
      variants: {
        primary: {
          bg: 'coral.500',
          color: 'white',
          _hover: {
            bg: 'coral.600',
            transform: 'translateY(-1px)',
            boxShadow: 'md',
          },
          _active: {
            bg: 'coral.700',
            transform: 'translateY(0)',
          },
        },
        glass: {
          bg: 'rgba(255, 255, 255, 0.8)',
          border: '1px solid',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          _hover: {
            bg: 'rgba(255, 255, 255, 0.9)',
          },
        },
      },
    },
    Card: {
      variants: {
        glass: {
          container: {
            bg: 'rgba(255, 255, 255, 0.8)',
            border: '1px solid',
            borderColor: 'rgba(255, 255, 255, 0.18)',
            boxShadow: '0 4px 30px rgba(0, 0, 0, 0.05)',
          },
        },
        elevated: {
          container: {
            bg: 'white',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04), 0 4px 8px rgba(0, 0, 0, 0.06)',
            border: '1px solid',
            borderColor: 'warmGray.100',
          },
        },
      },
    },
    Input: {
      variants: {
        glass: {
          field: {
            bg: 'rgba(255, 255, 255, 0.75)',
            border: '1px solid',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            _focus: {
              bg: 'rgba(255, 255, 255, 0.8)',
              borderColor: 'coral.400',
              boxShadow: '0 0 0 3px rgba(240, 101, 67, 0.15)',
            },
          },
        },
      },
    },
  },
});

import React, { useMemo } from 'react';

// Provider tree wrapped in React.memo. Only re-renders when `children` changes.
// Since `children` is a memoized page element (see MyApp), this prevents wagmi's
// Hydrate/reconnect store updates from cascading through all nested providers.
const StableProviders = React.memo(function StableProviders({ children }) {
  return (
    <AuthProvider>
      <ApolloProvider client={client}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            initialChain={defaultChain}
            theme={darkTheme({
              accentColor: '#F06543',
              accentColorForeground: 'white',
              borderRadius: 'large',
              fontStack: 'system',
              overlayBlur: 'small',
            })}
            appInfo={{ appName: 'Poa', learnMoreUrl: 'https://poa.box' }}
          >
            <RefreshProvider>
            <IdentityProvider>
            <IPFSprovider>
              <ProfileHubProvider>
                <POProvider>
                  <VotingProvider>
                    <ProjectProvider>
                      <UserProvider>
                        <NotificationProvider>
                          <Web3Provider>
                            <DataBaseProvider>
                              <ChakraProvider theme={theme}>
                                <TourProvider>
                                  <E2EAutoConnect />
                                  <WhiteLabelUrlCleaner />
                                  <NetworkModalControl />
                                  <Notification />
                                  <TourOverlay />
                                  <TourPrompt />
                                  {children}
                                </TourProvider>
                              </ChakraProvider>
                            </DataBaseProvider>
                          </Web3Provider>
                        </NotificationProvider>
                      </UserProvider>
                    </ProjectProvider>
                  </VotingProvider>
                </POProvider>
              </ProfileHubProvider>
            </IPFSprovider>
            </IdentityProvider>
            </RefreshProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </ApolloProvider>
    </AuthProvider>
  );
});

function MyApp({ Component, pageProps }) {
  // Memoize the page element so it's a stable reference across wagmi-triggered
  // re-renders. Only recreated on actual page navigation (Component change).
  // pageProps excluded from deps — always {} in this static-export app (no
  // getServerSideProps/getStaticProps), so the spread is a no-op.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const page = useMemo(() => (
    <Component {...pageProps} />
  ), [Component]);

  return (
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <StableProviders>
          {page}
        </StableProviders>
      </WagmiProvider>
    </ErrorBoundary>
  );
}

export default MyApp;
