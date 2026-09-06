/**
 * Shared color tokens for role creation and its reusable settings controls.
 *
 * `optionBg` exists because a Chakra `<Select>`'s `<option>` elements are rendered by the OS, not
 * by Chakra — on a dark surface they inherit a white popup list and the text disappears unless the
 * background is set inline (the same `#1a1a2e` RoleConfigurator has always used).
 */

import { inputStyles } from '@/components/shared/glassStyles';

export const FORM_TOKENS = {
  light: {
    accent: 'coral',
    heading: 'warmGray.900',
    label: 'warmGray.900',
    text: 'warmGray.700',
    help: 'warmGray.500',
    panelBg: 'white',
    panelBorder: 'warmGray.100',
    subtleBg: 'warmGray.50',
    input: {
      bg: 'white',
      border: '1px solid',
      borderColor: 'warmGray.200',
      color: 'warmGray.900',
      _placeholder: { color: 'warmGray.400' },
      _hover: { borderColor: 'warmGray.300' },
      _focus: { borderColor: 'coral.400', boxShadow: '0 0 0 1px var(--chakra-colors-coral-400)' },
    },
    optionBg: '#ffffff',
    search: 'light',
  },
  dark: {
    accent: 'purple',
    heading: 'white',
    label: 'gray.200',
    text: 'gray.300',
    help: 'gray.400',
    panelBg: 'whiteAlpha.50',
    panelBorder: 'rgba(148, 115, 220, 0.2)',
    subtleBg: 'whiteAlpha.50',
    input: inputStyles,
    optionBg: '#1a1a2e',
    search: 'dark',
  },
};

export const tokensFor = (variant) => FORM_TOKENS[variant] || FORM_TOKENS.light;

export default FORM_TOKENS;
