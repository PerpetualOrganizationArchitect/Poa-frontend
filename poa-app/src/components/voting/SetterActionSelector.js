/**
 * SetterActionSelector
 * Main component for selecting and configuring setter function calls
 * Supports both template mode (user-friendly) and advanced mode (raw functions)
 */

import React, { useState, useMemo } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Select,
  SimpleGrid,
  Alert,
  AlertIcon,
  Badge,
  Divider,
  Icon,
  Collapse,
} from '@chakra-ui/react';
import {
  FiCheckSquare,
  FiUsers,
  FiAlertTriangle,
  FiClipboard,
  FiTag,
  FiChevronRight,
  FiArrowLeft,
  FiChevronDown,
  FiTerminal,
} from 'react-icons/fi';
import SetterParamInputs from './SetterParamInputs';
import {
  SETTER_CATEGORIES,
  SETTER_TEMPLATES,
  CONTRACT_MAP,
  RAW_FUNCTIONS,
  getTemplatesByCategory,
  getTemplateById,
} from '@/config/setterDefinitions';
import { inputStyles } from '@/components/shared/glassStyles';

const categoryIcons = {
  voting: FiCheckSquare,
  permissions: FiUsers,
  emergency: FiAlertTriangle,
  tasks: FiClipboard,
  tokenSettings: FiTag,
};

/**
 * Category card for template selection
 */
const CategoryCard = ({ category, categoryKey, isSelected, onClick }) => {
  const IconComponent = categoryIcons[categoryKey] || FiCheckSquare;

  return (
    <Box
      p={4}
      borderRadius="md"
      cursor="pointer"
      bg={isSelected ? `${category.color}.900` : 'whiteAlpha.50'}
      border="1px solid"
      borderColor={isSelected ? `${category.color}.500` : 'rgba(148, 115, 220, 0.2)'}
      onClick={onClick}
      _hover={{
        borderColor: `${category.color}.400`,
        bg: isSelected ? `${category.color}.900` : 'whiteAlpha.100',
      }}
      transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
    >
      <HStack spacing={3}>
        <Icon as={IconComponent} boxSize={5} color={`${category.color}.400`} />
        <VStack align="start" spacing={0}>
          <Text fontSize="sm" fontWeight="bold" color="white">
            {category.name}
          </Text>
          <Text fontSize="xs" color="gray.400">
            {category.description}
          </Text>
        </VStack>
      </HStack>
    </Box>
  );
};

/**
 * Template card for action selection
 */
const TemplateCard = ({ template, isSelected, onClick }) => {
  return (
    <Box
      p={4}
      borderRadius="md"
      cursor="pointer"
      bg={isSelected ? 'purple.900' : 'whiteAlpha.50'}
      border="1px solid"
      borderColor={isSelected ? 'purple.500' : 'rgba(148, 115, 220, 0.2)'}
      onClick={onClick}
      _hover={{
        borderColor: 'purple.400',
        bg: isSelected ? 'purple.900' : 'whiteAlpha.100',
      }}
      transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
    >
      <HStack justify="space-between">
        <VStack align="start" spacing={1}>
          <HStack>
            <Text fontSize="sm" fontWeight="bold" color="white">
              {template.name}
            </Text>
            {template.dangerLevel === 'critical' && (
              <Badge colorScheme="red" fontSize="xs">
                Critical
              </Badge>
            )}
          </HStack>
          <Text fontSize="xs" color="gray.400">
            {template.description}
          </Text>
        </VStack>
        <Icon as={FiChevronRight} color="gray.400" />
      </HStack>
    </Box>
  );
};

/**
 * Build a BEFORE → AFTER diff line for the five rule templates when the current
 * on-chain value is known. Returns null for every other template (or when the
 * current value / new input is missing) so the preview renders unchanged.
 */
function buildRuleDiff(template, values, currentValues) {
  if (!template || !currentValues) return null;
  const { hybridThresholdPct, hybridQuorum, ddThresholdPct, ddQuorum, votingClasses } = currentValues;
  const known = (v) => v !== null && v !== undefined && v !== '';

  switch (template.id) {
    case 'change-threshold-hybrid':
      return known(hybridThresholdPct) && known(values.threshold)
        ? `Support to pass: ${hybridThresholdPct}% → ${values.threshold}%`
        : null;
    case 'change-threshold-dd':
      return known(ddThresholdPct) && known(values.threshold)
        ? `Support to pass: ${ddThresholdPct}% → ${values.threshold}%`
        : null;
    case 'change-quorum-hybrid':
      return known(hybridQuorum) && known(values.quorum)
        ? `Quorum: ${hybridQuorum} → ${values.quorum}`
        : null;
    case 'change-quorum-dd':
      return known(ddQuorum) && known(values.quorum)
        ? `Quorum: ${ddQuorum} → ${values.quorum}`
        : null;
    case 'change-voting-split': {
      const cur = votingClasses || [];
      const next = values.classWeights || [];
      if (cur.length === 0 || next.length === 0) return null;
      const parts = next.map((c, i) => {
        const label = (c.strategy === 'DIRECT' || c.strategy === 0) ? 'Members' : 'Contributors';
        const before = cur[i]?.slicePct;
        return known(before)
          ? `${label}: ${before}% → ${c.slicePct}%`
          : `${label}: ${c.slicePct}%`;
      });
      return parts.join('  ·  ');
    }
    default:
      return null;
  }
}

/**
 * Preview of what the setter action will do
 */
const SetterPreview = ({ template, values, roleNames, projectNames, currentValues }) => {
  if (!template) return null;

  const previewText = template.preview
    ? template.preview(values, roleNames, projectNames)
    : `Execute ${template.name}`;

  const diffLine = buildRuleDiff(template, values, currentValues);

  return (
    <Alert
      status="info"
      borderRadius="md"
      bg="rgba(66, 153, 225, 0.15)"
      border="1px solid rgba(66, 153, 225, 0.3)"
    >
      <AlertIcon color="blue.300" />
      <VStack align="start" spacing={1}>
        <Text fontSize="sm" fontWeight="medium" color="white">
          If this vote passes:
        </Text>
        <Text fontSize="sm" color="gray.300">
          {previewText}
        </Text>
        {diffLine && (
          <Text fontSize="sm" fontWeight="600" color="blue.100" fontFamily="mono">
            {diffLine}
          </Text>
        )}
      </VStack>
    </Alert>
  );
};

/**
 * Main SetterActionSelector component
 */
const SetterActionSelector = ({
  proposal,
  onChange,
  allRoles = [],
  allProjects = [],
  roleNames = {},
  projectNames = {},
  votingClasses = [],
  currentValues = null,
}) => {
  const [mode, setMode] = useState('template');
  const [selectedCategory, setSelectedCategory] = useState(null);
  // "Developer mode" disclosure — the raw-ABI path is a footgun for co-op
  // members, so it stays collapsed until deliberately opened.
  const [devModeOpen, setDevModeOpen] = useState(false);

  // Get the selected template if in template mode
  const selectedTemplate = useMemo(() => {
    if (mode === 'template' && proposal.setterTemplate) {
      return getTemplateById(proposal.setterTemplate);
    }
    return null;
  }, [mode, proposal.setterTemplate]);

  // Get templates for the selected category
  const categoryTemplates = useMemo(() => {
    if (selectedCategory) {
      return getTemplatesByCategory(selectedCategory);
    }
    return [];
  }, [selectedCategory]);

  // Get raw function for advanced mode
  const selectedRawFunction = useMemo(() => {
    if (mode === 'advanced' && proposal.setterContract && proposal.setterFunction) {
      return RAW_FUNCTIONS[proposal.setterContract]?.find(
        f => f.name === proposal.setterFunction
      );
    }
    return null;
  }, [mode, proposal.setterContract, proposal.setterFunction]);

  // Handle template selection
  const handleTemplateSelect = (templateId) => {
    const template = getTemplateById(templateId);
    const initialValues = template?.inputs?.reduce((acc, input) => {
      if (input.type === 'votingClassWeights') {
        // Initialize with current on-chain voting classes
        acc[input.name] = votingClasses.length > 0 ? votingClasses.map(c => ({ ...c })) : [];
      } else {
        acc[input.name] = input.default || '';
      }
      return acc;
    }, {}) || {};
    onChange({
      setterMode: 'template',
      setterTemplate: templateId,
      setterContract: template?.contract || '',
      setterFunction: template?.functionName || '',
      setterValues: initialValues,
      setterParams: [],
    });
  };

  // Handle back navigation
  const handleBack = () => {
    if (selectedTemplate) {
      onChange({
        setterTemplate: '',
        setterValues: {},
      });
    } else if (selectedCategory) {
      setSelectedCategory(null);
    }
  };

  // Handle mode switch
  const handleModeSwitch = (newMode) => {
    setMode(newMode);
    setSelectedCategory(null);
    onChange({
      setterMode: newMode,
      setterTemplate: '',
      setterContract: '',
      setterFunction: '',
      setterValues: {},
      setterParams: [],
    });
  };

  // Toggle the Developer-mode disclosure. Opening switches the form into
  // advanced (raw-ABI) mode; collapsing returns it to the safe template mode so
  // a stale raw call can't leak into submit.
  const toggleDevMode = () => {
    const nextOpen = !devModeOpen;
    setDevModeOpen(nextOpen);
    handleModeSwitch(nextOpen ? 'advanced' : 'template');
  };

  return (
    <VStack spacing={4} align="stretch">
      {!devModeOpen ? (
        <>
          {/* Template Mode */}
          {!selectedCategory && !proposal.setterTemplate && (
            <>
              <Text fontSize="sm" color="gray.300" fontWeight="medium">
                Select a category:
              </Text>
              <SimpleGrid columns={2} spacing={3}>
                {Object.entries(SETTER_CATEGORIES).map(([key, category]) => (
                  <CategoryCard
                    key={key}
                    categoryKey={key}
                    category={category}
                    isSelected={selectedCategory === key}
                    onClick={() => setSelectedCategory(key)}
                  />
                ))}
              </SimpleGrid>
            </>
          )}

          {selectedCategory && !proposal.setterTemplate && (
            <>
              <HStack>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<FiArrowLeft />}
                  onClick={handleBack}
                  color="gray.400"
                  _hover={{ color: 'white' }}
                >
                  Back
                </Button>
                <Text fontSize="sm" color="gray.300" fontWeight="medium">
                  {SETTER_CATEGORIES[selectedCategory]?.name}
                </Text>
              </HStack>
              <VStack spacing={2} align="stretch">
                {categoryTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isSelected={proposal.setterTemplate === template.id}
                    onClick={() => handleTemplateSelect(template.id)}
                  />
                ))}
                {categoryTemplates.length === 0 && (
                  <Text fontSize="sm" color="gray.500">
                    No actions available in this category.
                  </Text>
                )}
              </VStack>
            </>
          )}

          {selectedTemplate && (
            <>
              <HStack>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<FiArrowLeft />}
                  onClick={handleBack}
                  color="gray.400"
                  _hover={{ color: 'white' }}
                >
                  Back
                </Button>
                <Text fontSize="sm" color="white" fontWeight="bold">
                  {selectedTemplate.name}
                </Text>
                {selectedTemplate.dangerLevel === 'critical' && (
                  <Badge colorScheme="red">Critical Action</Badge>
                )}
              </HStack>

              {selectedTemplate.warning && (
                <Alert status="warning" borderRadius="md" bg="rgba(236, 201, 75, 0.15)">
                  <AlertIcon color="yellow.300" />
                  <Text fontSize="sm" color="yellow.200">
                    {selectedTemplate.warning}
                  </Text>
                </Alert>
              )}

              <SetterParamInputs
                inputs={selectedTemplate.inputs.map(input =>
                  input.type === 'votingClassWeights'
                    ? { ...input, currentClasses: votingClasses }
                    : input
                )}
                values={proposal.setterValues || {}}
                onChange={(values) => onChange({ setterValues: values })}
                allRoles={allRoles}
                allProjects={allProjects}
              />

              <SetterPreview
                template={selectedTemplate}
                values={proposal.setterValues || {}}
                roleNames={roleNames}
                projectNames={projectNames}
                currentValues={currentValues}
              />
            </>
          )}
        </>
      ) : null}

      {/* Developer mode — raw contract call, collapsed by default */}
      <Box borderTop="1px solid" borderColor="whiteAlpha.100" pt={3}>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<Icon as={FiTerminal} />}
          rightIcon={
            <Icon
              as={FiChevronDown}
              transform={devModeOpen ? 'rotate(180deg)' : 'none'}
              transition="transform 0.2s"
            />
          }
          color="gray.400"
          _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
          onClick={toggleDevMode}
          w="100%"
          justifyContent="space-between"
        >
          Developer mode
        </Button>
      </Box>

      <Collapse in={devModeOpen} animateOpacity>
        <VStack spacing={4} align="stretch">
          {/* Advanced Mode — raw contract call */}
          <Alert status="warning" borderRadius="md" bg="rgba(236, 201, 75, 0.15)">
            <AlertIcon color="yellow.300" />
            <Text fontSize="sm" color="yellow.200">
              Calls a contract function directly. Only use this if you know exactly what it does.
            </Text>
          </Alert>

          <Select
            placeholder="Select contract"
            value={proposal.setterContract || ''}
            onChange={(e) => onChange({
              setterContract: e.target.value,
              setterFunction: '',
              setterParams: [],
            })}
            {...inputStyles}
          >
            {Object.entries(CONTRACT_MAP).map(([key, contract]) => (
              <option key={key} value={key} style={{ background: '#1a1a2e' }}>
                {contract.displayName}
              </option>
            ))}
          </Select>

          {proposal.setterContract && (
            <Select
              placeholder="Select function"
              value={proposal.setterFunction || ''}
              onChange={(e) => onChange({
                setterFunction: e.target.value,
                setterParams: [],
              })}
              {...inputStyles}
            >
              {RAW_FUNCTIONS[proposal.setterContract]?.map((fn) => (
                <option key={fn.name} value={fn.name} style={{ background: '#1a1a2e' }}>
                  {fn.name} - {fn.description}
                </option>
              ))}
            </Select>
          )}

          {selectedRawFunction && (
            <>
              <Divider borderColor="rgba(148, 115, 220, 0.2)" />
              <Text fontSize="xs" color="gray.500" fontFamily="mono">
                {typeof selectedRawFunction.signature === 'string'
                  ? selectedRawFunction.signature
                  : `function ${selectedRawFunction.name}(...)`}
              </Text>
              <SetterParamInputs
                inputs={selectedRawFunction.params}
                values={proposal.setterParams?.reduce((acc, val, idx) => {
                  const param = selectedRawFunction.params[idx];
                  if (param) acc[param.name] = val;
                  return acc;
                }, {}) || {}}
                onChange={(values) => {
                  const params = selectedRawFunction.params.map(p => values[p.name] || '');
                  onChange({ setterParams: params });
                }}
                allRoles={allRoles}
                allProjects={allProjects}
              />
            </>
          )}
        </VStack>
      </Collapse>

      <Divider borderColor="rgba(148, 115, 220, 0.2)" />

      <Alert status="info" borderRadius="md" bg="rgba(66, 153, 225, 0.15)">
        <AlertIcon color="blue.300" />
        <Text fontSize="sm" color="gray.300">
          This creates a Yes/No vote. If "Yes" wins, the settings will be updated automatically.
        </Text>
      </Alert>
    </VStack>
  );
};

export default SetterActionSelector;
