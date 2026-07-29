/**
 * VotingIntroNudge — the coach-mark that points at the GovernanceStrip.
 *
 * Replaces the old "auto-expand the whole explainer on your first visit"
 * behaviour: the page now always opens on the one-line strip, and this small
 * popover appears on visits 1 and 3 to say what is behind it. Schedule and copy
 * live in `@/lib/voting/votingIntro`; timing in `useVotingIntro`.
 *
 * Wraps its children in a PopoverAnchor so the arrow points at the real strip
 * wherever it lands, and portals the content so the board's glass panels
 * (zIndex 1) can never clip it.
 *
 * Props:
 *   variant     'first' | 'reminder' | null — null renders children only
 *   onShowMe    () => void — expand the explainer (also retires the nudge)
 *   onDismiss   () => void — close it
 *   children    the strip to anchor to
 */

import React, { useEffect } from 'react';
import {
  Box,
  Button,
  HStack,
  Popover,
  PopoverAnchor,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  Portal,
  Text,
  VStack,
  usePrefersReducedMotion,
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { NUDGE_COPY } from '@/lib/voting/votingIntro';
import { VOTE_PALETTE } from './votingDisplay';

export function VotingIntroNudge({ variant, onShowMe, onDismiss, children }) {
  const isOpen = !!variant && !!NUDGE_COPY[variant];
  const copy = NUDGE_COPY[variant] || NUDGE_COPY.first;
  const reduceMotion = usePrefersReducedMotion();

  // Chakra binds its own Escape handler to the popover content, but this hint
  // deliberately never takes focus — so the key never reaches it. Listen at the
  // document instead, or Escape silently does nothing.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onDismiss?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onDismiss]);

  return (
    <Popover
      isOpen={isOpen}
      onClose={onDismiss}
      // Centred under the strip. `bottom-end` aimed the arrow closer to the
      // "How it works" CTA but parked the card on top of the board's "Create
      // vote" button — a hint must never sit on the primary action. The whole
      // strip is the click target anyway, so the centre is a fair thing to
      // point at.
      placement="bottom"
      // A hint should not vanish the moment you look at something else — it is
      // dismissed on purpose (Later / Got it / Esc), not by stray clicks.
      closeOnBlur={false}
      // Never steal focus from the board on load; the popover is still in the
      // tab order for keyboard users.
      autoFocus={false}
      returnFocusOnClose={false}
      gutter={10}
      isLazy
    >
      <PopoverAnchor>
        <Box w="100%">{children}</Box>
      </PopoverAnchor>

      <Portal>
        <PopoverContent
          // Chakra's popper base style hardcodes zIndex: 10, which loses to the
          // fixed NavBar (zIndex 100) the moment the page scrolls. rootProps
          // reaches the positioner element, where the stacking is decided.
          // `banner` (1200) is the right slot: above the navbar, below the modal
          // overlay (1300) — a page hint must never float over an open poll.
          rootProps={{ zIndex: 'banner' }}
          motionProps={reduceMotion ? { transition: { duration: 0 } } : undefined}
          role="dialog"
          aria-label="How voting works"
          maxW={{ base: '19rem', md: '22rem' }}
          bg="#12101B"
          border="1px solid"
          borderColor="rgba(148, 115, 220, 0.45)"
          borderRadius="xl"
          boxShadow="0 0 28px rgba(148, 115, 220, 0.22), 0 12px 32px rgba(0,0,0,0.55)"
          color="white"
          _focusVisible={{ outline: 'none' }}
        >
          <PopoverArrow bg="#12101B" boxShadow="-1px -1px 0 rgba(148, 115, 220, 0.45)" />
          <PopoverBody p={4}>
            <VStack align="stretch" spacing={3}>
              <HStack spacing={2} align="center">
                <Box w="6px" h="6px" borderRadius="full" bg={VOTE_PALETTE.amethyst} flexShrink={0} />
                <Text fontSize="sm" fontWeight="800" color="white" lineHeight="1.3">
                  {copy.title}
                </Text>
              </HStack>

              <Text fontSize="xs" color="gray.300" lineHeight="1.6">
                {copy.body}
              </Text>

              <HStack spacing={2} justify="flex-end">
                <Button
                  size="sm"
                  variant="ghost"
                  minH="36px"
                  color="gray.400"
                  fontWeight="600"
                  _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                  onClick={onDismiss}
                >
                  {copy.dismiss}
                </Button>
                <Button
                  size="sm"
                  minH="36px"
                  bg={VOTE_PALETTE.amethyst}
                  color="white"
                  fontWeight="700"
                  rightIcon={<ChevronDownIcon />}
                  _hover={{ bg: VOTE_PALETTE.amethystBright }}
                  onClick={onShowMe}
                >
                  {copy.cta}
                </Button>
              </HStack>
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}

export default VotingIntroNudge;
