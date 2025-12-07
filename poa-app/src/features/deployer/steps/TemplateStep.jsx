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
} from '@chakra-ui/react';
import {
  CheckCircleIcon,
  ArrowForwardIcon,
  InfoIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@chakra-ui/icons';
import { useDeployer } from '../context/DeployerContext';
import {
  RICH_TEMPLATE_LIST as TEMPLATE_LIST,
  getRichTemplateById as getTemplateById,
} from '../templates';
import { DiscoveryQuestions, GrowthPathVisualizer } from '../components/governance';
import NavigationButtons from '../components/common/NavigationButtons';

// View states for the template step
const VIEWS = {
  GALLERY: 'gallery',
  PHILOSOPHY: 'philosophy',
  DISCOVERY: 'discovery',
  PREVIEW: 'preview',
};

/**
 * Template card in the gallery
 */
function TemplateCard({ template, isSelected, onSelect, onLearnMore }) {
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const selectedBorderColor = useColorModeValue('blue.500', 'blue.300');
  const hoverBg = useColorModeValue('gray.50', 'gray.700');
  const selectedBg = useColorModeValue('blue.50', 'blue.900');
  const helperColor = useColorModeValue('gray.500', 'gray.400');

  const colorScheme = template.color || 'gray';
  const icon = template.icon || '📋';

  // Get first 3 capability names for preview
  const capabilityPreview = template.capabilities?.features?.slice(0, 3) || [];

  return (
    <Card
      cursor="pointer"
      onClick={() => onSelect(template.id)}
      borderWidth="2px"
      borderColor={isSelected ? selectedBorderColor : borderColor}
      bg={isSelected ? selectedBg : 'transparent'}
      _hover={{ bg: isSelected ? selectedBg : hoverBg }}
      transition="all 0.2s"
      h="100%"
    >
      <CardBody>
        <VStack align="stretch" spacing={3}>
          {/* Header */}
          <HStack justify="space-between">
            <Text fontSize="2xl">{icon}</Text>
            {isSelected && (
              <Badge colorScheme="blue" fontSize="xs">
                Selected
              </Badge>
            )}
          </HStack>

          {/* Title & Tagline */}
          <Box>
            <Heading size="sm" mb={1}>
              {template.name}
            </Heading>
            <Text fontSize="sm" color={helperColor}>
              {template.tagline}
            </Text>
          </Box>

          {/* Capability Preview */}
          {capabilityPreview.length > 0 && (
            <HStack spacing={1} flexWrap="wrap">
              {capabilityPreview.map((cap, i) => (
                <Text key={i} fontSize="xs" color={helperColor}>
                  {cap.icon} {cap.name}{i < capabilityPreview.length - 1 ? ' •' : ''}
                </Text>
              ))}
            </HStack>
          )}

          {/* Quick Stats */}
          <HStack spacing={2} mt="auto" flexWrap="wrap">
            {template.defaults?.voting?.democracyWeight !== undefined && (
              <Badge colorScheme={colorScheme} fontSize="xs" variant="subtle">
                {template.defaults.voting.democracyWeight}% Democracy
              </Badge>
            )}
            {template.defaults?.features?.educationHubEnabled && (
              <Badge colorScheme="purple" fontSize="xs" variant="subtle">
                Education
              </Badge>
            )}
            {template.defaults?.features?.electionHubEnabled && (
              <Badge colorScheme="teal" fontSize="xs" variant="subtle">
                Elections
              </Badge>
            )}
          </HStack>

          {/* Learn More Button */}
          <Button
            size="xs"
            variant="ghost"
            colorScheme={colorScheme}
            onClick={(e) => {
              e.stopPropagation();
              onLearnMore(template);
            }}
            mt={2}
          >
            Learn more
          </Button>
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
 * Philosophy overview panel
 */
function PhilosophyPanel({ template, onContinue, onBack }) {
  const [showHistory, setShowHistory] = useState(false);
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const helperColor = useColorModeValue('gray.600', 'gray.400');
  const quoteBg = useColorModeValue('blue.50', 'blue.900');

  if (!template?.philosophy) {
    return (
      <VStack spacing={4}>
        <Text color={helperColor}>No philosophy information for this template.</Text>
        <Button colorScheme="blue" onClick={onContinue}>
          Continue to Setup
        </Button>
      </VStack>
    );
  }

  const { essence, keyPrinciple, historicalContext } = template.philosophy;

  return (
    <VStack spacing={6} align="stretch">
      {/* Back Button */}
      <Button
        variant="ghost"
        leftIcon={<ChevronUpIcon />}
        onClick={onBack}
        alignSelf="flex-start"
      >
        Back to Templates
      </Button>

      {/* Template Header */}
      <HStack spacing={3}>
        <Text fontSize="3xl">{template.icon}</Text>
        <Box>
          <Heading size="lg">{template.name}</Heading>
          <Text color={helperColor}>{template.tagline}</Text>
        </Box>
      </HStack>

      {/* Capabilities - What you can DO */}
      <CapabilitiesSection template={template} />

      {/* Hybrid Voting Explainer */}
      <HybridVotingExplainer template={template} />

      {/* Philosophy Essence (collapsible now) */}
      <Card bg={cardBg} borderWidth="1px" borderColor={borderColor}>
        <CardBody>
          <Button
            variant="ghost"
            width="100%"
            justifyContent="space-between"
            rightIcon={showHistory ? <ChevronUpIcon /> : <ChevronDownIcon />}
            onClick={() => setShowHistory(!showHistory)}
            mb={showHistory ? 3 : 0}
          >
            <HStack spacing={2}>
              <InfoIcon color="blue.500" />
              <Text>Why This Governance Model Works</Text>
            </HStack>
          </Button>
          <Collapse in={showHistory} animateOpacity>
            <VStack spacing={4} align="stretch">
              <Text whiteSpace="pre-line" fontSize="sm">{essence}</Text>

              {/* Key Principle */}
              <Box bg={quoteBg} p={4} borderRadius="md" borderLeftWidth="3px" borderLeftColor="blue.500">
                <Text fontWeight="medium" fontSize="sm" mb={1}>Key Insight</Text>
                <Text fontStyle="italic" fontSize="sm">{keyPrinciple}</Text>
              </Box>

              {/* Historical Context */}
              {historicalContext && (
                <Box>
                  <Text fontWeight="medium" fontSize="sm" mb={1} color={helperColor}>Historical Context</Text>
                  <Text fontSize="sm" color={helperColor}>
                    {historicalContext}
                  </Text>
                </Box>
              )}
            </VStack>
          </Collapse>
        </CardBody>
      </Card>

      {/* Continue Button */}
      <HStack justify="space-between" pt={4}>
        <Text fontSize="sm" color={helperColor}>
          {template.discoveryQuestions?.length > 0
            ? `Answer ${template.discoveryQuestions.length} questions to personalize your setup`
            : 'Ready to customize your organization'}
        </Text>
        <Button
          colorScheme="blue"
          size="lg"
          rightIcon={<ArrowForwardIcon />}
          onClick={onContinue}
        >
          {template.discoveryQuestions?.length > 0 ? 'Start Discovery' : 'Continue'}
        </Button>
      </HStack>
    </VStack>
  );
}

/**
 * Growth path preview in a modal
 */
function GrowthPathModal({ template, isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
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
      actions.applyTemplate(selectedTemplateId);
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
          <VStack spacing={8} align="stretch">
            {/* Header */}
            <Box textAlign="center" mb={4}>
              <Heading size="lg" color={headingColor} mb={2}>
                What are you building?
              </Heading>
              <Text color={subheadingColor} maxW="600px" mx="auto">
                Choose a template that matches your organization. Each one includes
                guidance, sensible defaults, and a path for how your governance can
                evolve over time.
              </Text>
            </Box>

            {/* Template Grid */}
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
              {TEMPLATE_LIST.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplateId === template.id}
                  onSelect={handleSelectTemplate}
                  onLearnMore={handleLearnMore}
                />
              ))}
            </SimpleGrid>

            {/* Selected Template Preview */}
            {selectedTemplate && (
              <Box bg={previewBg} p={5} borderRadius="lg" mt={4}>
                <Flex
                  direction={{ base: 'column', md: 'row' }}
                  justify="space-between"
                  align={{ base: 'stretch', md: 'center' }}
                  gap={4}
                >
                  <Box flex={1}>
                    <HStack spacing={2} mb={1}>
                      <Text fontSize="xl">{selectedTemplate.icon}</Text>
                      <Text fontWeight="bold" fontSize="lg">
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
                        onClick={openGrowthPath}
                      >
                        View Growth Path
                      </Button>
                    )}
                    <Button
                      colorScheme="blue"
                      rightIcon={<ArrowForwardIcon />}
                      onClick={handleQuickContinue}
                      size="lg"
                    >
                      Get Started
                    </Button>
                  </HStack>
                </Flex>
              </Box>
            )}

            {/* Navigation */}
            <NavigationButtons
              showBack={false}
              showNext={!!selectedTemplate}
              onNext={handleQuickContinue}
              nextLabel="Continue"
              isNextDisabled={!selectedTemplate}
            />
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
