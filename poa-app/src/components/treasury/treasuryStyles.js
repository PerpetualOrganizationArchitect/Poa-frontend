/**
 * Shared design vocabulary for the treasury — "the open ledger".
 *
 * Accent plate validated with the dataviz palette checker against the treasury's
 * effective card surface (LEDGER_GLASS over the mint page ≈ #17251e): lightness
 * band, chroma floor, CVD separation (worst adjacent ΔE 49.7) and ≥3:1 contrast
 * all pass. Per dataviz rules these hues go on MARKS (dots, bars, accent rules)
 * only — text and values stay in ink tokens.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Box, HStack, Text, keyframes, usePrefersReducedMotion } from '@chakra-ui/react';

export const ACCENT = {
  in: '#22A55E',        // money into the treasury
  out: '#9055E8',       // shared out to members (brand amethyst.500)
  gas: '#0CAA9B',       // network-fee fund
  attention: '#C98500', // needs action
};

// The treasury's glass surface — keep in sync with the palette validation above.
export const LEDGER_GLASS = 'rgba(0, 0, 0, .79)';

export const INK = {
  primary: 'rgba(255, 255, 255, 0.95)',
  secondary: 'rgba(255, 255, 255, 0.66)',
  muted: 'rgba(255, 255, 255, 0.52)',   // ≥4.5:1 on the glass surface — smallest text tier
  faint: 'rgba(255, 255, 255, 0.24)',   // decorative only (hairlines, dividers) — never text
};

export const HAIRLINE = '1px solid rgba(255, 255, 255, 0.08)';
export const HAIRLINE_STRONG = '1px solid rgba(255, 255, 255, 0.14)';
export const ROW_HOVER = 'rgba(255, 255, 255, 0.03)';

// Columns of figures align; large standalone numbers stay proportional.
export const TABULAR = { fontVariantNumeric: 'tabular-nums' };

export const eyebrowStyle = {
  fontSize: '11px',
  fontWeight: '600',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: INK.muted,
};

/** Small colored square that ties a label to its series/flow. */
export const SeriesDot = ({ color, size = '8px' }) => (
  <Box w={size} h={size} borderRadius="2px" bg={color} flexShrink={0} />
);

/**
 * Editorial section header: letterspaced eyebrow + hairline rule running right,
 * with optional meta (a count, a caption) seated at the far end.
 */
export const SectionHeader = ({ children, meta, accent, after, mb = 4 }) => (
  <HStack spacing={3} mb={mb} align="center">
    {accent && <SeriesDot color={accent} />}
    <Text as="span" sx={eyebrowStyle} whiteSpace="nowrap">
      {children}
    </Text>
    {after}
    <Box flex={1} borderTop={HAIRLINE} />
    {meta && (
      <Text fontSize="xs" color={INK.muted} whiteSpace="nowrap" sx={TABULAR}>
        {meta}
      </Text>
    )}
  </HStack>
);

/**
 * The one money grammar, at two scales: small raised "≈ $" prefix, large
 * proportional integers, small decimals. `approx` is dropped automatically
 * for an exact zero (an estimate sign on nothing reads odd).
 */
export const MoneyFigure = ({ value, size = 'panel' }) => {
  const v = Number(value) || 0;
  const [dollars, cents] = v
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split('.');
  const isHero = size === 'hero';
  return (
    <Text
      as="span"
      fontSize={isHero ? { base: '6xl', md: '7xl' } : { base: '3xl', md: '4xl' }}
      fontWeight="bold"
      lineHeight="1"
      letterSpacing="-0.03em"
      color={INK.primary}
      whiteSpace="nowrap"
    >
      <Text as="span" fontSize="0.45em" fontWeight="semibold" color={INK.muted} mr="0.15em" verticalAlign="0.55em">
        {v === 0 ? '$' : '≈ $'}
      </Text>
      {dollars}
      <Text as="span" fontSize="0.45em" fontWeight="semibold" color={INK.secondary}>
        .{cents}
      </Text>
    </Text>
  );
};

/** Format a display amount to two decimals — full precision belongs in tooltips/on-chain. */
export const twoDp = (numish) => {
  const n = Number(numish);
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(numish);
};

/** Figure-level unit, set small beside a stat value. */
export const UnitSpan = ({ children }) => (
  <Text as="span" fontSize="0.6em" fontWeight="semibold" color={INK.muted} ml="0.35em">
    {children}
  </Text>
);

/* ── Motion — the quiet-life layer ──────────────────────────────────────────
 * Same curve as the landing's .poa-rise so the whole product breathes alike.
 * Everything here disappears under prefers-reduced-motion.
 */

export const RISE_CURVE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const riseIn = keyframes`
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const dotPulse = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.35; }
`;

const ringPulse = keyframes`
  0%   { box-shadow: 0 0 0 1px rgba(144, 85, 232, 0); }
  35%  { box-shadow: 0 0 0 1px rgba(144, 85, 232, 0.55); }
  100% { box-shadow: 0 0 0 1px rgba(144, 85, 232, 0); }
`;

/** Staggered entrance wrapper for the page zones. A caller-supplied
 *  `animation` (e.g. the flash ring) takes over once it's active. */
export const Rise = ({ delay = 0, animation, children, ...rest }) => {
  const reduced = usePrefersReducedMotion();
  const rise = reduced ? undefined : `${riseIn} 0.55s ${RISE_CURVE} ${delay}s both`;
  return (
    <Box {...rest} animation={animation ?? rise}>
      {children}
    </Box>
  );
};

/** SeriesDot that gently pulses — "this is live right now". */
export const LiveDot = ({ color, size = '6px' }) => {
  const reduced = usePrefersReducedMotion();
  return (
    <Box
      w={size}
      h={size}
      borderRadius="2px"
      bg={color}
      flexShrink={0}
      animation={reduced ? undefined : `${dotPulse} 2.4s ease-in-out infinite`}
    />
  );
};

/** One-shot purple ring, fired when a CTA lands the user somewhere. */
export const flashRing = (active, reduced) =>
  active && !reduced ? `${ringPulse} 1.4s ${RISE_CURVE} 1` : undefined;

/**
 * Count a number up to its target on arrival — the money waking up.
 * Returns the target directly under reduced motion or for non-finite input.
 */
export const useCountUp = (target, duration = 750) => {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const to = Number(target);
    if (!Number.isFinite(to) || reduced) {
      setDisplay(Number.isFinite(to) ? to : 0);
      return undefined;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (to - from) * eased;
      setDisplay(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, reduced]);

  return display;
};

/**
 * Returns 0 on first paint, then the real value one frame later — pair with a
 * CSS width transition so meters and progress bars fill in rather than pop.
 */
export const useMountedValue = (value) => {
  const reduced = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  if (reduced) return value;
  return ready ? value : 0;
};

/** Width transition for meter/progress fills, matched to the house curve. */
export const FILL_TRANSITION = `width 0.9s ${RISE_CURVE}`;
