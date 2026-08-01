/**
 * WeightedBallot — budget-bar allocation for spreading one vote across options.
 *
 * Extracted and rebuilt from pollModal's weighted mode. A member has 100 points
 * to distribute. This surfaces:
 *   - a sticky allocation header: "You've used 65 of 100 points" + a single
 *     segmented bar colored per option (live budget visualization);
 *   - per-option slider + stepper (±5) + "All in" (assign the remainder here);
 *   - "Split evenly" toolbar action;
 *   - snap-to-remaining when fewer than 5 points are left (drag lands cleanly
 *     on 100 total instead of leaving a stranded remainder).
 *
 * No alert(). Controlled component — parent owns the allocation. onChange emits
 * a { [index]: weight } map (only non-zero entries). The caller derives the
 * explicit [index, weight] pairs for the contract (no Object.keys ordering
 * reliance). Mode switch preserves a single-choice pick as 100% at that index.
 *
 * Props:
 *   options   transformed proposal.options ([{ name }])
 *   value     { [index:number]: weight:number }  (weights sum to <= 100)
 *   onChange  (nextMap) => void
 *   disabled  bool
 */

import React, { useMemo, useCallback } from 'react';
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Button,
  IconButton,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from '@chakra-ui/react';
import { AddIcon, MinusIcon } from '@chakra-ui/icons';
import GlassBack from './GlassBack';
import { VOTE_PALETTE } from './votingDisplay';

const STEP = 5;
const SNAP_THRESHOLD = 5; // when <5 points remain, snap a bump to the remainder

// Per-option segment colors for the budget bar — amethyst family rotating
// through coral so adjacent segments stay distinguishable.
const SEGMENT_COLORS = [
  '#9473DC',
  '#F2836B',
  '#B79BF0',
  '#6BB2F2',
  '#68D391',
  '#F6C177',
  '#C6B4F5',
  '#F6B3A0',
];

function segColor(i) {
  return SEGMENT_COLORS[i % SEGMENT_COLORS.length];
}

export function WeightedBallot({ options = [], value = {}, onChange, disabled = false }) {
  const used = useMemo(
    () => Object.values(value).reduce((sum, w) => sum + (Number(w) || 0), 0),
    [value]
  );
  const remaining = Math.max(0, 100 - used);

  const emit = useCallback(
    (next) => {
      // Drop zero/empty entries so the map only carries live allocations.
      const cleaned = {};
      Object.entries(next).forEach(([k, w]) => {
        const val = Number(w) || 0;
        if (val > 0) cleaned[k] = val;
      });
      onChange?.(cleaned);
    },
    [onChange]
  );

  // Set one option to an absolute weight, clamped so the total never exceeds
  // 100 (a bump can't spend points it doesn't have). Snap-to-remaining: if the
  // requested increase leaves <5 points unspent, take the whole remainder.
  const setWeight = useCallback(
    (index, requested) => {
      if (disabled) return;
      const current = Number(value[index]) || 0;
      const otherUsed = used - current;
      const maxAllowed = 100 - otherUsed;
      let nextVal = Math.max(0, Math.min(requested, maxAllowed));

      const leftoverAfter = 100 - (otherUsed + nextVal);
      if (nextVal > current && leftoverAfter > 0 && leftoverAfter < SNAP_THRESHOLD) {
        nextVal = maxAllowed; // snap to consume the tiny remainder
      }

      emit({ ...value, [index]: nextVal });
    },
    [disabled, value, used, emit]
  );

  const bump = useCallback(
    (index, delta) => setWeight(index, (Number(value[index]) || 0) + delta),
    [setWeight, value]
  );

  const allIn = useCallback(
    (index) => setWeight(index, (Number(value[index]) || 0) + remaining),
    [setWeight, value, remaining]
  );

  const splitEvenly = useCallback(() => {
    if (disabled || options.length === 0) return;
    const n = options.length;
    // Distribute 100 in multiples of STEP; hand any leftover to the first option
    // so the total is exactly 100.
    const perRaw = Math.floor(100 / n / STEP) * STEP;
    const next = {};
    let assigned = 0;
    for (let i = 0; i < n; i++) {
      next[i] = perRaw;
      assigned += perRaw;
    }
    if (assigned < 100) next[0] = (next[0] || 0) + (100 - assigned);
    emit(next);
  }, [disabled, options.length, emit]);

  const clearAll = useCallback(() => emit({}), [emit]);

  const complete = used === 100;

  return (
    <VStack align="stretch" spacing={4} w="100%">
      {/* Sticky budget header + segmented bar */}
      <Box
        position="sticky"
        top={0}
        zIndex={2}
        borderRadius="xl"
        p={3}
        overflow="hidden"
      >
        <GlassBack light />
        <Flex justify="space-between" align="center" mb={2} gap={2}>
          <Text fontSize="sm" fontWeight="600" color="white">
            You&apos;ve used{' '}
            <Text as="span" color={complete ? 'green.300' : VOTE_PALETTE.leaderText} fontWeight="800">
              {used}
            </Text>{' '}
            of 100 points
          </Text>
          <HStack spacing={1}>
            <Button size="xs" variant="ghost" color="gray.300" _hover={{ bg: 'whiteAlpha.100' }} onClick={splitEvenly} isDisabled={disabled}>
              Split evenly
            </Button>
            {used > 0 && (
              <Button size="xs" variant="ghost" color="gray.400" _hover={{ bg: 'whiteAlpha.100' }} onClick={clearAll} isDisabled={disabled}>
                Clear
              </Button>
            )}
          </HStack>
        </Flex>
        <Flex w="100%" h="12px" borderRadius="full" overflow="hidden" bg="whiteAlpha.200">
          {options.map((_, i) => {
            const w = Number(value[i]) || 0;
            if (w <= 0) return null;
            return (
              <Box
                key={i}
                w={`${w}%`}
                h="100%"
                bg={segColor(i)}
                transition="width 0.2s ease"
                borderRight={w < 100 ? '1px solid rgba(0,0,0,0.35)' : 'none'}
              />
            );
          })}
        </Flex>
        {remaining > 0 && (
          <Text fontSize="2xs" color="gray.400" mt={1.5}>
            {remaining} point{remaining === 1 ? '' : 's'} left to allocate
          </Text>
        )}
      </Box>

      {/* Per-option rows */}
      <VStack align="stretch" spacing={3}>
        {options.map((option, index) => {
          const w = Number(value[index]) || 0;
          return (
            <Box key={option.id || index}>
              <Flex justify="space-between" align="center" mb={1.5} gap={2}>
                <HStack spacing={2} minW={0}>
                  <Box w="10px" h="10px" borderRadius="sm" bg={segColor(index)} flexShrink={0} />
                  <Text fontSize="sm" fontWeight="500" color="white" noOfLines={1}>
                    {option.name}
                  </Text>
                </HStack>
                <Text fontSize="sm" fontWeight="700" color={w > 0 ? segColor(index) : 'gray.400'} flexShrink={0}>
                  {w}%
                </Text>
              </Flex>
              <HStack spacing={3}>
                <Slider
                  aria-label={`Allocate points to ${option.name}`}
                  value={w}
                  min={0}
                  max={100}
                  step={STEP}
                  onChange={(val) => setWeight(index, val)}
                  isDisabled={disabled}
                  flex={1}
                  focusThumbOnChange={false}
                >
                  <SliderTrack bg="whiteAlpha.300" h="6px" borderRadius="full">
                    <SliderFilledTrack bg={segColor(index)} />
                  </SliderTrack>
                  <SliderThumb boxSize="18px" bg={segColor(index)} />
                </Slider>
                <HStack spacing={1} flexShrink={0}>
                  <IconButton
                    aria-label={`Remove ${STEP} points from ${option.name}`}
                    icon={<MinusIcon boxSize="9px" />}
                    size="sm"
                    minW="36px"
                    h="36px"
                    variant="outline"
                    borderColor="whiteAlpha.300"
                    color="white"
                    _hover={{ bg: 'whiteAlpha.100' }}
                    isDisabled={disabled || w <= 0}
                    onClick={() => bump(index, -STEP)}
                  />
                  <IconButton
                    aria-label={`Add ${STEP} points to ${option.name}`}
                    icon={<AddIcon boxSize="9px" />}
                    size="sm"
                    minW="36px"
                    h="36px"
                    variant="outline"
                    borderColor="whiteAlpha.300"
                    color="white"
                    _hover={{ bg: 'whiteAlpha.100' }}
                    isDisabled={disabled || remaining <= 0}
                    onClick={() => bump(index, STEP)}
                  />
                  <Button
                    size="sm"
                    h="36px"
                    variant="ghost"
                    color={VOTE_PALETTE.leaderText}
                    _hover={{ bg: VOTE_PALETTE.amethystSoft }}
                    isDisabled={disabled || remaining <= 0}
                    onClick={() => allIn(index)}
                    px={2}
                  >
                    All in
                  </Button>
                </HStack>
              </HStack>
            </Box>
          );
        })}
      </VStack>
    </VStack>
  );
}

/**
 * Convert a weighted-ballot value map into explicit contract pairs.
 * Returns { optionIndexes:number[], optionWeights:number[] } sorted by index —
 * no reliance on Object.keys insertion order.
 */
export function weightedPairs(value = {}) {
  const entries = Object.entries(value)
    .map(([k, w]) => [Number(k), Number(w) || 0])
    .filter(([, w]) => w > 0)
    .sort((a, b) => a[0] - b[0]);
  return {
    optionIndexes: entries.map(([i]) => i),
    optionWeights: entries.map(([, w]) => w),
  };
}

export default WeightedBallot;
