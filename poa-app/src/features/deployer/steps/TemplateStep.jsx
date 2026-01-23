/**
 * TemplateStep - Rich template selection and discovery flow
 *
 * The first step in the new deployer flow. Users choose from curated templates,
 * answer discovery questions to personalize settings, and learn about the
 * governance philosophy behind their choice.
 *
 * Flow:
 * 1. Template Gallery - Choose your organization type
 * 2. Philosophy Overview - Learn why this governance model works
 * 3. Discovery Questions - Personalize settings for your context
 * 4. Growth Path Preview - See how governance evolves
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  SimpleGrid,
  Card,
  CardBody,
  Button,
  Icon,
  useColorModeValue,
  Flex,
  Collapse,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import { ChevronUpIcon } from '@chakra-ui/icons';
import {
  PiCheck,
  PiArrowRight,
  PiUsersThree,
  PiCoins,
  PiEye,
  PiGitMerge,
  PiPath,
  PiHandshake,
  PiPalette,
  PiSparkle,
  PiMegaphone,
  PiUsers,
  PiGlobe,
  PiChalkboardTeacher,
  PiTrophy,
  PiSliders,
  PiPuzzlePiece,
  PiWrench,
  PiGear,
  PiBookOpen,
} from 'react-icons/pi';
import { useDeployer } from '../context/DeployerContext';
import {
  RICH_TEMPLATE_LIST as TEMPLATE_LIST,
  getRichTemplateById as getTemplateById,
} from '../templates';
import { DiscoveryQuestions, GrowthPathVisualizer } from '../components/governance';

// View states for the template step
const VIEWS = {
  GALLERY: 'gallery',
  PHILOSOPHY: 'philosophy',
  DISCOVERY: 'discovery',
  PREVIEW: 'preview',
};

// Icon mapping for benefit cards (Phosphor Icons)
const ICON_MAP = {
  UsersThree: PiUsersThree,
  Coins: PiCoins,
  Eye: PiEye,
  GitMerge: PiGitMerge,
  Path: PiPath,
  Handshake: PiHandshake,
  Palette: PiPalette,
  Sparkle: PiSparkle,
  Megaphone: PiMegaphone,
  Users: PiUsers,
  Globe: PiGlobe,
  Chalkboard: PiChalkboardTeacher,
  Trophy: PiTrophy,
  Sliders: PiSliders,
  PuzzlePiece: PiPuzzlePiece,
  Wrench: PiWrench,
  Gear: PiGear,
  BookOpen: PiBookOpen,
};

/**
 * Benefit cards showing 3 key benefits with icons
 */
function BenefitCards({ benefits }) {
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const titleColor = useColorModeValue('gray.800', 'white');
  const outcomeColor = useColorModeValue('gray.600', 'gray.400');
  const iconColor = useColorModeValue('coral.500', 'coral.400');

  if (!benefits || benefits.length === 0) return null;

  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
      {benefits.map((benefit, i) => {
        const IconComponent = ICON_MAP[benefit.iconName] || PiCheck;
        return (
          <Box
            key={i}
            bg={cardBg}
            p={5}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={borderColor}
            textAlign="center"
          >
            <Icon
              as={IconComponent}
              boxSize={8}
              color={iconColor}
              mb={3}
            />
            <Text fontWeight="600" fontSize="md" color={titleColor} mb={1}>
              {benefit.title}
            </Text>
            <Text fontSize="sm" color={outcomeColor}>
              {benefit.outcome}
            </Text>
          </Box>
        );
      })}
    </SimpleGrid>
  );
}

/**
 * Social proof banner showing real-world credibility
 */
function SocialProof({ text }) {
  const bg = useColorModeValue('gray.50', 'gray.800');
  const textColor = useColorModeValue('gray.600', 'gray.400');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  if (!text) return null;

  return (
    <Box
      bg={bg}
      py={3}
      px={4}
      borderRadius="md"
      borderWidth="1px"
      borderColor={borderColor}
      textAlign="center"
    >
      <Text fontSize="sm" color={textColor} fontStyle="italic">
        {text}
      </Text>
    </Box>
  );
}

/**
 * Visual bar showing democracy/participation voting split (for governance details)
 */
function VotingBalanceBar({ democracy, participation }) {
  const democracyBg = useColorModeValue('blue.400', 'blue.500');
  const participationBg = useColorModeValue('orange.400', 'orange.500');
  const labelColor = useColorModeValue('gray.600', 'gray.400');

  return (
    <Box my={4}>
      <Box
        h="36px"
        borderRadius="full"
        overflow="hidden"
        display="flex"
        bg={useColorModeValue('gray.100', 'gray.700')}
      >
        <Flex
          w={`${democracy}%`}
          bg={democracyBg}
          align="center"
          justify="center"
          color="white"
          transition="width 0.3s ease"
        >
          <Text fontWeight="600" fontSize="sm">{democracy}%</Text>
        </Flex>
        <Flex
          w={`${participation}%`}
          bg={participationBg}
          align="center"
          justify="center"
          color="white"
          transition="width 0.3s ease"
        >
          <Text fontWeight="600" fontSize="sm">{participation}%</Text>
        </Flex>
      </Box>
      <HStack justify="space-between" mt={2} px={1}>
        <HStack spacing={2}>
          <Box w="8px" h="8px" borderRadius="full" bg={democracyBg} />
          <Text fontSize="xs" color={labelColor}>Equal voice</Text>
        </HStack>
        <HStack spacing={2}>
          <Box w="8px" h="8px" borderRadius="full" bg={participationBg} />
          <Text fontSize="xs" color={labelColor}>Earned influence</Text>
        </HStack>
      </HStack>
    </Box>
  );
}

/**
 * Template card in the gallery - cleaner, centered design
 */
function TemplateCard({ template, isSelected, onSelect }) {
  const borderColor = useColorModeValue('warmGray.200', 'warmGray.600');
  const selectedBorderColor = useColorModeValue('coral.500', 'coral.400');
  const hoverBorderColor = useColorModeValue('coral.300', 'coral.500');
  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.7)', 'rgba(51, 48, 44, 0.7)');
  const selectedBg = useColorModeValue('coral.50', 'rgba(240, 101, 67, 0.1)');
  const helperColor = useColorModeValue('warmGray.500', 'warmGray.400');
  const iconBg = useColorModeValue('warmGray.100', 'warmGray.700');

  const icon = template.icon || '📋';

  return (
    <Card
      cursor="pointer"
      onClick={() => onSelect(template.id)}
      borderWidth="2px"
      borderColor={isSelected ? selectedBorderColor : borderColor}
      bg={isSelected ? selectedBg : cardBg}
      backdropFilter="blur(8px)"
      _hover={{
        borderColor: isSelected ? selectedBorderColor : hoverBorderColor,
        transform: 'translateY(-2px)',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
      }}
      transition="all 0.2s ease"
      h="100%"
      position="relative"
      overflow="hidden"
    >
      {/* Selected indicator bar */}
      {isSelected && (
        <Box
          position="absolute"
          top="0"
          left="0"
          right="0"
          h="3px"
          bg="coral.500"
        />
      )}

      <CardBody py={6}>
        <VStack spacing={4}>
          {/* Centered Icon */}
          <Box
            bg={iconBg}
            w="56px"
            h="56px"
            borderRadius="xl"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="2xl">{icon}</Text>
          </Box>

          {/* Title & Tagline - Centered */}
          <Box textAlign="center">
            <Heading size="sm" mb={2} color={isSelected ? 'coral.700' : 'warmGray.800'}>
              {template.name}
            </Heading>
            <Text fontSize="sm" color={helperColor} lineHeight="tall">
              {template.tagline}
            </Text>
          </Box>

          {/* Selected check */}
          {isSelected && (
            <Box
              position="absolute"
              top={3}
              right={3}
              bg="coral.500"
              borderRadius="full"
              w="24px"
              h="24px"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Icon as={PiCheck} color="white" boxSize={3} />
            </Box>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
}

/**
 * Template Detail Panel - "Invitation" design
 * Leads with aspiration, not mechanism
 */
function TemplateDetailPanel({ template, onContinue, onBack }) {
  const [showVoting, setShowVoting] = useState(false);
  const [showPhilosophy, setShowPhilosophy] = useState(false);

  const headingColor = useColorModeValue('gray.800', 'white');
  const subheadingColor = useColorModeValue('gray.600', 'gray.400');
  const taglineBg = useColorModeValue('gray.50', 'gray.800');
  const taglineBorder = useColorModeValue('gray.200', 'gray.600');
  const linkColor = useColorModeValue('gray.500', 'gray.400');
  const linkHoverColor = useColorModeValue('coral.500', 'coral.400');
  const detailsBg = useColorModeValue('gray.50', 'gray.800');
  const quoteBg = useColorModeValue('blue.50', 'blue.900');

  // Get voting weights from template defaults
  const democracyWeight = template?.defaults?.voting?.democracyWeight ?? 80;
  const participationWeight = template?.defaults?.voting?.participationWeight ?? 20;

  if (!template) {
    return (
      <VStack spacing={4}>
        <Text color={subheadingColor}>No template selected.</Text>
        <Button bg="coral.500" color="white" _hover={{ bg: 'coral.600' }} onClick={onBack}>
          Back to Templates
        </Button>
      </VStack>
    );
  }

  const { essence, keyPrinciple, historicalContext, whatHybridVotingMeans } = template.philosophy || {};
  const heroTagline = template.heroTagline || [];
  const benefits = template.benefits || [];
  const socialProof = template.socialProof;

  return (
    <VStack spacing={8} align="stretch" maxW="700px" mx="auto">
      {/* Back Button */}
      <Button
        variant="ghost"
        leftIcon={<ChevronUpIcon />}
        onClick={onBack}
        alignSelf="flex-start"
        size="sm"
        color={subheadingColor}
      >
        Back to Templates
      </Button>

      {/* Template Header */}
      <VStack spacing={2} textAlign="center">
        <Heading size="xl" color={headingColor}>
          {template.name}
        </Heading>
        <Text color={subheadingColor} fontSize="md">
          {template.tagline}
        </Text>
      </VStack>

      {/* Hero Tagline */}
      {heroTagline.length > 0 && (
        <Box
          bg={taglineBg}
          py={8}
          px={6}
          borderRadius="xl"
          borderWidth="1px"
          borderColor={taglineBorder}
          textAlign="center"
        >
          <VStack spacing={1}>
            {heroTagline.map((line, i) => (
              <Text
                key={i}
                fontSize="2xl"
                fontWeight="500"
                color={headingColor}
                lineHeight="tall"
              >
                {line}
              </Text>
            ))}
          </VStack>
        </Box>
      )}

      {/* Benefit Cards */}
      <BenefitCards benefits={benefits} />

      {/* Social Proof */}
      <SocialProof text={socialProof} />

      {/* Primary CTA */}
      <Box textAlign="center" pt={2}>
        <Button
          bg="coral.500"
          color="white"
          _hover={{ bg: 'coral.600', transform: 'translateY(-1px)' }}
          size="lg"
          rightIcon={<Icon as={PiArrowRight} />}
          onClick={onContinue}
          px={8}
          py={6}
          fontSize="md"
        >
          Customize This Model
        </Button>
      </Box>

      {/* Optional Details Links */}
      <HStack justify="center" spacing={6} pt={2}>
        <Button
          variant="link"
          size="sm"
          color={linkColor}
          _hover={{ color: linkHoverColor }}
          leftIcon={<Icon as={PiGear} />}
          onClick={() => setShowVoting(!showVoting)}
        >
          How voting works
        </Button>
        <Text color={subheadingColor}>·</Text>
        <Button
          variant="link"
          size="sm"
          color={linkColor}
          _hover={{ color: linkHoverColor }}
          leftIcon={<Icon as={PiBookOpen} />}
          onClick={() => setShowPhilosophy(!showPhilosophy)}
        >
          The philosophy
        </Button>
      </HStack>

      {/* Voting Details Collapse */}
      <Collapse in={showVoting} animateOpacity>
        <Box bg={detailsBg} p={5} borderRadius="lg" mt={2}>
          <VStack spacing={4} align="stretch">
            <Heading size="sm" color={headingColor}>How Voting Works</Heading>
            <VotingBalanceBar
              democracy={democracyWeight}
              participation={participationWeight}
            />
            {whatHybridVotingMeans && (
              <Text fontSize="sm" color={subheadingColor} whiteSpace="pre-line">
                {whatHybridVotingMeans}
              </Text>
            )}
          </VStack>
        </Box>
      </Collapse>

      {/* Philosophy Details Collapse */}
      <Collapse in={showPhilosophy} animateOpacity>
        <Box bg={detailsBg} p={5} borderRadius="lg" mt={2}>
          <VStack spacing={4} align="stretch">
            <Heading size="sm" color={headingColor}>The Philosophy</Heading>
            {essence && (
              <Text fontSize="sm" color={subheadingColor} whiteSpace="pre-line">
                {essence}
              </Text>
            )}
            {keyPrinciple && (
              <Box bg={quoteBg} p={4} borderRadius="md" borderLeftWidth="3px" borderLeftColor="blue.500">
                <Text fontWeight="medium" fontSize="sm" mb={1}>Key Insight</Text>
                <Text fontStyle="italic" fontSize="sm">{keyPrinciple}</Text>
              </Box>
            )}
            {historicalContext && (
              <Box>
                <Text fontWeight="medium" fontSize="sm" mb={1} color={subheadingColor}>
                  Historical Context
                </Text>
                <Text fontSize="sm" color={subheadingColor}>
                  {historicalContext}
                </Text>
              </Box>
            )}
          </VStack>
        </Box>
      </Collapse>
    </VStack>
  );
}

// Keep PhilosophyPanel as alias for backward compatibility
const PhilosophyPanel = TemplateDetailPanel;

/**
 * Growth path preview in a modal
 */
function GrowthPathModal({ template, isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack spacing={2}>
            <Text>{template?.icon}</Text>
            <Text>Growth Path: {template?.name}</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {template && <GrowthPathVisualizer template={template} />}
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose}>Close</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * Main TemplateStep component
 */
export function TemplateStep() {
  const { state, actions, selectors } = useDeployer();
  const [currentView, setCurrentView] = useState(VIEWS.GALLERY);
  const [detailTemplate, setDetailTemplate] = useState(null);

  const {
    isOpen: isGrowthPathOpen,
    onOpen: openGrowthPath,
    onClose: closeGrowthPath,
  } = useDisclosure();

  const selectedTemplateId = state.ui.selectedTemplate;
  const selectedTemplate = useMemo(
    () => selectedTemplateId ? getTemplateById(selectedTemplateId) : null,
    [selectedTemplateId]
  );

  const headingColor = useColorModeValue('gray.800', 'white');
  const subheadingColor = useColorModeValue('gray.600', 'gray.400');

  // Handle template selection
  const handleSelectTemplate = (templateId) => {
    actions.selectTemplate(templateId);
    actions.resetTemplateJourney();
  };

  // Handle learn more click
  const handleLearnMore = (template) => {
    setDetailTemplate(template);
    actions.selectTemplate(template.id);
    setCurrentView(VIEWS.PHILOSOPHY);
  };

  // Handle continue from philosophy view
  const handleContinueFromPhilosophy = () => {
    if (selectedTemplate?.discoveryQuestions?.length > 0) {
      setCurrentView(VIEWS.DISCOVERY);
    } else {
      handleFinishTemplateStep();
    }
  };

  // Handle discovery completion
  const handleDiscoveryComplete = () => {
    handleFinishTemplateStep();
  };

  // Handle skip discovery
  const handleSkipDiscovery = () => {
    handleFinishTemplateStep();
  };

  // Finish template step and move to next
  const handleFinishTemplateStep = () => {
    if (selectedTemplateId) {
      // Apply base template first
      actions.applyTemplate(selectedTemplateId);

      // Re-apply variation if one was confirmed (to restore variation settings)
      // This fixes the bug where applyTemplate() would overwrite variation settings
      if (state.templateJourney.variationConfirmed && state.templateJourney.matchedVariation) {
        const template = getTemplateById(selectedTemplateId);
        const variation = template?.variations?.[state.templateJourney.matchedVariation];
        if (variation) {
          actions.applyVariation(variation, template);
        }
      }

      actions.nextStep();
    }
  };

  // Handle back to gallery
  const handleBackToGallery = () => {
    setCurrentView(VIEWS.GALLERY);
    setDetailTemplate(null);
  };

  // Quick continue from gallery
  const handleQuickContinue = () => {
    if (selectedTemplate?.discoveryQuestions?.length > 0 ||
        selectedTemplate?.philosophy) {
      setCurrentView(VIEWS.PHILOSOPHY);
    } else {
      handleFinishTemplateStep();
    }
  };

  // Render based on current view
  const renderView = () => {
    switch (currentView) {
      case VIEWS.PHILOSOPHY:
        return (
          <PhilosophyPanel
            template={selectedTemplate}
            onContinue={handleContinueFromPhilosophy}
            onBack={handleBackToGallery}
          />
        );

      case VIEWS.DISCOVERY:
        return (
          <VStack spacing={6} align="stretch">
            <Button
              variant="ghost"
              leftIcon={<ChevronUpIcon />}
              onClick={() => setCurrentView(VIEWS.PHILOSOPHY)}
              alignSelf="flex-start"
            >
              Back to Philosophy
            </Button>

            <HStack spacing={3}>
              <Text fontSize="2xl">{selectedTemplate?.icon}</Text>
              <Box>
                <Heading size="md">{selectedTemplate?.name}</Heading>
                <Text color={subheadingColor}>Tell us about your organization</Text>
              </Box>
            </HStack>

            <DiscoveryQuestions
              template={selectedTemplate}
              onComplete={handleDiscoveryComplete}
              onSkip={handleSkipDiscovery}
            />

            {/* Growth Path Preview Link */}
            {selectedTemplate?.growthPath?.stages?.length > 0 && (
              <Box textAlign="center" pt={4}>
                <Button
                  variant="link"
                  colorScheme="blue"
                  onClick={openGrowthPath}
                >
                  See how governance evolves over time
                </Button>
              </Box>
            )}
          </VStack>
        );

      case VIEWS.GALLERY:
      default:
        return (
          <VStack spacing={10} align="stretch">
            {/* Header */}
            <Box textAlign="center" mb={2}>
              <Heading size="lg" color={headingColor} mb={3}>
                What kind of organization will you create together?
              </Heading>
              <Text color={subheadingColor} maxW="600px" mx="auto" fontSize="md" lineHeight="tall">
                Every community is different. These templates give you a starting point
                that matches how your group already works, then grows with you.
              </Text>
            </Box>

            {/* Template Grid */}
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={5}>
              {TEMPLATE_LIST.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplateId === template.id}
                  onSelect={handleSelectTemplate}
                />
              ))}
            </SimpleGrid>

            {/* Selected Template Preview - Cleaner design */}
            {selectedTemplate && (
              <Box
                bg="rgba(255, 255, 255, 0.6)"
                backdropFilter="blur(10px)"
                p={6}
                borderRadius="xl"
                border="1px solid"
                borderColor="rgba(255, 255, 255, 0.18)"
                mt={2}
              >
                <Flex
                  direction={{ base: 'column', md: 'row' }}
                  justify="space-between"
                  align={{ base: 'stretch', md: 'center' }}
                  gap={4}
                >
                  <Box flex={1}>
                    <HStack spacing={3} mb={2}>
                      <Text fontSize="2xl">{selectedTemplate.icon}</Text>
                      <Text fontWeight="600" fontSize="lg" color="warmGray.800">
                        {selectedTemplate.name}
                      </Text>
                    </HStack>
                    <Text fontSize="sm" color={subheadingColor} noOfLines={2}>
                      {selectedTemplate.philosophy?.essence?.split('.')[0]}.
                    </Text>
                  </Box>

                  <HStack spacing={3}>
                    {selectedTemplate.growthPath?.stages?.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        borderColor="warmGray.300"
                        color="warmGray.700"
                        _hover={{ bg: 'warmGray.100' }}
                        onClick={openGrowthPath}
                      >
                        View Growth Path
                      </Button>
                    )}
                    <Button
                      bg="coral.500"
                      color="white"
                      _hover={{ bg: 'coral.600', transform: 'translateY(-1px)' }}
                      rightIcon={<Icon as={PiArrowRight} />}
                      onClick={handleQuickContinue}
                      size="lg"
                      px={6}
                    >
                      Get Started
                    </Button>
                  </HStack>
                </Flex>
              </Box>
            )}
          </VStack>
        );
    }
  };

  return (
    <>
      {renderView()}

      {/* Growth Path Modal */}
      <GrowthPathModal
        template={selectedTemplate}
        isOpen={isGrowthPathOpen}
        onClose={closeGrowthPath}
      />
    </>
  );
}

export default TemplateStep;
