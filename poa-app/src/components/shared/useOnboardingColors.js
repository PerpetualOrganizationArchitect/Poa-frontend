import { useColorModeValue } from '@chakra-ui/react';

// Keep the join page and its account dialogs on the application's theme.
const light = {
  page: 'transparent',
  surface: 'white',
  ink: 'warmGray.900',
  muted: 'warmGray.600',
  line: 'warmGray.200',
  soft: 'amethyst.50',
  accent: 'amethyst.600',
  primary: 'amethyst.600',
  primaryText: 'white',
  hover: 'amethyst.700',
  link: 'amethyst.700',
  focusRing: '0 0 0 3px var(--chakra-colors-amethyst-200)',
  inputFocusRing: '0 0 0 1px var(--chakra-colors-amethyst-600)',
};

const dark = {
  page: 'gray.900',
  surface: 'gray.800',
  ink: 'warmGray.50',
  muted: 'gray.300',
  line: 'whiteAlpha.200',
  soft: 'whiteAlpha.100',
  accent: 'amethyst.200',
  primary: 'amethyst.300',
  primaryText: 'amethyst.900',
  hover: 'amethyst.200',
  link: 'amethyst.200',
  focusRing: '0 0 0 3px var(--chakra-colors-amethyst-600)',
  inputFocusRing: '0 0 0 1px var(--chakra-colors-amethyst-300)',
};

export default function useOnboardingColors() {
  return useColorModeValue(light, dark);
}
