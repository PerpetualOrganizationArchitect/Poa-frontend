/**
 * SetterActionSelector
 * Main component for selecting and configuring setter function calls
 * Supports both template mode (user-friendly) and advanced mode (raw functions)
 */

import React, { useMemo } from 'react';
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
  FiChevronDown,
  FiTerminal,
} from 'react-icons/fi';
import SetterParamInputs from './SetterParamInputs';
import {
  SETTER_CATEGORIES,
  SETTER_TEMPLATES,
  CONTRACT_MAP,
  RAW_FUNCTIONS,
  getTemplateById,
  isContractAvailable,
  SETTER_TITLE_FALLBACK,
  buildSetterCopy,
} from '@/config/setterDefinitions';
import { applyAutoCopy } from '@/components/voting/create/autoCopy';
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
 * Does this param actually hold a value? Empty strings and empty arrays are
 * "not filled"; `0` and `false` are real answers.
 */
const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
};

/**
 * Has anything at all been entered in the setter block? A
 * `?propose=…&prefill_root=…&prefill_cid=…` deep link lands here fully
 * populated, so "empty" has to mean every field, not just the ones the current
 * mode happens to read.
 */
const hasSetterPayload = (proposal) => {
  const p = proposal || {};
  return Boolean(p.setterTemplate)
    || Boolean(p.setterContract)
    || Boolean(p.setterFunction)
    || Object.values(p.setterValues || {}).some(hasValue)
    || (p.setterParams || []).some(hasValue);
};

/**
 * The member-facing description for a template, or null when it isn't worth
 * writing yet. `preview()` is not defensive about partial values — it throws on
 * some templates and renders half-finished copy ("Change blended voting
 * threshold to %") on others — so we only generate once every required param
 * has a value. The edit that completes the set writes the description, and
 * every edit after that keeps it in sync.
 */
function describeTemplate(template, values, roleNames, projectNames) {
  return buildSetterCopy(template, values, roleNames, projectNames).description;
}

/**
 * Drop the copy this flow generated, leaving anything the member typed alone.
 * Mirrors applyAutoCopy's provenance test in the other direction.
 */
function clearAutoCopy(proposal) {
  const p = proposal || {};
  const out = {};
  if (p.autoTitle && p.name === p.autoTitle) {
    out.name = '';
    out.autoTitle = '';
  }
  if (p.autoDescription && p.description === p.autoDescription) {
    out.description = '';
    out.autoDescription = '';
  }
  return out;
}

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
  contractAddresses = null,
}) => {
  // Everything this screen shows is derived from the proposal, never from local
  // state: the wizard's Back/Next remounts this component, and a category (or a
  // restored `setterMode: 'advanced'`) held locally would desync from the state
  // the validators read.
  const mode = proposal.setterMode === 'advanced' ? 'advanced' : 'template';
  const selectedCategory = proposal.setterCategory || null;
  // "Developer mode" disclosure — the raw-ABI path is a footgun for co-op
  // members, so it stays collapsed until deliberately opened.
  const devModeOpen = mode === 'advanced';

  // Get the selected template if in template mode
  const selectedTemplate = useMemo(() => {
    if (mode === 'template' && proposal.setterTemplate) {
      return getTemplateById(proposal.setterTemplate);
    }
    return null;
  }, [mode, proposal.setterTemplate]);

  // Only offer actions whose target contract this org actually deployed.
  // Optional modules (Email Invites) are absent on most orgs, and a template
  // pointing at a missing contract can only produce a proposal that executes
  // nothing. Callers that don't pass contractAddresses (tests) see everything.
  const availableTemplates = useMemo(() => {
    if (!contractAddresses) return SETTER_TEMPLATES;
    return SETTER_TEMPLATES.filter(t => isContractAvailable(t.contract, contractAddresses));
  }, [contractAddresses]);

  // Hide a category entirely once none of its actions are available, rather
  // than letting members click into an empty list.
  const availableCategories = useMemo(() => (
    Object.entries(SETTER_CATEGORIES)
      .filter(([key]) => availableTemplates.some(t => t.category === key))
  ), [availableTemplates]);

  // Get templates for the selected category
  const categoryTemplates = useMemo(() => {
    if (!selectedCategory) return [];
    return availableTemplates.filter(t => t.category === selectedCategory);
  }, [selectedCategory, availableTemplates]);

  // Same rule for the raw-ABI escape hatch: don't list contracts the org
  // doesn't have, and don't list ones we have no function definitions for.
  const availableContracts = useMemo(() => (
    Object.entries(CONTRACT_MAP).filter(([key]) => (
      // templateOnly functions are not raw-callable, so a contract whose entries are
      // all template-only has nothing to offer here.
      (RAW_FUNCTIONS[key] || []).some((fn) => !fn.templateOnly)
      && (!contractAddresses || isContractAvailable(key, contractAddresses))
    ))
  ), [contractAddresses]);

  // Get raw function for advanced mode
  const selectedRawFunction = useMemo(() => {
    if (mode === 'advanced' && proposal.setterContract && proposal.setterFunction) {
      return RAW_FUNCTIONS[proposal.setterContract]?.find(
        f => f.name === proposal.setterFunction
      );
    }
    return null;
  }, [mode, proposal.setterContract, proposal.setterFunction]);

  // The title/description this action suggests, as a proposal patch. The title
  // is the curated per-template string — never `preview({})`, which is empty or
  // wrong for most templates before their params are filled.
  const autoCopyFor = (template, values, { withDescription = true } = {}) => applyAutoCopy(proposal, {
    title: template ? SETTER_TITLE_FALLBACK(template) : null,
    description: withDescription
      ? describeTemplate(template, values, roleNames, projectNames)
      : null,
  });

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
      // Remember the category so a deep-linked action (which arrives with no
      // category) can still walk back to its sibling list.
      setterCategory: template?.category || selectedCategory || '',
      setterTemplate: templateId,
      setterContract: template?.contract || '',
      setterFunction: template?.functionName || '',
      setterValues: initialValues,
      setterParams: [],
      // A `requiresContext` template (change-voting-split) is seeded with the
      // CURRENT on-chain values, so describing it before any edit would announce
      // a change that isn't one. Its description arrives on the first edit.
      ...autoCopyFor(template, initialValues, { withDescription: !template?.requiresContext }),
    });
  };

  // Step back out of the chosen action to its sibling list. Not a wizard Back —
  // the footer owns that — but without it a mis-picked action is unreachable,
  // since the footer's Back leaves the config step entirely.
  const handleChangeTemplate = () => {
    onChange({
      setterTemplate: '',
      setterValues: {},
      // handleTemplateSelect also wrote the template's contract + function.
      // Leaving those behind made an abandoned action look like a started raw
      // payload: hasSetterPayload() saw them, so opening Developer mode kept
      // them, and configError's advanced branch only needs a contract and a
      // function — so a zero-arg template like "Pause Blended Voting" became a
      // ready-to-submit hybridVoting.pause() the member never chose.
      setterContract: '',
      setterFunction: '',
      setterParams: [],
      // The suggested copy described the action being abandoned.
      ...clearAutoCopy(proposal),
    });
  };

  // Handle mode switch.
  //
  // This used to blank all six setter fields on every toggle. The disclosure now
  // sits on a screen of its own where it gets toggled far more often, and a
  // `?propose=…&prefill_root=…&prefill_cid=…` deep link would be silently
  // destroyed by a stray click — so the block is only reset while it is still
  // empty. Submit branches on `setterMode`, so a surviving payload from the
  // other mode can't leak into the transaction.
  const handleModeSwitch = (newMode) => {
    const started = hasSetterPayload(proposal);
    const update = { setterMode: newMode };
    if (!started) {
      // Nothing entered yet, so the browse position is the only thing lost.
      update.setterCategory = '';
      update.setterTemplate = '';
      update.setterContract = '';
      update.setterFunction = '';
      update.setterValues = {};
      update.setterParams = [];
    }

    // The generated copy describes the template path. Drop it on the way into
    // Developer mode (which has no auto-copy of its own), and re-derive it on
    // the way back out if the action survived the trip.
    const survivingTemplate = newMode === 'template' && started
      ? getTemplateById(proposal.setterTemplate)
      : null;
    Object.assign(
      update,
      survivingTemplate
        ? autoCopyFor(survivingTemplate, proposal.setterValues || {})
        : clearAutoCopy(proposal),
    );

    onChange(update);
  };

  // Toggle the Developer-mode disclosure. Opening switches the form into
  // advanced (raw-ABI) mode; collapsing returns it to the safe template mode so
  // a stale raw call can't leak into submit.
  const toggleDevMode = () => {
    handleModeSwitch(devModeOpen ? 'template' : 'advanced');
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
                {availableCategories.map(([key, category]) => (
                  <CategoryCard
                    key={key}
                    categoryKey={key}
                    category={category}
                    isSelected={selectedCategory === key}
                    onClick={() => onChange({ setterCategory: key })}
                  />
                ))}
              </SimpleGrid>
            </>
          )}

          {selectedCategory && !proposal.setterTemplate && (
            <>
              <HStack justify="space-between">
                <Text fontSize="sm" color="gray.300" fontWeight="medium">
                  {SETTER_CATEGORIES[selectedCategory]?.name}
                </Text>
                <Button
                  size="xs"
                  variant="link"
                  onClick={() => onChange({ setterCategory: '' })}
                  color="gray.400"
                  fontWeight="medium"
                  _hover={{ color: 'white' }}
                >
                  Change category
                </Button>
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
              <HStack justify="space-between">
                <HStack>
                  <Text fontSize="sm" color="white" fontWeight="bold">
                    {selectedTemplate.name}
                  </Text>
                  {selectedTemplate.dangerLevel === 'critical' && (
                    <Badge colorScheme="red">Critical Action</Badge>
                  )}
                </HStack>
                <Button
                  size="xs"
                  variant="link"
                  onClick={handleChangeTemplate}
                  color="gray.400"
                  fontWeight="medium"
                  _hover={{ color: 'white' }}
                >
                  Change action
                </Button>
              </HStack>

              {selectedTemplate.warning && (
                <Alert status="warning" borderRadius="md" bg="rgba(236, 201, 75, 0.15)">
                  <AlertIcon color="yellow.300" />
                  <Text fontSize="sm" color="yellow.200">
                    {selectedTemplate.warning}
                  </Text>
                </Alert>
              )}

              {/* The four Emergency Controls templates take no params —
                  SetterParamInputs would render a "requires no additional
                  configuration" box, so go straight to the preview instead. */}
              {selectedTemplate.inputs?.length > 0 && (
                <SetterParamInputs
                  inputs={selectedTemplate.inputs.map(input =>
                    input.type === 'votingClassWeights'
                      ? { ...input, currentClasses: votingClasses }
                      : input
                  )}
                  values={proposal.setterValues || {}}
                  onChange={(values) => onChange({
                    setterValues: values,
                    // Keep the suggested description tracking the params. The
                    // title was written when the action was picked and is the
                    // member's to edit from here on.
                    ...applyAutoCopy(proposal, {
                      description: describeTemplate(
                        selectedTemplate, values, roleNames, projectNames,
                      ),
                    }),
                  })}
                  allRoles={allRoles}
                  allProjects={allProjects}
                />
              )}

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
            {availableContracts.map(([key, contract]) => (
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
              {RAW_FUNCTIONS[proposal.setterContract]?.filter((fn) => !fn.templateOnly).map((fn) => (
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

      {/* Held back until an action is actually chosen. The first screen of this
          step is deliberately just "pick a category" + Developer mode — a
          trailing explainer about a Yes/No vote is noise before there is
          anything to vote on. */}
      {(selectedTemplate || selectedRawFunction) && (
        <>
          <Divider borderColor="rgba(148, 115, 220, 0.2)" />
          <Alert status="info" borderRadius="md" bg="rgba(66, 153, 225, 0.15)">
            <AlertIcon color="blue.300" />
            <Text fontSize="sm" color="gray.300">
              This creates a Yes/No vote. If "Yes" wins, the settings will be updated automatically.
            </Text>
          </Alert>
        </>
      )}
    </VStack>
  );
};

export default SetterActionSelector;
