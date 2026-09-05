import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import '@rainbow-me/rainbowkit/styles.css';
import '../styles/globals.css';
import '/public/css/prism.css';

const CoreProviders = dynamic(
  () => import('@/components/providers/CoreProviders'),
);
const OrganizationProviders = dynamic(
  () => import('@/components/providers/OrganizationProviders'),
);
const RegistryProvider = dynamic(
  () => import('@/components/providers/RegistryProvider'),
);

// Fully static reading and redirect routes do not initialize wallets, Apollo,
// passkeys, or organization data. About opts into only the public registry;
// protocol opts into wallet services for donations. Unknown routes default to
// the full application shell.
const PUBLIC_ROUTES = new Set([
  '/404',
  '/_error',
  '/blog/[id]',
  '/browser',
  '/docs',
  '/docs/[id]',
  '/edu-Hub',
  '/org-structure',
  '/profileHub',
  '/user',
  '/voting-history',
]);

const REGISTRY_ONLY_ROUTES = new Set(['/about']);
const CORE_ONLY_ROUTES = new Set(['/', '/protocol']);

const theme = extendTheme({
  fonts: {
    heading: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    body: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'IBM Plex Mono', monospace",
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

function MyApp({ Component, pageProps, router }) {
  const page = <Component {...pageProps} />;
  const pathname = router?.pathname;

  let content = page;
  if (REGISTRY_ONLY_ROUTES.has(pathname)) {
    content = <RegistryProvider>{page}</RegistryProvider>;
  } else if (!PUBLIC_ROUTES.has(pathname)) {
    const coreContent = CORE_ONLY_ROUTES.has(pathname)
      ? (pathname === '/' ? <RegistryProvider>{page}</RegistryProvider> : page)
      : <OrganizationProviders>{page}</OrganizationProviders>;

    content = (
      <CoreProviders>{coreContent}</CoreProviders>
    );
  }

  return (
    <ErrorBoundary>
      <ChakraProvider theme={theme}>{content}</ChakraProvider>
    </ErrorBoundary>
  );
}

export default MyApp;
