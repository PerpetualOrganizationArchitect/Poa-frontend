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
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import '@rainbow-me/rainbowkit/styles.css';
import '../styles/globals.css';
import '/public/css/prism.css';
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { defineChain } from 'viem';

// Define Hoodi testnet chain
const hoodi = defineChain({
  id: 560048,
  name: 'Hoodi',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://0xrpc.io/hoodi'] },
  },
  blockExplorers: {
    default: { name: 'Hoodi Explorer', url: 'https://explorer.hoodi.ethpandaops.io' },
  },
});
import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query";

import NetworkModalControl from "@/components/NetworkModalControl";
import { ApolloProvider } from '@apollo/client';
import client from '../util//apolloClient';
import Notification from '@/components/Notifications';



const queryClient = new QueryClient();
const config = getDefaultConfig({
  appName: 'Poa',
  projectId: '7dc7409d6ef96f46e91e9d5797e4deac',
  chains: [hoodi],
  ssr: false,
});


const theme = extendTheme({
  fonts: {
    heading: "'Roboto Mono', monospace", 
    body: "'Roboto Mono', monospace", 
  },
  styles: {
    global: {
     
      body: {
        bgGradient: "linear(to-r, orange.200, pink.200)",
        color: "#001443",
      },
      
    },
  },
});

function MyApp({ Component, pageProps }) {
  return (
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <ApolloProvider client={client}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider initialChain={hoodi}>
              <RefreshProvider>
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
                                  <NetworkModalControl />
                                  <Notification />
                                  <Component {...pageProps} />
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
              </RefreshProvider>
            </RainbowKitProvider>
          </QueryClientProvider>
        </ApolloProvider>
      </WagmiProvider>
    </ErrorBoundary>
  );
}

export default MyApp;
