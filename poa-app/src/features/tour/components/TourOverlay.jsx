import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { keyframes } from '@emotion/react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Icon,
  IconButton,
  Portal,
  useBreakpointValue,
  useClipboard,
  Input,
  InputGroup,
  InputRightElement,
} from '@chakra-ui/react';
import { CloseIcon, CopyIcon, CheckIcon } from '@chakra-ui/icons';
import { useTour } from '../TourContext';
import useSpotlightTarget from '../hooks/useSpotlightTarget';
import useTargetElevation from '../hooks/useTargetElevation';

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
`;

const PAD = 8;
const TOOLTIP_W = 380;
const GAP = 14;
const EDGE = 12;

// --- Spotlight highlight using box-shadow trick ---
// A transparent div positioned over the target, with a massive box-shadow
// that acts as the dark overlay. Much simpler than SVG masks.

function Spotlight({ rect, isActionStep }) {
  if (!rect) {
    // No target — full dark overlay
    return (
      <Box
        position="fixed"
        inset={0}
        bg="rgba(0, 0, 0, 0.75)"
        zIndex={9998}
        pointerEvents="auto"
        transition="opacity 0.3s ease"
      />
    );
  }

  return (
    <Box
      position="fixed"
      top={`${rect.top - PAD}px`}
      left={`${rect.left - PAD}px`}
      width={`${rect.width + PAD * 2}px`}
      height={`${rect.height + PAD * 2}px`}
      borderRadius="12px"
      boxShadow="0 0 0 9999px rgba(0, 0, 0, 0.75)"
      zIndex={9998}
      pointerEvents={isActionStep ? 'none' : 'auto'}
      transition="top 0.35s ease, left 0.35s ease, width 0.35s ease, height 0.35s ease"
    />
  );
}

// --- Tooltip positioning ---

const ESTIMATED_TOOLTIP_H = 230;

function getTooltipStyle(rect, placement, isMobile, measuredHeight) {
  if (isMobile) {
    return { position: 'fixed', bottom: 0, left: 0, right: 0 };
  }
  if (placement === 'bottom-fixed') {
    return { position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', width: `${TOOLTIP_W}px` };
  }
  if (!rect || placement === 'center') {
    return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: `${TOOLTIP_W}px` };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const TH = measuredHeight ?? ESTIMATED_TOOLTIP_H;
  let top, left, actual = placement;

  switch (placement) {
    case 'bottom':
      top = rect.bottom + PAD + GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      if (top + TH > vh - EDGE) { top = rect.top - PAD - GAP - TH; actual = 'top'; }
      break;
    case 'top':
      top = rect.top - PAD - GAP - TH;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      if (top < EDGE) { top = rect.bottom + PAD + GAP; actual = 'bottom'; }
      break;
    case 'right':
      top = rect.top + rect.height / 2 - TH / 2;
      left = rect.right + PAD + GAP;
      if (left + TOOLTIP_W > vw - EDGE) { left = rect.left - PAD - GAP - TOOLTIP_W; actual = 'left'; }
      break;
    case 'left':
      top = rect.top + rect.height / 2 - TH / 2;
      left = rect.left - PAD - GAP - TOOLTIP_W;
      if (left < EDGE) { left = rect.right + PAD + GAP; actual = 'right'; }
      break;
    default:
      top = rect.bottom + PAD + GAP;
      left = rect.left;
      actual = 'bottom';
  }

  // Clamp to viewport
  left = Math.max(EDGE, Math.min(left, vw - TOOLTIP_W - EDGE));
  top = Math.max(EDGE, Math.min(top, vh - TH - EDGE));

  // If tooltip still overlaps the spotlight, prefer top-right corner of viewport
  if (top > rect.top - PAD && top < rect.bottom + PAD && actual !== 'left' && actual !== 'right') {
    // Tooltip is inside the target zone vertically, shift to side
    if (rect.right + PAD + GAP + TOOLTIP_W < vw - EDGE) {
      left = rect.right + PAD + GAP;
      actual = 'right';
    } else {
      left = rect.left - PAD - GAP - TOOLTIP_W;
      actual = 'left';
    }
    top = Math.max(EDGE, Math.min(rect.top, vh - TH - EDGE));
  }

  return { position: 'fixed', top: `${top}px`, left: `${left}px`, width: `${TOOLTIP_W}px`, _actual: actual };
}

// --- Arrow ---

function Arrow({ placement }) {
  if (!placement || placement === 'center') return null;
  const s = 8;
  const base = { position: 'absolute', width: 0, height: 0, borderStyle: 'solid' };
  const c = 'rgba(24, 24, 27, 0.97)';
  const config = {
    bottom: { top: `-${s}px`, left: '50%', transform: 'translateX(-50%)', borderWidth: `0 ${s}px ${s}px ${s}px`, borderColor: `transparent transparent ${c} transparent` },
    top: { bottom: `-${s}px`, left: '50%', transform: 'translateX(-50%)', borderWidth: `${s}px ${s}px 0 ${s}px`, borderColor: `${c} transparent transparent transparent` },
    right: { left: `-${s}px`, top: '28px', borderWidth: `${s}px ${s}px ${s}px 0`, borderColor: `transparent ${c} transparent transparent` },
    left: { right: `-${s}px`, top: '28px', borderWidth: `${s}px 0 ${s}px ${s}px`, borderColor: `transparent transparent transparent ${c}` },
  };
  return <Box style={{ ...base, ...config[placement] }} />;
}

// --- Progress bar ---

function ProgressBar({ current, total }) {
  const pct = total > 0 ? ((current + 1) / total) * 100 : 0;
  return (
    <Box flex="1" maxW="120px" h="4px" bg="whiteAlpha.200" borderRadius="full" overflow="hidden">
      <Box
        h="100%"
        w={`${pct}%`}
        bgGradient="linear(to-r, amethyst.400, amethyst.500)"
        borderRadius="full"
        transition="width 0.3s ease"
      />
    </Box>
  );
}

// --- Main ---

export default function TourOverlay() {
  const { isActive, currentStep, currentStepDef, totalSteps, orgName, tourCtx, nextStep, prevStep, skipTour } = useTour();
  const isMobile = useBreakpointValue({ base: true, md: false });

  const selector = currentStepDef
    ? (isMobile && currentStepDef.mobileTarget) || currentStepDef.target
    : null;

  const { targetRect, targetElement } = useSpotlightTarget(selector, isActive);
  useTargetElevation(targetElement, !!currentStepDef?.forceInteraction);

  const noOverlay = !!currentStepDef?.noOverlay;

  // Keyboard navigation while the tour is active. Skip when:
  // - an input/textarea is focused (typing should not advance the tour)
  // - any non-tour modal is open (e.g. CreateProject modal — Esc should close
  //   the modal, not kill the tour). Chakra modals expose aria-modal="true";
  //   the tour tooltip uses role="dialog" without aria-modal so it is excluded.
  useEffect(() => {
    if (!isActive) return;
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const isContentEditable = document.activeElement?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || isContentEditable) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === 'Escape') { e.preventDefault(); skipTour(); }
      else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); nextStep(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prevStep(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, nextStep, prevStep, skipTour]);

  // Re-measure tooltip after first paint of each step so collision-aware
  // positioning uses the real height rather than the 230px estimate.
  const tooltipRef = useRef(null);
  const [measuredHeight, setMeasuredHeight] = useState(null);
  useIsomorphicLayoutEffect(() => {
    setMeasuredHeight(null); // reset for the new step
  }, [currentStep]);
  useIsomorphicLayoutEffect(() => {
    if (!tooltipRef.current) return;
    const h = tooltipRef.current.getBoundingClientRect().height;
    if (h > 0) {
      setMeasuredHeight((previousHeight) => previousHeight === h ? previousHeight : h);
    }
  }, [currentStep, currentStepDef, isActive, isMobile, targetRect]);

  // Move focus to the tooltip when the step changes so screen readers
  // announce the new content and keyboard Enter (handled above) acts on
  // the right context. Skip on mobile where the tooltip slides up from
  // the bottom and stealing focus would dismiss the on-screen keyboard.
  useEffect(() => {
    if (!isActive || isMobile) return;
    const t = setTimeout(() => tooltipRef.current?.focus?.(), 50);
    return () => clearTimeout(t);
  }, [currentStep, isActive, isMobile]);

  if (!isActive || !currentStepDef) return null;

  const isAction = !!currentStepDef.forceInteraction;
  const isLast = currentStep === totalSteps - 1;
  const isFirst = currentStep === 0;
  const StepIcon = currentStepDef.icon;
  const rawStyle = getTooltipStyle(targetRect, currentStepDef.placement, isMobile, measuredHeight);
  const { _actual, ...style } = rawStyle;
  const arrowPlacement = _actual || (targetRect ? currentStepDef.placement : null);

  const inviteLink = typeof window !== 'undefined' && orgName
    ? `${window.location.origin}/join?org=${encodeURIComponent(orgName)}`
    : '';

  return (
    <Portal>
      {/* Spotlight overlay — skip for noOverlay steps */}
      {!noOverlay && <Spotlight rect={targetRect} isActionStep={isAction} />}

      {/* Tooltip */}
      <Box
        ref={tooltipRef}
        key={currentStep}
        {...style}
        zIndex={10000}
        pointerEvents="auto"
        animation={`${fadeIn} 0.25s ease`}
        role="dialog"
        aria-label={`Tour step ${currentStep + 1} of ${totalSteps}: ${currentStepDef.title}`}
        tabIndex={-1}
        outline="none"
      >
        <Box position="relative">
          <Arrow placement={arrowPlacement} />
          <TooltipCard
            step={currentStepDef}
            stepIndex={currentStep}
            totalSteps={totalSteps}
            StepIcon={StepIcon}
            isFirst={isFirst}
            isLast={isLast}
            isAction={isAction}
            isMobile={isMobile}
            inviteLink={inviteLink}
            tourCtx={tourCtx}
            onNext={nextStep}
            onPrev={prevStep}
            onSkip={skipTour}
          />
        </Box>
      </Box>
    </Portal>
  );
}

function TooltipCard({ step, stepIndex, totalSteps, StepIcon, isFirst, isLast, isAction, isMobile, inviteLink, tourCtx, onNext, onPrev, onSkip }) {
  const { hasCopied, onCopy } = useClipboard(inviteLink);

  // Adaptive description for completion step
  // Must stay in step with the invite-link gate below (hasMemberRole) — promising a
  // link that does not render is how the old positional gate read to non-members.
  const description = step.id === 'complete'
    ? (tourCtx?.hasMemberRole
        ? 'You\'re all set. Share the invite link below to bring in members, then head to the task board or the voting page.'
        : tourCtx?.isAuthenticated
          ? 'You\'re all set. Head to the task board to find tasks to claim, or the voting page to take part in governance.'
          : 'Thanks for exploring. Connect your wallet to join this organization and start participating.')
    : step.description;

  return (
    <Box
      bg="rgba(24, 24, 27, 0.97)"
      borderRadius={isMobile ? '16px 16px 0 0' : '14px'}
      boxShadow="0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)"
      overflow="hidden"
      maxW={isMobile ? '100%' : `${TOOLTIP_W}px`}
    >
      {/* Accent bar */}
      <Box h="3px" bgGradient="linear(to-r, amethyst.400, coral.400)" />

      {/* Header */}
      <HStack px={4} py={2} justify="space-between">
        <HStack spacing={2}>
          <Box
            w="26px" h="26px"
            borderRadius="md"
            bgGradient="linear(to-br, amethyst.400, amethyst.600)"
            display="flex" alignItems="center" justifyContent="center"
          >
            <Icon as={StepIcon} boxSize="14px" color="white" />
          </Box>
          <Text fontSize="11px" fontWeight="600" color="whiteAlpha.400" textTransform="uppercase" letterSpacing="0.08em">
            {stepIndex + 1} / {totalSteps}
          </Text>
        </HStack>
        <IconButton
          icon={<CloseIcon boxSize="8px" />}
          size="xs"
          variant="ghost"
          color="whiteAlpha.300"
          _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
          onClick={onSkip}
          aria-label="Skip tour"
          minW="24px" h="24px"
        />
      </HStack>

      {/* Body */}
      <VStack spacing={2} px={4} pb={3} align="start">
        <Text fontSize="md" fontWeight="700" color="white" lineHeight="short">
          {step.title}
        </Text>
        <Text fontSize="13px" color="whiteAlpha.700" lineHeight="1.6">
          {description}
        </Text>

        {/* Invite link on completion. A /join URL is public and confers no on-chain
            authority, so there is no contract-side notion of who may share it —
            gating it on a positional hat hid it from every member of some orgs. */}
        {isLast && inviteLink && tourCtx?.hasMemberRole && (
          <InputGroup size="sm" mt={1}>
            <Input
              value={inviteLink}
              isReadOnly
              borderRadius="lg"
              fontSize="xs"
              color="whiteAlpha.600"
              bg="whiteAlpha.50"
              border="1px solid"
              borderColor="whiteAlpha.100"
              pr="3rem"
            />
            <InputRightElement w="3rem">
              <IconButton
                icon={hasCopied ? <CheckIcon /> : <CopyIcon />}
                size="xs"
                variant="ghost"
                color={hasCopied ? 'green.400' : 'whiteAlpha.400'}
                onClick={onCopy}
                aria-label="Copy invite link"
              />
            </InputRightElement>
          </InputGroup>
        )}

        {/* Join button for non-authenticated visitors */}
        {(step.id === 'join-prompt' || (isLast && !tourCtx?.isAuthenticated)) && inviteLink && (
          <Button
            as="a"
            href={inviteLink}
            size="sm"
            bg="amethyst.500"
            color="white"
            _hover={{ bg: 'amethyst.400' }}
            borderRadius="lg"
            fontWeight="600"
            w="100%"
            mt={1}
          >
            Join Organization
          </Button>
        )}
      </VStack>

      {/* Footer */}
      <HStack px={4} pb={3} justify="space-between" align="center">
        <ProgressBar current={stepIndex} total={totalSteps} />
        <HStack spacing={1}>
          {!isFirst && (
            <Button size="xs" variant="ghost" color="whiteAlpha.500" _hover={{ color: 'white', bg: 'whiteAlpha.100' }} onClick={onPrev} fontWeight="500">
              Back
            </Button>
          )}
          {isLast ? (
            <Button size="xs" bg="amethyst.500" color="white" _hover={{ bg: 'amethyst.400' }} onClick={onNext} fontWeight="600" px={3}>
              Finish
            </Button>
          ) : isAction ? (
            <HStack spacing={2}>
              <HStack spacing={1.5} pr={1}>
                <Box w="6px" h="6px" borderRadius="full" bg="amethyst.400" animation={`${pulse} 1.4s ease-in-out infinite`} />
                <Text fontSize="11px" color="amethyst.400" fontWeight="600">
                  {step.ctaText}
                </Text>
              </HStack>
              <Button size="xs" variant="ghost" color="whiteAlpha.500" _hover={{ color: 'white', bg: 'whiteAlpha.100' }} onClick={onNext} fontWeight="500">
                Skip step
              </Button>
            </HStack>
          ) : (
            <Button size="xs" bg="amethyst.500" color="white" _hover={{ bg: 'amethyst.400' }} onClick={onNext} fontWeight="600" px={3}>
              Next
            </Button>
          )}
        </HStack>
      </HStack>
    </Box>
  );
}
