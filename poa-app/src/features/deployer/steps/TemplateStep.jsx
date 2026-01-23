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
  Badge,
  Button,
  Icon,
  useColorModeValue,
  Flex,
  List,
  ListItem,
  ListIcon,
  Collapse,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Alert,
  AlertIcon,
  Divider,
  Tooltip,
} from '@chakra-ui/react';
import {
  ArrowForwardIcon,
  InfoIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@chakra-ui/icons';
import { PiCheck, PiArrowRight } from 'react-icons/pi';
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

/**
 * Visual bar showing democracy/participation voting split
 */
function VotingBalanceBar({ democracy, participation }) {
  const democracyBg = useColorModeValue('blue.400', 'blue.500');
  const participationBg = useColorModeValue('orange.400', 'orange.500');
  const labelColor = useColorModeValue('gray.600', 'gray.400');

  return (
    <Box my={4}>
      {/* Visual bar */}
      <Box
        h="44px"
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

      {/* Legend */}
      <HStack justify="space-between" mt={2} px={1}>
        <HStack spacing={2}>
          <Box w="10px" h="10px" borderRadius="full" bg={democracyBg} />
          <Text fontSize="xs" color={labelColor}>Equal voice</Text>
        </HStack>
        <HStack spacing={2}>
          <Box w="10px" h="10px" borderRadius="full" bg={participationBg} />
          <Text fontSize="xs" color={labelColor}>Earned influence</Text>
        </HStack>
      </HStack>
    </Box>
  );
}

/**
 * Quick feature strip showing 3 key features as icons
 */
function QuickFeatureStrip({ features }) {
  const iconBg = useColorModeValue('gray.100', 'gray.700');
  const labelColor = useColorModeValue('gray.600', 'gray.400');
  const moreBg = useColorModeValue('gray.50', 'gray.800');

  if (!features || features.length === 0) return null;

  const displayFeatures = features.slice(0, 3);
  const remainingCount = Math.max(0, features.length - 3);

  return (
    <HStack spacing={4} justify="center" py={4}>
      {displayFeatures.map((feature, i) => (
        <Tooltip key={i} label={feature.name} hasArrow placement="top">
          <VStack spacing={1} cursor="default">
            <Box
              bg={iconBg}
              p={3}
              borderRadius="lg"
              fontSize="xl"
            >
              {feature.icon}
            </Box>
            <Text fontSize="xs" color={labelColor} noOfLines={1} maxW="60px" textAlign="center">
              {feature.name.split(' ')[0]}
            </Text>
          </VStack>
        </Tooltip>
      ))}
      {remainingCount > 0 && (
        <VStack spacing={1}>
          <Box bg={moreBg} p={3} borderRadius="lg">
            <Text fontSize="sm" color={labelColor} fontWeight="500">+{remainingCount}</Text>
          </Box>
          <Text fontSize="xs" color={labelColor}>more</Text>
        </VStack>
      )}
    </HStack>
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
 * Capabilities showcase component
 */
function CapabilitiesSection({ template }) {
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const helperColor = useColorModeValue('gray.600', 'gray.400');
  const featureBg = useColorModeValue('gray.50', 'gray.700');

  if (!template?.capabilities?.features) return null;

  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={borderColor}>
      <CardBody>
        <VStack spacing={4} align="stretch">
          <Box>
            <Heading size="sm" mb={1}>What You Can Do</Heading>
            <Text fontSize="sm" color={helperColor}>
              {template.capabilities.headline}
            </Text>
          </Box>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
            {template.capabilities.features.map((feature, i) => (
              <Box
                key={i}
                bg={featureBg}
                p={3}
                borderRadius="md"
              >
                <HStack spacing={2} mb={1}>
                  <Text fontSize="lg">{feature.icon}</Text>
                  <Text fontWeight="medium" fontSize="sm">{feature.name}</Text>
                </HStack>
                <Text fontSize="xs" color={helperColor}>
                  {feature.description}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
        </VStack>
      </CardBody>
    </Card>
  );
}

/**
 * Hybrid voting explainer component
 */
function HybridVotingExplainer({ template }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const helperColor = useColorModeValue('gray.600', 'gray.400');
  const highlightBg = useColorModeValue('green.50', 'green.900');

  const whatItMeans = template?.philosophy?.whatHybridVotingMeans;
  const democracyWeight = template?.defaults?.voting?.democracyWeight;
  const participationWeight = template?.defaults?.voting?.participationWeight;

  if (!whatItMeans && democracyWeight === undefined) return null;

  return (
    <Card bg={cardBg} borderWidth="1px" borderColor={borderColor}>
      <CardBody>
        <VStack spacing={4} align="stretch">
          <HStack justify="space-between">
            <Box>
              <HStack spacing={2}>
                <Text fontSize="lg">⚖️</Text>
                <Heading size="sm">How Voting Works</Heading>
              </HStack>
              {democracyWeight !== undefined && (
                <HStack spacing={2} mt={1}>
                  <Badge colorScheme="blue" fontSize="xs">
                    {democracyWeight}% Democracy
                  </Badge>
                  <Badge colorScheme="orange" fontSize="xs">
                    {participationWeight}% Participation
                  </Badge>
                </HStack>
              )}
            </Box>
            <Button
              size="sm"
              variant="ghost"
              rightIcon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Less' : 'Learn more'}
            </Button>
          </HStack>

          <Collapse in={isExpanded} animateOpacity>
            <Box bg={highlightBg} p={4} borderRadius="md">
              <Text fontSize="sm" whiteSpace="pre-line">
                {whatItMeans}
              </Text>
            </Box>
          </Collapse>
        </VStack>
      </CardBody>
    </Card>
  );
}

/**
 * Template Detail Panel - Summary card + optional tabbed deep-dive
 * Redesigned for scannability with progressive disclosure
 */
function TemplateDetailPanel({ template, onContinue, onBack }) {
  const [showDetails, setShowDetails] = useState(false);
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const helperColor = useColorModeValue('gray.600', 'gray.400');
  const quoteBg = useColorModeValue('blue.50', 'blue.900');
  const featureBg = useColorModeValue('gray.50', 'gray.700');
  const highlightBg = useColorModeValue('green.50', 'green.900');
  const summaryBg = useColorModeValue('rgba(255, 255, 255, 0.8)', 'rgba(51, 48, 44, 0.8)');

  // Get voting weights from template defaults
  const democracyWeight = template?.defaults?.voting?.democracyWeight ?? 80;
  const participationWeight = template?.defaults?.voting?.participationWeight ?? 20;

  if (!template) {
    return (
      <VStack spacing={4}>
        <Text color={helperColor}>No template selected.</Text>
        <Button bg="coral.500" color="white" _hover={{ bg: 'coral.600' }} onClick={onBack}>
          Back to Templates
        </Button>
      </VStack>
    );
  }

  const { essence, keyPrinciple, historicalContext, whatHybridVotingMeans } = template.philosophy || {};
  const features = template.capabilities?.features || [];

  // Get first sentence of essence for excerpt
  const essenceExcerpt = essence ? essence.split('.')[0] + '.' : template.tagline;

  return (
    <VStack spacing={6} align="stretch" maxW="650px" mx="auto">
      {/* Back Button */}
      <Button
        variant="ghost"
        leftIcon={<ChevronUpIcon />}
        onClick={onBack}
        alignSelf="flex-start"
        size="sm"
      >
        Back to Templates
      </Button>

      {/* Summary Card */}
      <Card
        bg={summaryBg}
        backdropFilter="blur(10px)"
        borderWidth="1px"
        borderColor={borderColor}
        overflow="hidden"
        position="relative"
      >
        {/* Visual voting bar at top of card */}
        <Box h="6px" w="100%" overflow="hidden">
          <Flex>
            <Box w={`${democracyWeight}%`} bg="blue.400" h="6px" />
            <Box w={`${participationWeight}%`} bg="orange.400" h="6px" />
          </Flex>
        </Box>

        <CardBody pt={5}>
          <VStack spacing={4} align="stretch">
            {/* Template Header */}
            <HStack spacing={4}>
              <Box
                fontSize="3xl"
                bg={useColorModeValue('gray.100', 'gray.700')}
                p={3}
                borderRadius="xl"
              >
                {template.icon}
              </Box>
              <Box flex={1}>
                <Heading size="lg" color={useColorModeValue('gray.800', 'white')}>
                  {template.name}
                </Heading>
                <Text color={helperColor} fontSize="sm">
                  {template.tagline}
                </Text>
              </Box>
            </HStack>

            {/* Voting Balance Visual */}
            <VotingBalanceBar
              democracy={democracyWeight}
              participation={participationWeight}
            />

            {/* Quick Feature Strip */}
            <QuickFeatureStrip features={features} />

            {/* Essence Excerpt */}
            <Text fontSize="sm" color={helperColor} lineHeight="tall" px={1}>
              {essenceExcerpt}
            </Text>
          </VStack>
        </CardBody>
      </Card>

      {/* Optional Deep-Dive Tabs */}
      <Box>
        <Button
          variant="ghost"
          size="sm"
          rightIcon={showDetails ? <ChevronUpIcon /> : <ChevronDownIcon />}
          onClick={() => setShowDetails(!showDetails)}
          w="100%"
          color={helperColor}
          fontWeight="normal"
        >
          {showDetails ? 'Show less' : 'Learn more about this model'}
        </Button>

        <Collapse in={showDetails} animateOpacity>
          <Box mt={4}>
            <Tabs variant="soft-rounded" colorScheme="gray" size="sm">
              <TabList justifyContent="center" mb={4}>
                <Tab>Features</Tab>
                <Tab>Voting</Tab>
                <Tab>Philosophy</Tab>
              </TabList>

              <TabPanels>
                {/* Features Tab */}
                <TabPanel px={0}>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    {features.map((feature, i) => (
                      <Box
                        key={i}
                        bg={featureBg}
                        p={3}
                        borderRadius="md"
                      >
                        <HStack spacing={2} mb={1}>
                          <Text fontSize="lg">{feature.icon}</Text>
                          <Text fontWeight="medium" fontSize="sm">{feature.name}</Text>
                        </HStack>
                        <Text fontSize="xs" color={helperColor}>
                          {feature.description}
                        </Text>
                      </Box>
                    ))}
                  </SimpleGrid>
                </TabPanel>

                {/* Voting Tab */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <Box bg={highlightBg} p={4} borderRadius="md">
                      <Text fontSize="sm" whiteSpace="pre-line">
                        {whatHybridVotingMeans || `This template uses a ${democracyWeight}/${participationWeight} hybrid voting system where ${democracyWeight}% of voting power comes from equal membership and ${participationWeight}% from participation tokens earned through contributions.`}
                      </Text>
                    </Box>
                  </VStack>
                </TabPanel>

                {/* Philosophy Tab */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    {essence && (
                      <Text whiteSpace="pre-line" fontSize="sm">{essence}</Text>
                    )}

                    {keyPrinciple && (
                      <Box bg={quoteBg} p={4} borderRadius="md" borderLeftWidth="3px" borderLeftColor="blue.500">
                        <Text fontWeight="medium" fontSize="sm" mb={1}>Key Insight</Text>
                        <Text fontStyle="italic" fontSize="sm">{keyPrinciple}</Text>
                      </Box>
                    )}

                    {historicalContext && (
                      <Box>
                        <Text fontWeight="medium" fontSize="sm" mb={1} color={helperColor}>
                          Historical Context
                        </Text>
                        <Text fontSize="sm" color={helperColor}>
                          {historicalContext}
                        </Text>
                      </Box>
                    )}
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Box>
        </Collapse>
      </Box>

      {/* Action Footer - Always Visible */}
      <HStack justify="space-between" pt={2}>
        <Text fontSize="sm" color={helperColor}>
          {template.discoveryQuestions?.length > 0
            ? `${template.discoveryQuestions.length} quick questions to personalize`
            : 'Ready to customize'}
        </Text>
        <Button
          bg="coral.500"
          color="white"
          _hover={{ bg: 'coral.600', transform: 'translateY(-1px)' }}
          size="lg"
          rightIcon={<Icon as={PiArrowRight} />}
          onClick={onContinue}
          px={6}
        >
          {template.discoveryQuestions?.length > 0 ? 'Get Started' : 'Continue'}
        </Button>
      </HStack>
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
  const previewBg = useColorModeValue('gray.50', 'gray.800');

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
