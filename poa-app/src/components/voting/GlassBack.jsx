import React from 'react';
import { Box } from '@chakra-ui/react';
import { glassLayerStyle, glassLayerLightStyle } from '@/components/shared/glassStyles';

/**
 * Positioned dark-glass backing for voting surfaces.
 *
 * The shared glassLayerStyle has no top/left offsets and relies on a stacking
 * context existing on the PARENT — without `position="relative"` + a zIndex on
 * the parent, the zIndex:-1 layer escapes the component and paints BEHIND the
 * org-themed page background, leaving the card fully transparent (white text
 * on a mint theme). Always pair:
 *
 *   <Box position="relative" zIndex={1} ...>
 *     <GlassBack />
 *     ...content
 *   </Box>
 */
/** Near-opaque variant for modal/detail surfaces — matches the legacy modals'
 *  rgba(33,33,33,.98); the default .82 glass lets the board bleed through. */
const solidLayerStyle = {
  ...glassLayerStyle,
  backgroundColor: 'rgba(16, 12, 24, 0.985)',
};

const GlassBack = ({ light = false, solid = false }) => (
  <Box
    style={solid ? solidLayerStyle : light ? glassLayerLightStyle : glassLayerStyle}
    position="absolute"
    top={0}
    left={0}
    right={0}
    bottom={0}
    borderRadius="inherit"
    zIndex={-1}
  />
);

export default GlassBack;
