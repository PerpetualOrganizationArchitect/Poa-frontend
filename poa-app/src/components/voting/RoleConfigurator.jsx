/**
 * RoleConfigurator
 * Template-style configurator for the `createRole` proposal type.
 * Three-step flow: Basics -> Permissions & Vouching -> Initial Wearers.
 *
 * Builds the same set of role-config fields the deployer wizard collects in
 * RoleForm.jsx, but stored under `proposal.roleConfig` and keyed by on-chain
 * hat IDs (not deployer-array indices). useProposalForm consumes the result
 * at submit time to encode a multi-call batch (createHatWithEligibility +
 * configureVouching + setCreatorHatAllowed + setProjectRolePerm).
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Input,
  Textarea,
  Select,
  FormControl,
  FormLabel,
  FormHelperText,
  Switch,
  Checkbox,
  Tooltip,
  IconButton,
  InputGroup,
  InputLeftElement,
  Alert,
  AlertIcon,
  Badge,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Icon,
} from '@chakra-ui/react';
import {
  FiChevronRight,
  FiArrowLeft,
  FiSearch,
  FiUserPlus,
} from 'react-icons/fi';
import { AddIcon, DeleteIcon, InfoOutlineIcon } from '@chakra-ui/icons';
import { utils } from 'ethers';
import { inputStyles } from '@/components/shared/glassStyles';
import { applyAutoCopy } from '@/components/voting/create/autoCopy';

export const TITLE_PREFIX = 'Create role: ';
export const DESCRIPTION_PREFIX = 'New role ';

/**
 * Parse the auto-generated parent name from a createRole proposal title.
 * Auto-title format: "Create role: <name> (under <parentName>)".
 * Returns null when the title doesn't match (manually edited, or no parent yet).
 */
export function parseAutoTitle(title) {
  if (typeof title !== 'string' || !title.startsWith(TITLE_PREFIX)) return null;
  const m = title.slice(TITLE_PREFIX.length).match(/^(.+?) \(under (.+?)\)$/);
  if (!m) return null;
  return { name: m[1], parentName: m[2] };
}

const SENTINEL_SELF_VOUCH = 'self';

// Full TaskPerm bitmask (matches TaskPerm.sol and src/util/permissions.js).
// Shared by the global (org-wide) mask and each per-project override.
const PERM_OPTIONS = [
  { value: 1, label: 'CREATE — Create new tasks' },
  { value: 2, label: 'CLAIM — Claim tasks' },
  { value: 4, label: 'REVIEW — Review completed tasks' },
  { value: 8, label: 'ASSIGN — Assign tasks to others' },
  { value: 16, label: 'SELF_REVIEW — Claimer can complete their own task' },
  { value: 32, label: 'BUDGET — Edit project budgets (PT cap & bounty caps)' },
  { value: 64, label: 'EDIT_META — Edit task title / metadata' },
  { value: 128, label: 'EDIT_FULL — Edit task payout, bounty & metadata' },
];

/** Short permission names (e.g. ["CREATE", "REVIEW"]) for a mask. */
function maskLabels(mask) {
  return PERM_OPTIONS
    .filter(opt => (Number(mask) & opt.value) === opt.value)
    .map(opt => opt.label.split(' ')[0]);
}

export const defaultRoleConfig = {
  parentHatId: '',
  name: '',
  description: '',
  imageURI: '',
  maxSupply: 100,
  mutable: true,
  defaultEligible: true,
  defaultStanding: true,
  canVote: false,
  // Task-system grants (all additive — encoder appends nothing when untouched):
  globalPerms: 0,            // org-wide TaskPerm mask via setConfig(ROLE_PERM)
  canCreateTasks: false,     // setConfig(CREATOR_HAT_ALLOWED) — create projects/tasks
  canOrganizeFolders: false, // setConfig(ORGANIZER_HAT_ALLOWED) — reorganize folder tree
  vouching: {
    enabled: false,
    quorum: 1,
    voucherHatId: '',
    selfVouch: false,
    combineWithHierarchy: false,
  },
  initialWearers: [],   // [{ address, name, eligible, standing }]
  projectPerms: [],     // [{ projectId, projectName, mask }]
};

/**
 * Build the auto-generated proposal title from the role config.
 * Format: "Create role: <name> (under <parentName>)". The "(under …)" tail is
 * load-bearing: CreateVoteModal's parseAutoTitle reads it back out of OTHER
 * members' titles to spot two createRole proposals racing on Hats.getNextId.
 * Returns '' until the role has a name, and drops the tail while the parent is
 * unpicked (or names haven't loaded yet).
 */
function buildRoleTitle(rc, allRoles) {
  if (!rc?.name) return '';
  const parent = rc.parentHatId
    ? (allRoles || []).find(x => String(x.hatId) === String(rc.parentHatId))
    : null;
  const parentName = parent?.name || '';
  return parentName
    ? `${TITLE_PREFIX}${rc.name} (under ${parentName})`
    : `${TITLE_PREFIX}${rc.name}`;
}

/**
 * Build the auto-generated proposal description from the role config.
 * Auto-detection in useProposalForm clears this when the user switches type
 * away from createRole (that still matches on DESCRIPTION_PREFIX). Keeping a
 * member's own wording is applyAutoCopy's job, not this string's.
 *
 * Reaching the details screen after only sub-step 1 is legitimate — permissions
 * and wearers are genuinely optional — so `New role "Treasurer" — no vouching.`
 * is a correct result, not a half-written one.
 */
function buildRoleDescription(rc) {
  if (!rc?.name) return '';
  const bits = [];
  if (rc.vouching?.enabled) {
    const q = Number(rc.vouching.quorum) || 1;
    bits.push(`vouching required (${q})`);
  } else {
    bits.push('no vouching');
  }
  if (rc.canVote) bits.push('can create proposals');
  if (Number(rc.globalPerms) > 0) bits.push('global task permissions');
  if (rc.canCreateTasks) bits.push('can create tasks');
  if (rc.canOrganizeFolders) bits.push('can organize folders');
  const wearerCount = (rc.initialWearers || []).length;
  if (wearerCount > 0) {
    bits.push(`${wearerCount} initial wearer${wearerCount > 1 ? 's' : ''}`);
  }
  return `${DESCRIPTION_PREFIX}"${rc.name}" — ${bits.join(', ')}.`;
}

/**
 * Small dashed-box wrapper used for the empty-list states.
 */
const EmptyBox = ({ children }) => (
  <Box
    p={4}
    borderRadius="md"
    border="1px dashed rgba(148, 115, 220, 0.3)"
    bg="whiteAlpha.30"
  >
    <Text fontSize="sm" color="gray.400" textAlign="center">
      {children}
    </Text>
  </Box>
);

const StepHeader = ({ step, title, subtitle, onBack }) => (
  <HStack justify="space-between" align="center">
    <VStack align="start" spacing={0}>
      <Text fontSize="xs" color="purple.300" textTransform="uppercase" letterSpacing="wide">
        Step {step} of 3
      </Text>
      <Text fontSize="md" fontWeight="bold" color="white">{title}</Text>
      {subtitle ? (
        <Text fontSize="xs" color="gray.400">{subtitle}</Text>
      ) : null}
    </VStack>
    {onBack ? (
      <Button
        size="sm"
        variant="ghost"
        leftIcon={<FiArrowLeft />}
        color="gray.300"
        _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
        onClick={onBack}
      >
        Back
      </Button>
    ) : null}
  </HStack>
);

/** Eyebrow header that groups the Step-2 permission sections. */
const SectionLabel = ({ children }) => (
  <Text
    fontSize="xs"
    color="purple.300"
    textTransform="uppercase"
    letterSpacing="wide"
    fontWeight="bold"
    mt={1}
  >
    {children}
  </Text>
);

/**
 * Reusable TaskPerm bitmask checkbox group. Used for both the global
 * (org-wide) mask and each per-project override so the bit list stays in sync.
 */
const PermissionMaskCheckboxes = ({ mask, onToggle }) => (
  <VStack align="stretch" spacing={1} pl={1}>
    {PERM_OPTIONS.map(opt => (
      <Checkbox
        key={opt.value}
        isChecked={(Number(mask) & opt.value) === opt.value}
        colorScheme="purple"
        size="sm"
        onChange={() => onToggle(opt.value)}
      >
        <Text fontSize="xs" color="gray.200">{opt.label}</Text>
      </Checkbox>
    ))}
  </VStack>
);

const RoleConfigurator = ({
  proposal,
  onChange,
  allRoles = [],
  allProjects = [],
  leaderboardData = [],
  activeCreateRoleProposals = [],   // optional: [{ parentHatId, name }] from voting page
}) => {
  const rc = proposal.roleConfig || defaultRoleConfig;
  const [step, setStep] = useState(rc.parentHatId ? 2 : 1);
  const [memberSearch, setMemberSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Merge updates into proposal.roleConfig via the shared setter handler, and
  // re-suggest the proposal title/description off the new config.
  //
  // applyAutoCopy decides whether the suggestion is ours to rewrite by comparing
  // against the provenance twins (autoTitle/autoDescription) rather than the old
  // `name.startsWith(TITLE_PREFIX)` test — which let "Create role: Treasurer —
  // please approve by Friday" pass and got clobbered by the next permission
  // toggle. With the wizard's Back button, edit → Back → reconfigure is everyday
  // navigation, so the member's wording has to survive it.
  const update = useCallback(
    (changes) => {
      const nextRc = { ...rc, ...changes };
      onChange({
        roleConfig: nextRc,
        ...applyAutoCopy(proposal, {
          title: buildRoleTitle(nextRc, allRoles),
          description: buildRoleDescription(nextRc),
        }),
      });
    },
    [rc, proposal, onChange, allRoles]
  );

  const updateVouching = useCallback(
    (changes) => update({ vouching: { ...rc.vouching, ...changes } }),
    [update, rc.vouching]
  );

  // Parent-role options. Exclude the top hat (it isn't admin-reachable by the
  // EligibilityModule — see Deployer.sol:421-448). Every other role lives
  // under eligibilityAdminHat, which EligibilityModule wears.
  const parentRoleOptions = useMemo(() => allRoles, [allRoles]);

  const parentRoleName = useMemo(() => {
    if (!rc.parentHatId) return '';
    const r = parentRoleOptions.find(x => String(x.hatId) === String(rc.parentHatId));
    return r?.name || '';
  }, [rc.parentHatId, parentRoleOptions]);

  const voucherRoleName = useMemo(() => {
    if (rc.vouching?.selfVouch) return rc.name || 'this role';
    if (!rc.vouching?.voucherHatId) return '';
    const r = allRoles.find(x => String(x.hatId) === String(rc.vouching.voucherHatId));
    return r?.name || '';
  }, [rc.vouching, rc.name, allRoles]);

  const concurrentProposalForParent = useMemo(() => {
    if (!rc.parentHatId) return null;
    return (activeCreateRoleProposals || []).find(
      p => String(p.parentHatId) === String(rc.parentHatId)
    );
  }, [activeCreateRoleProposals, rc.parentHatId]);

  // Members eligible to be added as initial wearers
  const availableMembers = useMemo(() => {
    const addedAddresses = new Set(
      (rc.initialWearers || []).map(w => w.address.toLowerCase())
    );
    let members = (leaderboardData || []).filter(
      u => u.hasUsername && !addedAddresses.has(u.address.toLowerCase())
    );
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      members = members.filter(
        u => u.name.toLowerCase().includes(q) || u.address.toLowerCase().includes(q)
      );
    }
    return members.slice(0, 30);  // cap the list — full list is overwhelming
  }, [leaderboardData, rc.initialWearers, memberSearch]);

  const handleAddMember = useCallback((member) => {
    const lower = member.address.toLowerCase();
    if ((rc.initialWearers || []).some(w => w.address.toLowerCase() === lower)) return;
    update({
      initialWearers: [
        ...(rc.initialWearers || []),
        { address: member.address, name: member.name, eligible: rc.defaultEligible, standing: rc.defaultStanding },
      ],
    });
    setMemberSearch('');
  }, [rc, update]);

  const handleAddManualWearer = useCallback(() => {
    const addr = manualAddress.trim();
    if (!utils.isAddress(addr)) return;
    const lower = addr.toLowerCase();
    if ((rc.initialWearers || []).some(w => w.address.toLowerCase() === lower)) return;
    update({
      initialWearers: [
        ...(rc.initialWearers || []),
        { address: addr, name: manualName.trim() || '', eligible: rc.defaultEligible, standing: rc.defaultStanding },
      ],
    });
    setManualName('');
    setManualAddress('');
    setShowManualEntry(false);
  }, [manualAddress, manualName, rc, update]);

  const handleRemoveWearer = useCallback((idx) => {
    update({ initialWearers: (rc.initialWearers || []).filter((_, i) => i !== idx) });
  }, [rc.initialWearers, update]);

  const handleAddProjectPerm = useCallback(() => {
    update({ projectPerms: [...(rc.projectPerms || []), { projectId: '', projectName: '', mask: 0 }] });
  }, [rc.projectPerms, update]);

  const handleRemoveProjectPerm = useCallback((idx) => {
    update({ projectPerms: (rc.projectPerms || []).filter((_, i) => i !== idx) });
  }, [rc.projectPerms, update]);

  const handleProjectPickerChange = useCallback((idx, projectId) => {
    const project = (allProjects || []).find(p => p.id === projectId);
    const next = [...(rc.projectPerms || [])];
    next[idx] = { ...next[idx], projectId, projectName: project?.name || project?.title || '' };
    update({ projectPerms: next });
  }, [allProjects, rc.projectPerms, update]);

  const handlePermMaskToggle = useCallback((idx, permValue) => {
    const next = [...(rc.projectPerms || [])];
    const current = Number(next[idx]?.mask || 0);
    const flipped = (current & permValue) ? current & ~permValue : current | permValue;
    next[idx] = { ...next[idx], mask: flipped };
    update({ projectPerms: next });
  }, [rc.projectPerms, update]);

  const handleGlobalPermToggle = useCallback((permValue) => {
    const current = Number(rc.globalPerms || 0);
    const flipped = (current & permValue) ? current & ~permValue : current | permValue;
    update({ globalPerms: flipped });
  }, [rc.globalPerms, update]);

  /*════════════════════════════ STEP 1 ════════════════════════════*/
  const renderStep1 = () => (
    <VStack align="stretch" spacing={4}>
      <StepHeader step={1} title="Role basics" subtitle="Name and place in the hierarchy" />

      <FormControl isRequired>
        <FormLabel color="gray.200" fontSize="sm">Role Name</FormLabel>
        <Input
          placeholder="e.g. Treasurer"
          value={rc.name}
          onChange={(e) => update({ name: e.target.value })}
          {...inputStyles}
        />
      </FormControl>

      <FormControl>
        <FormLabel color="gray.200" fontSize="sm">Description (optional)</FormLabel>
        <Textarea
          placeholder="What does this role do?"
          value={rc.description}
          onChange={(e) => update({ description: e.target.value })}
          {...inputStyles}
        />
      </FormControl>

      <FormControl isRequired>
        <FormLabel color="gray.200" fontSize="sm">
          Parent Role
          <Tooltip
            label="Members of the parent role become admins of the new role's wearers — they can revoke or transfer the hat."
            placement="top"
            hasArrow
          >
            <Icon as={InfoOutlineIcon} color="gray.400" boxSize={3} ml={1} mb={0.5} />
          </Tooltip>
        </FormLabel>
        <Select
          placeholder="Select parent role"
          value={rc.parentHatId || ''}
          onChange={(e) => update({ parentHatId: e.target.value })}
          {...inputStyles}
        >
          {parentRoleOptions.map(role => (
            <option key={role.hatId} value={role.hatId} style={{ background: '#1a1a2e' }}>
              {role.name}
            </option>
          ))}
        </Select>
        <FormHelperText color="gray.500">
          The new role becomes a child hat in the Hats tree under this role.
        </FormHelperText>
      </FormControl>

      <HStack spacing={4}>
        <FormControl>
          <FormLabel color="gray.200" fontSize="sm">Max Wearers</FormLabel>
          <NumberInput
            min={1}
            max={4294967295}
            value={rc.maxSupply}
            onChange={(_, value) => update({ maxSupply: Number.isFinite(value) ? value : rc.maxSupply })}
          >
            <NumberInputField {...inputStyles} />
            <NumberInputStepper>
              <NumberIncrementStepper color="gray.300" />
              <NumberDecrementStepper color="gray.300" />
            </NumberInputStepper>
          </NumberInput>
        </FormControl>

        <FormControl>
          <FormLabel color="gray.200" fontSize="sm">Image URL (optional)</FormLabel>
          <Input
            placeholder="https://…"
            value={rc.imageURI}
            onChange={(e) => update({ imageURI: e.target.value })}
            {...inputStyles}
          />
        </FormControl>
      </HStack>

      <HStack justify="space-between">
        <Box>
          <Text color="gray.200" fontSize="sm" fontWeight="medium">Mutable hat</Text>
          <Text color="gray.500" fontSize="xs">Can the hat's details / supply be changed after creation?</Text>
        </Box>
        <Switch
          colorScheme="purple"
          isChecked={Boolean(rc.mutable)}
          onChange={(e) => update({ mutable: e.target.checked })}
        />
      </HStack>

      {concurrentProposalForParent ? (
        <Alert status="warning" borderRadius="md" variant="left-accent">
          <AlertIcon />
          <Box>
            <Text fontSize="sm" fontWeight="bold">
              Concurrent role-creation under the same parent
            </Text>
            <Text fontSize="xs">
              "{concurrentProposalForParent.name || 'Another'}" is already pending under{' '}
              <b>{parentRoleName}</b>. If both votes pass, this proposal may misconfigure the
              new role. Wait for that one to resolve, or pick a different parent.
            </Text>
          </Box>
        </Alert>
      ) : null}

      <HStack justify="flex-end">
        <Button
          rightIcon={<FiChevronRight />}
          colorScheme="purple"
          size="sm"
          isDisabled={!rc.parentHatId || !rc.name?.trim() || Number(rc.maxSupply) < 1}
          onClick={() => setStep(2)}
        >
          Next: Permissions
        </Button>
      </HStack>
    </VStack>
  );

  /*════════════════════════════ STEP 2 ════════════════════════════*/
  const renderStep2 = () => (
    <VStack align="stretch" spacing={4}>
      <StepHeader
        step={2}
        title="Permissions & vouching"
        subtitle="Who can hold the role and what they can do"
        onBack={() => setStep(1)}
      />

      {/*──────────────── GOVERNANCE ────────────────*/}
      <SectionLabel>Governance</SectionLabel>
      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(148, 115, 220, 0.2)"
      >
        <HStack justify="space-between">
          <Box>
            <Text color="gray.200" fontSize="sm" fontWeight="medium">
              Members can create governance proposals
            </Text>
            <Text color="gray.500" fontSize="xs">
              Adds the new role to HybridVoting's creator-hat allowlist.
            </Text>
          </Box>
          <Switch
            colorScheme="purple"
            isChecked={Boolean(rc.canVote)}
            onChange={(e) => update({ canVote: e.target.checked })}
          />
        </HStack>
      </Box>

      {/*──────────────── TASK SYSTEM ────────────────*/}
      <SectionLabel>Task system</SectionLabel>
      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(148, 115, 220, 0.2)"
      >
        <VStack align="stretch" spacing={2}>
          <Box>
            <Text color="gray.200" fontSize="sm" fontWeight="medium">Global task permissions</Text>
            <Text color="gray.500" fontSize="xs">
              Applies to every project, including ones created later. Per-project grants below override these.
            </Text>
          </Box>
          <PermissionMaskCheckboxes mask={rc.globalPerms} onToggle={handleGlobalPermToggle} />
          <Text color="gray.500" fontSize="2xs">
            EDIT_FULL already includes EDIT_META. SELF_REVIEW only applies alongside REVIEW.
          </Text>
        </VStack>
      </Box>

      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(148, 115, 220, 0.2)"
      >
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Box>
              <Text color="gray.200" fontSize="sm" fontWeight="medium">Can create projects &amp; tasks</Text>
              <Text color="gray.500" fontSize="xs">Org-wide permission to create new projects and tasks.</Text>
            </Box>
            <Switch
              colorScheme="purple"
              isChecked={Boolean(rc.canCreateTasks)}
              onChange={(e) => update({ canCreateTasks: e.target.checked })}
            />
          </HStack>
          <HStack justify="space-between">
            <Box>
              <Text color="gray.200" fontSize="sm" fontWeight="medium">Can organize the folder tree</Text>
              <Text color="gray.500" fontSize="xs">Group and reorder projects by publishing folder-tree updates.</Text>
            </Box>
            <Switch
              colorScheme="purple"
              isChecked={Boolean(rc.canOrganizeFolders)}
              onChange={(e) => update({ canOrganizeFolders: e.target.checked })}
            />
          </HStack>
        </VStack>
      </Box>

      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(148, 115, 220, 0.2)"
      >
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between" align="center">
            <Box>
              <Text color="gray.200" fontSize="sm" fontWeight="medium">Per-project permissions (optional)</Text>
              <Text color="gray.500" fontSize="xs">
                Override the global permissions above for a specific project.
              </Text>
            </Box>
            <Button
              size="xs"
              leftIcon={<AddIcon boxSize={2.5} />}
              variant="ghost"
              color="purple.300"
              onClick={handleAddProjectPerm}
              isDisabled={(allProjects || []).length === 0}
            >
              Add project
            </Button>
          </HStack>

          {(rc.projectPerms || []).length === 0 ? (
            <EmptyBox>
              No per-project overrides. Add one to grant task access on a specific project only.
            </EmptyBox>
          ) : (
            <VStack align="stretch" spacing={3}>
              {(rc.projectPerms || []).map((p, idx) => (
                <Box
                  key={idx}
                  p={3}
                  borderRadius="md"
                  bg="whiteAlpha.50"
                  border="1px solid rgba(148, 115, 220, 0.15)"
                >
                  <VStack align="stretch" spacing={2}>
                    <HStack>
                      <Select
                        size="sm"
                        value={p.projectId || ''}
                        onChange={(e) => handleProjectPickerChange(idx, e.target.value)}
                        placeholder="Select project"
                        {...inputStyles}
                      >
                        {(allProjects || []).map(proj => (
                          <option key={proj.id} value={proj.id} style={{ background: '#1a1a2e' }}>
                            {proj.name || proj.title || proj.id.slice(0, 10)}
                          </option>
                        ))}
                      </Select>
                      <IconButton
                        aria-label="Remove project permission"
                        icon={<DeleteIcon boxSize={3} />}
                        size="sm"
                        variant="ghost"
                        color="gray.400"
                        _hover={{ color: 'red.300', bg: 'whiteAlpha.100' }}
                        onClick={() => handleRemoveProjectPerm(idx)}
                      />
                    </HStack>
                    <PermissionMaskCheckboxes
                      mask={p.mask}
                      onToggle={(permValue) => handlePermMaskToggle(idx, permValue)}
                    />
                  </VStack>
                </Box>
              ))}
            </VStack>
          )}
        </VStack>
      </Box>

      {/*──────────────── MEMBERSHIP & VOUCHING ────────────────*/}
      <SectionLabel>Membership &amp; vouching</SectionLabel>
      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(148, 115, 220, 0.2)"
      >
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Box>
              <Text color="gray.200" fontSize="sm" fontWeight="medium">Default eligible</Text>
              <Text color="gray.500" fontSize="xs">Wearers start eligible to hold the hat.</Text>
            </Box>
            <Switch
              colorScheme="purple"
              isChecked={Boolean(rc.defaultEligible)}
              onChange={(e) => update({ defaultEligible: e.target.checked })}
            />
          </HStack>
          <HStack justify="space-between">
            <Box>
              <Text color="gray.200" fontSize="sm" fontWeight="medium">Default in good standing</Text>
              <Text color="gray.500" fontSize="xs">Wearers start with good standing flag set.</Text>
            </Box>
            <Switch
              colorScheme="purple"
              isChecked={Boolean(rc.defaultStanding)}
              onChange={(e) => update({ defaultStanding: e.target.checked })}
            />
          </HStack>
        </VStack>
      </Box>

      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(148, 115, 220, 0.2)"
      >
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Box>
              <Text color="gray.200" fontSize="sm" fontWeight="medium">Enable vouching</Text>
              <Text color="gray.500" fontSize="xs">
                New wearers must collect vouches from a chosen role before claiming.
              </Text>
            </Box>
            <Switch
              colorScheme="purple"
              isChecked={Boolean(rc.vouching?.enabled)}
              onChange={(e) => updateVouching({ enabled: e.target.checked })}
            />
          </HStack>

          {rc.vouching?.enabled ? (
            <VStack align="stretch" spacing={3} pt={2}>
              <FormControl>
                <FormLabel color="gray.200" fontSize="sm">Vouches required (quorum)</FormLabel>
                <NumberInput
                  min={1}
                  max={1000}
                  value={rc.vouching.quorum}
                  onChange={(_, value) => updateVouching({ quorum: Number.isFinite(value) ? value : rc.vouching.quorum })}
                >
                  <NumberInputField {...inputStyles} />
                  <NumberInputStepper>
                    <NumberIncrementStepper color="gray.300" />
                    <NumberDecrementStepper color="gray.300" />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>

              <FormControl>
                <FormLabel color="gray.200" fontSize="sm">Voucher role</FormLabel>
                <Select
                  value={rc.vouching.selfVouch ? SENTINEL_SELF_VOUCH : (rc.vouching.voucherHatId || '')}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === SENTINEL_SELF_VOUCH) {
                      updateVouching({ selfVouch: true, voucherHatId: '' });
                    } else {
                      updateVouching({ selfVouch: false, voucherHatId: v });
                    }
                  }}
                  placeholder="Select voucher role"
                  {...inputStyles}
                >
                  <option value={SENTINEL_SELF_VOUCH} style={{ background: '#1a1a2e' }}>
                    This role vouches for itself
                  </option>
                  {allRoles.map(role => (
                    <option key={role.hatId} value={role.hatId} style={{ background: '#1a1a2e' }}>
                      {role.name}
                    </option>
                  ))}
                </Select>
                <FormHelperText color="gray.500">
                  Whose vouches count toward the quorum. Self-vouch means existing wearers vouch.
                </FormHelperText>
              </FormControl>

              <HStack justify="space-between">
                <Box>
                  <Text color="gray.200" fontSize="sm" fontWeight="medium">Combine with hierarchy</Text>
                  <Text color="gray.500" fontSize="xs">
                    OR vouching with the existing hat-admin chain (recommended off).
                  </Text>
                </Box>
                <Switch
                  colorScheme="purple"
                  isChecked={Boolean(rc.vouching.combineWithHierarchy)}
                  onChange={(e) => updateVouching({ combineWithHierarchy: e.target.checked })}
                />
              </HStack>
            </VStack>
          ) : null}
        </VStack>
      </Box>

      {/* Sub-step move only — named after where it lands so it never reads as
          the wizard's Next in the modal footer just below. Going back up a
          sub-step is the header's Back; a second plain "Back" down here sat
          directly on top of the wizard's own. */}
      <HStack justify="flex-end">
        <Button
          rightIcon={<FiChevronRight />}
          colorScheme="purple"
          size="sm"
          onClick={() => setStep(3)}
        >
          Next: Initial wearers
        </Button>
      </HStack>
    </VStack>
  );

  /*════════════════════════════ STEP 3 ════════════════════════════*/
  const renderStep3 = () => (
    <VStack align="stretch" spacing={4}>
      <StepHeader
        step={3}
        title="Initial wearers"
        subtitle="People who get the role immediately (optional)"
        onBack={() => setStep(2)}
      />

      <InputGroup>
        <InputLeftElement pointerEvents="none">
          <Icon as={FiSearch} color="gray.400" />
        </InputLeftElement>
        <Input
          placeholder="Search members by name or address"
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
          {...inputStyles}
        />
      </InputGroup>

      {availableMembers.length === 0 ? (
        <EmptyBox>
          {memberSearch
            ? 'No members match this search.'
            : 'No members available — try the manual entry option below.'}
        </EmptyBox>
      ) : (
        <VStack align="stretch" spacing={1} maxH="200px" overflowY="auto">
          {availableMembers.map(member => (
            <HStack
              key={member.address}
              p={2}
              borderRadius="md"
              bg="whiteAlpha.50"
              border="1px solid rgba(148, 115, 220, 0.15)"
              justify="space-between"
              cursor="pointer"
              _hover={{ bg: 'whiteAlpha.100', borderColor: 'purple.400' }}
              onClick={() => handleAddMember(member)}
            >
              <VStack align="start" spacing={0}>
                <Text fontSize="sm" color="white" fontWeight="medium">{member.name}</Text>
                <Text fontSize="xs" color="gray.400" fontFamily="mono">
                  {member.address.slice(0, 6)}…{member.address.slice(-4)}
                </Text>
              </VStack>
              <Icon as={FiUserPlus} color="purple.300" />
            </HStack>
          ))}
        </VStack>
      )}

      <Box>
        {showManualEntry ? (
          <VStack
            align="stretch"
            spacing={2}
            p={3}
            borderRadius="md"
            bg="whiteAlpha.50"
            border="1px solid rgba(148, 115, 220, 0.2)"
          >
            <Text fontSize="xs" color="gray.300" fontWeight="medium">Add by address</Text>
            <HStack>
              <Input
                placeholder="Display name (optional)"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                {...inputStyles}
              />
              <Input
                placeholder="0x…"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                {...inputStyles}
              />
            </HStack>
            <HStack justify="flex-end">
              <Button size="xs" variant="ghost" color="gray.300" onClick={() => {
                setShowManualEntry(false);
                setManualName('');
                setManualAddress('');
              }}>
                Cancel
              </Button>
              <Button
                size="xs"
                colorScheme="purple"
                onClick={handleAddManualWearer}
                isDisabled={!utils.isAddress(manualAddress.trim())}
              >
                Add wearer
              </Button>
            </HStack>
          </VStack>
        ) : (
          <Button
            size="xs"
            leftIcon={<AddIcon boxSize={2.5} />}
            variant="ghost"
            color="purple.300"
            onClick={() => setShowManualEntry(true)}
          >
            Add by address
          </Button>
        )}
      </Box>

      <Box>
        <Text fontSize="xs" color="gray.400" mb={2} textTransform="uppercase" letterSpacing="wide">
          Initial wearers ({(rc.initialWearers || []).length})
        </Text>
        {(rc.initialWearers || []).length === 0 ? (
          <EmptyBox>
            No initial wearers. The role will be created empty — members can be added later via mint proposals or by claiming if vouching is configured.
          </EmptyBox>
        ) : (
          <VStack align="stretch" spacing={1}>
            {(rc.initialWearers || []).map((w, idx) => (
              <HStack
                key={`${w.address}-${idx}`}
                p={2}
                borderRadius="md"
                bg="whiteAlpha.50"
                border="1px solid rgba(148, 115, 220, 0.2)"
                justify="space-between"
              >
                <VStack align="start" spacing={0}>
                  <Text fontSize="sm" color="white" fontWeight="medium">
                    {w.name || 'Unnamed'}
                    <Badge ml={2} colorScheme="purple" fontSize="2xs">wearer</Badge>
                  </Text>
                  <Text fontSize="xs" color="gray.400" fontFamily="mono">
                    {w.address.slice(0, 6)}…{w.address.slice(-4)}
                  </Text>
                </VStack>
                <IconButton
                  aria-label="Remove wearer"
                  icon={<DeleteIcon boxSize={3} />}
                  size="sm"
                  variant="ghost"
                  color="gray.400"
                  _hover={{ color: 'red.300', bg: 'whiteAlpha.100' }}
                  onClick={() => handleRemoveWearer(idx)}
                />
              </HStack>
            ))}
          </VStack>
        )}
      </Box>

      {/* Last sub-step, so deliberately no button here: the wizard footer's
          Next carries on to the vote details. This used to be a lone Back,
          which made the sub-step look like a dead end. */}
      <Text fontSize="xs" color="gray.500" textAlign="right">
        Initial wearers are optional — use Next below when you're done.
      </Text>
    </VStack>
  );

  /*════════════════════════════ LIVE PREVIEW ════════════════════════════*/
  const renderPreview = () => {
    if (!rc.name || !rc.parentHatId) return null;
    const lines = [];
    lines.push(
      <Text key="create" fontSize="sm" color="green.300">
        ✓ Create role <b>{rc.name}</b> under <b>{parentRoleName || `hat ${rc.parentHatId.slice?.(0, 8) || rc.parentHatId}`}</b> (max {rc.maxSupply})
      </Text>
    );
    if (rc.vouching?.enabled) {
      const q = Number(rc.vouching.quorum) || 1;
      lines.push(
        <Text key="vouch" fontSize="sm" color="green.300">
          ✓ Require <b>{q}</b> vouch{q > 1 ? 'es' : ''} from <b>{voucherRoleName || 'selected role'}</b> to claim
        </Text>
      );
    }
    if (rc.canVote) {
      lines.push(
        <Text key="canvote" fontSize="sm" color="green.300">
          ✓ Members of <b>{rc.name}</b> can create governance proposals
        </Text>
      );
    }
    if (Number(rc.globalPerms) > 0) {
      lines.push(
        <Text key="globalperms" fontSize="sm" color="green.300">
          ✓ Grant <b>{maskLabels(rc.globalPerms).join(', ')}</b> on <b>all projects</b> (org-wide)
        </Text>
      );
    }
    if (rc.canCreateTasks) {
      lines.push(
        <Text key="cancreate" fontSize="sm" color="green.300">
          ✓ Members of <b>{rc.name}</b> can create projects &amp; tasks
        </Text>
      );
    }
    if (rc.canOrganizeFolders) {
      lines.push(
        <Text key="canorganize" fontSize="sm" color="green.300">
          ✓ Members can reorganize the task folder tree
        </Text>
      );
    }
    if (rc.description?.trim() && rc.mutable) {
      lines.push(
        <Text key="desc" fontSize="sm" color="green.300">
          ✓ Save role description on-chain (Hats metadata via IPFS)
        </Text>
      );
    }
    const wearerCount = (rc.initialWearers || []).length;
    if (wearerCount > 0) {
      lines.push(
        <Text key="mint" fontSize="sm" color="green.300">
          ✓ Mint to <b>{wearerCount}</b> initial wearer{wearerCount > 1 ? 's' : ''}
        </Text>
      );
    }
    const projectPerms = rc.projectPerms || [];
    if (projectPerms.length > 0) {
      projectPerms.forEach((p, i) => {
        const labels = maskLabels(p.mask);
        if (labels.length > 0) {
          lines.push(
            <Text key={`proj-${i}`} fontSize="sm" color="green.300">
              ✓ Grant <b>{labels.join(', ')}</b> on project <b>{p.projectName || p.projectId?.slice(0, 10)}</b>
            </Text>
          );
        }
      });
    }

    return (
      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(56, 178, 172, 0.4)"
      >
        <Text fontSize="xs" color="teal.300" fontWeight="bold" textTransform="uppercase" letterSpacing="wide" mb={2}>
          If this vote passes:
        </Text>
        <VStack align="stretch" spacing={1}>
          {lines}
        </VStack>
      </Box>
    );
  };

  /*════════════════════════════ RENDER ════════════════════════════*/
  return (
    <VStack align="stretch" spacing={5}>
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {renderPreview()}
    </VStack>
  );
};

export default RoleConfigurator;
