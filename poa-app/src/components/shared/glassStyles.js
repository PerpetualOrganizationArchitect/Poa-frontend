/**
 * Shared glass morphism styles used across the application
 */

export const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backdropFilter: 'blur(20px)',
  backgroundColor: 'rgba(0, 0, 0, .73)',
};

/**
 * Lighter glass variant for nested elements
 */
export const glassLayerLightStyle = {
  ...glassLayerStyle,
  backgroundColor: 'rgba(0, 0, 0, .5)',
};
