import { glassLayerStyle, inputStyles } from '@/components/shared/glassStyles';

// Match the dark task and voting dialogs while sharing their form controls.
export const educationDialogStyle = {
  bg: 'rgba(15, 10, 25, 0.97)',
  color: 'white',
  borderRadius: 'xl',
  border: '1px solid rgba(148, 115, 220, 0.3)',
  boxShadow: 'dark-lg',
  sx: {
    '.chakra-form__error-message, .chakra-form__required-indicator': { color: 'red.300' },
  },
};

export const educationFieldStyle = {
  ...inputStyles,
  borderRadius: 'lg',
  fontSize: 'sm',
  focusBorderColor: 'purple.400',
};

export const educationCardStyle = {
  bg: glassLayerStyle.backgroundColor,
  border: '1px solid rgba(255, 255, 255, 0.14)',
  borderRadius: '2xl',
  color: 'white',
};
