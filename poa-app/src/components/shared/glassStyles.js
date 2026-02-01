/**
 * Shared glass morphism styles used across the application
 * Import these instead of defining locally to maintain consistency
 */

// Base glass properties - spread this and override for custom variants
export const glassBaseStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
};

/**
 * Standard glass layer - most common variant
 * blur(20px), opacity 0.73
 */
export const glassLayerStyle = {
  ...glassBaseStyle,
  backdropFilter: 'blur(20px)',
  backgroundColor: 'rgba(0, 0, 0, .73)',
};

/**
 * Light glass variant for nested elements
 * blur(20px), opacity 0.5
 */
export const glassLayerLightStyle = {
  ...glassBaseStyle,
  backdropFilter: 'blur(20px)',
  backgroundColor: 'rgba(0, 0, 0, .5)',
};

/**
 * Standard glass with purple accent shadow
 * Used in voting components
 */
export const glassLayerWithShadowStyle = {
  ...glassBaseStyle,
  backdropFilter: 'blur(20px)',
  backgroundColor: 'rgba(0, 0, 0, .8)',
  boxShadow: 'inset 0 0 15px rgba(148, 115, 220, 0.15)',
};

/**
 * Dark glass variant
 * blur(20px), opacity 0.85
 */
export const glassLayerDarkStyle = {
  ...glassBaseStyle,
  backdropFilter: 'blur(20px)',
  backgroundColor: 'rgba(0, 0, 0, .85)',
};

/**
 * Very dark glass variant
 * blur(20px), opacity 0.9
 */
export const glassLayerVeryDarkStyle = {
  ...glassBaseStyle,
  backdropFilter: 'blur(20px)',
  backgroundColor: 'rgba(0, 0, 0, .9)',
};

/**
 * Modal glass style - darker grey background
 * blur(9px), grey background
 */
export const glassModalStyle = {
  ...glassBaseStyle,
  backdropFilter: 'blur(9px)',
  backgroundColor: 'rgba(33, 33, 33, 0.97)',
};

/**
 * Modal glass style with purple shadow
 */
export const glassModalWithShadowStyle = {
  ...glassModalStyle,
  boxShadow: 'inset 0 0 15px rgba(148, 115, 220, 0.15)',
};

/**
 * High blur glass for dashboard/treasury
 * blur(70px), opacity 0.79
 */
export const glassHighBlurStyle = {
  ...glassBaseStyle,
  backdropFilter: 'blur(70px)',
  backgroundColor: 'rgba(0, 0, 0, .79)',
};

/**
 * Task column glass - transparent, high blur
 * blur(60px), opacity 0.3
 */
export const glassTaskColumnStyle = {
  ...glassBaseStyle,
  backdropFilter: 'blur(60px)',
  backgroundColor: 'rgba(0, 0, 0, .3)',
};

/**
 * Sidebar glass with border
 * blur(15px), opacity 0.85
 */
export const glassSidebarStyle = {
  ...glassBaseStyle,
  backdropFilter: 'blur(15px)',
  backgroundColor: 'rgba(0, 0, 0, .85)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
};

/**
 * User page glass - high blur, very dark
 * blur(50px), opacity 0.9
 */
export const glassUserPageStyle = {
  ...glassBaseStyle,
  backdropFilter: 'blur(50px)',
  backgroundColor: 'rgba(0, 0, 0, .9)',
};
