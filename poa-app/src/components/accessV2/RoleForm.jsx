/** Shared, controlled v2 role/group creation form. The review uses the proposal encoder so
 * the displayed changes and submitted contract calls always describe the same configuration. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  NumberInput,
  NumberInputField,
  Progress,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  VStack,
  Wrap,
  WrapItem,
  Checkbox,
} from '@chakra-ui/react';
import { FiArrowLeft, FiChevronRight, FiPlus, FiTrash2 } from 'react-icons/fi';
import UserSearchInput from '@/components/common/UserSearchInput';
import { STICKY_COPY } from '@/lib/accessV2/rules';
import { predictLints } from '@/lib/accessV2/vouch';
import {
  ROLE_FORM_KIND,
  buildRoleFormBatch,
  contractClassIndex,
  effectiveMaxMembers,
  normalizeRoleForm,
  resolveBindingClassIdx,
  roleFormError,
} from '@/lib/accessV2/roleFormBatch';
import { classLabel } from '@/lib/voting/votingClasses';
import { canSetOrgMetadataAdmin } from '@/lib/accessV2/orgAdmin';
import PermissionPicker from '@/components/accessV2/PermissionPicker';
import InviteListInput from '@/components/accessV2/roleForm/InviteListInput';
import SponsorshipSettings from '@/components/accessV2/roleForm/SponsorshipSettings';
import ManagerSettings from '@/components/accessV2/roleForm/ManagerSettings';
import InheritedPermissions from '@/components/accessV2/roleForm/InheritedPermissions';
import ProjectPermRows from '@/components/accessV2/roleForm/ProjectPermRows';
import { tokensFor } from '@/components/accessV2/roleForm/formTokens';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** The steps, in order. `people` and the vouching block are role-only; a group has no members. */
const ALL_STEPS = ['basics', 'membership', 'permissions', 'joining', 'people', 'review'];

const STEP_LABEL = {
  basics: 'Details',
  membership: { role: 'Groups', group: 'Roles' },
  permissions: 'Permissions',
  joining: 'Joining',
  people: 'People',
  review: 'Review',
};

const stepLabel = (step, kind) => {
  const label = STEP_LABEL[step];
  return typeof label === 'string' ? label : label[kind] || label.role;
};

const stepsFor = (kind) => ALL_STEPS.filter((s) => (kind === ROLE_FORM_KIND.GROUP ? s !== 'people' && s !== 'joining' : true));

/**
 * Which step a validation error belongs to, so Next can refuse on the screen that owns the answer
 * rather than letting a bad row surface three steps later on Review.
 */
function stepError(step, form) {
  const error = roleFormError(form);
  if (!error) return null;
  const onBasics = /name|seat limit/i.test(error);
  const onPeople = /address|listed twice|invited email/i.test(error) && !/domain|open/i.test(error);
  const onPermissions = /project|group of voters|sponsor|epoch|gas cap|manager|management|delay/i.test(error) && !onPeople;
  const onJoining = /vouch|domain|open|email eligibility/i.test(error);

  if (step === 'basics') return onBasics ? error : null;
  if (step === 'permissions') return onPermissions ? error : null;
  if (step === 'joining') return onJoining ? error : null;
  if (step === 'people') return onPeople ? error : null;
  // Review is the last gate: it owns everything, including an error whose own step was skipped
  // (a group never sees People, and a stale row there would otherwise be un-fixable).
  if (step === 'review') return error;
  return null;
}

const shortAddress = (a) => (String(a || '').length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : String(a || ''));

/**
 * `onStatus({ atReview, blocked })` tells a host that wraps this form in its own step machine
 * (the vote wizard) where the member is: the host hides its own Next until `atReview`, so there
 * is exactly one Next on screen, and refuses to submit while `blocked` names a reason.
 */
export default function RoleForm({ value, onChange, ctx = {}, variant = 'light', onStatus = null, navigationTarget = null, onBackToType = null }) {
  const t = tokensFor(variant);
  const form = useMemo(() => normalizeRoleForm(value), [value]);
  const isGroup = form.kind === ROLE_FORM_KIND.GROUP;

  const steps = useMemo(() => stepsFor(form.kind), [form.kind]);
  // Resume rather than restart. The vote wizard unmounts this whole screen on the way to the
  // details step, so a member who presses Back would otherwise be dropped at question one of a
  // form they had already finished — same reason RoleConfigurator opens on its second step when
  // it already has an answer. A restored draft lands here too.
  const [step, setStep] = useState(() => (String(value?.name || '').trim() ? 'review' : 'basics'));
  const stepIndex = Math.max(0, steps.indexOf(step));
  const current = steps[stepIndex] || 'basics';

  const [manualAddress, setManualAddress] = useState('');

  const update = useCallback(
    (changes) => onChange?.({ ...form, ...changes }),
    [form, onChange]
  );

  const {
    roles = [],
    groups = [],
    projects = [],
    votingClasses = [],
    inOrgUsers = null,
  } = ctx || {};

  const inOrg = inOrgUsers instanceof Set ? inOrgUsers : new Set(inOrgUsers || []);

  // The review preview comes from the SAME encoder that will build the proposal, so the sentences
  // on screen are the sentences that go into the proposal's metadata — not a second description of
  // what we hope it does.
  const preview = useMemo(() => {
    if (current !== 'review' || !String(form.name || '').trim()) return {};
    if (!ctx?.authority) return { error: 'Loading this org’s roles and settings…' };
    try {
      return { built: buildRoleFormBatch({
        ...ctx,
        preview: true,
        authority: ctx.authority,
        hybridVoting: ctx.hybridVoting || '',
        taskManagerAddress: ctx.taskManagerAddress || '',
        indexedSubjects: ctx.indexedSubjects || [],
        activeProposals: ctx.activeProposals || [],
        inOrgUsers: inOrg,
        votingClasses,
        form,
      }) };
    } catch (error) {
      return { error: error?.message || 'The proposal preview could not be prepared. Try again.' };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, form, ctx, votingClasses]);

  const built = preview.built;
  const currentError = stepError(current, form);
  const reviewError = currentError || preview.error
    || (built?.submittable && !built.submittable.ok ? built.submittable.message : null);

  useEffect(() => {
    if (!onStatus) return undefined;
    onStatus({
      atReview: current === 'review',
      blocked: current === 'review' ? reviewError : null,
    });
    return () => onStatus({ atReview: false, blocked: null });
  }, [current, reviewError, onStatus]);

  const classOptions = useMemo(
    () => (votingClasses || []).map((c, i) => ({
      idx: contractClassIndex(votingClasses, i),
      label: classLabel(c, i),
    })),
    [votingClasses]
  );
  const defaultClassIdx = resolveBindingClassIdx({ bindingVote: true, bindingClassIdx: null }, votingClasses);

  // The contract's own config-time lints, shown next to the toggles that cause them — this is the
  // only moment anyone can act on them (on chain they arrive as events AFTER the write). The
  // subject has no id yet, so self-vouching is matched with a sentinel on both sides; the review
  // screen re-runs the same lints against the real predicted id.
  const vouchLints = useMemo(
    () => predictLints({
      defaultAllow: form.openRole,
      vouchQuorum: form.vouching?.enabled ? Number(form.vouching.quorum) || 1 : 0,
      maxMembers: effectiveMaxMembers(form),
      hasStrongPerms: false,
      voucherSubjectId: form.vouching?.selfVouch ? 'self' : form.vouching?.voucherSubjectId,
      subjectId: form.vouching?.selfVouch ? 'self' : '',
    }),
    [form]
  );

  const addHolder = (address, name = '') => {
    if (!ADDRESS_RE.test(address)) return;
    if ((form.holders || []).some((h) => String(h.address).toLowerCase() === address.toLowerCase())) return;
    update({ holders: [...(form.holders || []), { address, name, sticky: false }] });
  };

  const toggleId = (list, id) => (
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  );

  const sectionHelp = (children) => (
    <Text fontSize="sm" color={t.help}>{children}</Text>
  );

  const navigation = (
    <HStack justify="space-between" w="full">
      <Button
        variant="ghost"
        color={t.help}
        leftIcon={<FiArrowLeft />}
        isDisabled={stepIndex === 0 && !onBackToType}
        data-testid="role-form-back"
        onClick={() => stepIndex === 0 ? onBackToType?.() : setStep(steps[stepIndex - 1])}
      >
        Back
      </Button>
      {stepIndex < steps.length - 1 && (
        <Button
          colorScheme={t.accent}
          rightIcon={<FiChevronRight />}
          isDisabled={Boolean(currentError)}
          data-testid="role-form-next"
          onClick={() => setStep(steps[stepIndex + 1])}
        >
          Next: {stepLabel(steps[stepIndex + 1], form.kind)}
        </Button>
      )}
    </HStack>
  );

  return (
    <VStack align="stretch" spacing={5} data-testid="role-form">
      <Box>
        <Progress
          aria-label="Role creation progress"
          value={((stepIndex + 1) / steps.length) * 100}
          size="xs"
          colorScheme={t.accent}
          bg={t.panelBorder}
          borderRadius="full"
        />
        <Text fontSize="xs" color={t.help} mt={2}>
          Step {stepIndex + 1} of {steps.length} — {stepLabel(current, form.kind)}
        </Text>
        <Wrap spacing={1} mt={2} aria-label="Creation steps">
          {steps.map((item, index) => (
            <WrapItem key={item}>
              <Button
                size="xs"
                variant={item === current ? 'solid' : 'ghost'}
                colorScheme={item === current ? t.accent : undefined}
                color={item === current ? undefined : t.help}
                isDisabled={index > stepIndex}
                _disabled={{ opacity: 1, color: t.help, cursor: 'default' }}
                aria-current={item === current ? 'step' : undefined}
                onClick={() => setStep(item)}
              >
                {stepLabel(item, form.kind)}
              </Button>
            </WrapItem>
          ))}
        </Wrap>
      </Box>

      {/* ── BASICS ─────────────────────────────────────────────────────────── */}
      {current === 'basics' && (
        <VStack align="stretch" spacing={5}>
          <FormControl>
            <FormLabel color={t.label} fontSize="sm">What are you making?</FormLabel>
            <RadioGroup value={form.kind} onChange={(kind) => update({ kind })}>
              <Stack spacing={3}>
                <Radio
                  value={ROLE_FORM_KIND.ROLE}
                  colorScheme={t.accent}
                  alignItems="flex-start"
                  data-testid="role-form-kind-role"
                >
                  <VStack align="start" spacing={0} ml={1}>
                    <Text fontSize="sm" fontWeight="medium" color={t.label}>A role</Text>
                    <Text fontSize="xs" color={t.help}>
                      Something people hold — Treasurer, Reviewer, Member.
                    </Text>
                  </VStack>
                </Radio>
                <Radio
                  value={ROLE_FORM_KIND.GROUP}
                  colorScheme={t.accent}
                  alignItems="flex-start"
                  data-testid="role-form-kind-group"
                >
                  <VStack align="start" spacing={0} ml={1}>
                    <Text fontSize="sm" fontWeight="medium" color={t.label}>A group</Text>
                    <Text fontSize="xs" color={t.help}>
                      A bundle of permissions. Roles go into it and pick up everything it gives —
                      change the group once and every role in it changes.
                    </Text>
                  </VStack>
                </Radio>
              </Stack>
            </RadioGroup>
          </FormControl>

          <FormControl isRequired>
            <FormLabel color={t.label} fontSize="sm">Name</FormLabel>
            <Input
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder={isGroup ? 'e.g. Core team' : 'e.g. Treasurer'}
              data-testid="role-form-name"
              {...t.input}
            />
          </FormControl>

          <FormControl>
            <FormLabel color={t.label} fontSize="sm">Description</FormLabel>
            <Textarea
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder={isGroup ? 'What is this group for?' : 'What does this role do?'}
              data-testid="role-form-description"
              {...t.input}
            />
          </FormControl>

          <FormControl>
            <FormLabel color={t.label} fontSize="sm">Image</FormLabel>
            <Input
              value={form.imageURI}
              onChange={(e) => update({ imageURI: e.target.value })}
              placeholder="ipfs://… (optional)"
              data-testid="role-form-image"
              {...t.input}
            />
          </FormControl>

          {!isGroup && (
            <>
              <HStack justify="space-between" align="flex-start">
                <Box pr={4}>
                  <Text fontSize="sm" fontWeight="medium" color={t.label}>Limit the number of seats</Text>
                  <Text fontSize="xs" color={t.help}>Off means as many people as you like.</Text>
                </Box>
                <Switch
                  isChecked={form.limitSeats}
                  onChange={(e) => update({ limitSeats: e.target.checked })}
                  colorScheme={t.accent}
                  aria-label="Limit the number of seats"
                  data-testid="role-form-limit-seats"
                />
              </HStack>

              {form.limitSeats && (
                <FormControl>
                  <FormLabel fontSize="xs" color={t.help} mb={1}>How many seats</FormLabel>
                  <NumberInput
                    min={1}
                    max={4294967295}
                    value={form.maxMembers}
                    onChange={(_, n) => update({ maxMembers: Number.isFinite(n) ? n : form.maxMembers })}
                  >
                    <NumberInputField data-testid="role-form-seat-limit" {...t.input} />
                  </NumberInput>
                </FormControl>
              )}
            </>
          )}
        </VStack>
      )}

      {/* ── GROUPS / MEMBER ROLES ──────────────────────────────────────────── */}
      {current === 'membership' && (
        <VStack align="stretch" spacing={4}>
          {isGroup ? (
            <>
              {sectionHelp(
                'Which roles are in this group. Every one of them gets the permissions you set on '
                + 'the next screen — and loses them if it leaves.'
              )}
              {roles.length === 0 ? (
                <Alert status="info" borderRadius="md" fontSize="sm">
                  <AlertIcon />
                  This group has no roles yet. You can add them later.
                </Alert>
              ) : (
                <Wrap>
                  {roles.map((r) => {
                    const on = (form.memberRoleIds || []).includes(r.subjectId);
                    return (
                      <WrapItem key={r.subjectId}>
                        <Button
                          size="sm"
                          height="auto"
                          py={2}
                          whiteSpace="normal"
                          aria-pressed={on}
                          colorScheme={on ? t.accent : 'gray'}
                          variant={on ? 'solid' : 'outline'}
                          data-testid={`role-form-member-role-${r.subjectId}`}
                          onClick={() => update({ memberRoleIds: toggleId(form.memberRoleIds || [], r.subjectId) })}
                        >
                          {r.name || 'Untitled'}
                        </Button>
                      </WrapItem>
                    );
                  })}
                </Wrap>
              )}
            </>
          ) : (
            <>
              {sectionHelp(
                'Groups bundle permissions. A role in a group gets everything the group gives, on '
                + 'top of its own permissions.'
              )}
              {groups.length === 0 ? (
                <Alert status="info" borderRadius="md" fontSize="sm">
                  <AlertIcon />
                  This org has no groups yet. You can put this role in one later.
                </Alert>
              ) : (
                <Wrap>
                  {groups.map((g) => {
                    const on = (form.groupIds || []).includes(g.subjectId);
                    return (
                      <WrapItem key={g.subjectId}>
                        <Button
                          size="sm"
                          height="auto"
                          py={2}
                          whiteSpace="normal"
                          aria-pressed={on}
                          colorScheme={on ? t.accent : 'gray'}
                          variant={on ? 'solid' : 'outline'}
                          data-testid={`role-form-group-${g.subjectId}`}
                          onClick={() => update({ groupIds: toggleId(form.groupIds || [], g.subjectId) })}
                        >
                          {g.name || 'Untitled'}
                        </Button>
                      </WrapItem>
                    );
                  })}
                </Wrap>
              )}
            </>
          )}
        </VStack>
      )}

      {/* ── PERMISSIONS ────────────────────────────────────────────────────── */}
      {current === 'permissions' && (
        <VStack align="stretch" spacing={5}>
          {sectionHelp(
            isGroup
              ? 'What every role in this group can do. This is on top of whatever those roles '
                + 'already have.'
              : 'What this role can do. Anything its groups already give is on top of this.'
          )}

          <PermissionPicker
            value={form.perms}
            onChange={(perms) => update({ perms })}
            variant={variant}
            groupExtras={{
              'Polls & votes': (
                <Box>
                  <HStack justify="space-between" align="flex-start">
                    <Box pr={4}>
                      <Text fontSize="sm" fontWeight="medium" color={t.label}>
                        Vote in binding votes
                      </Text>
                      <Text fontSize="xs" color={t.help}>
                        Give members voting power in the selected voting class. A person holding several
                        roles in the same class is counted once. Their other roles keep their existing voting power.
                      </Text>
                    </Box>
                    <Switch
                      isChecked={form.bindingVote}
                      onChange={(e) => update({
                        bindingVote: e.target.checked,
                        // Default to the one-member-one-vote class the moment it is turned on, so the
                        // picker is never a required field nobody knew to answer.
                        bindingClassIdx: e.target.checked
                          ? (form.bindingClassIdx ?? (defaultClassIdx >= 0 ? defaultClassIdx : null))
                          : null,
                      })}
                      colorScheme={t.accent}
                      isDisabled={classOptions.length === 0}
                      aria-label="Vote in binding votes"
                      data-testid="role-form-class-vote"
                    />
                  </HStack>

                  {classOptions.length === 0 ? (
                    <Alert status="info" borderRadius="md" fontSize="sm" mt={3}>
                      <AlertIcon />
                      This org has no binding voting classes configured yet.
                    </Alert>
                  ) : form.bindingVote && (
                    <FormControl mt={3}>
                      <FormLabel color={t.label} fontSize="sm">Voting class</FormLabel>
                      <Select
                        value={form.bindingClassIdx ?? ''}
                        onChange={(e) => update({ bindingClassIdx: e.target.value === '' ? null : Number(e.target.value) })}
                        placeholder="Choose a voting class"
                        data-testid="role-form-class-select"
                        {...t.input}
                      >
                        {classOptions.map((c) => (
                          <option key={c.idx} value={c.idx} style={{ background: t.optionBg }}>
                            {c.label}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </Box>
              ),
              Organization: (
                <Checkbox
                  isChecked={form.editOrgDetails}
                  colorScheme={t.accent}
                  alignItems="flex-start"
                  onChange={(e) => update({ editOrgDetails: e.target.checked })}
                  data-testid="role-form-edit-org-details"
                >
                  <VStack align="start" spacing={0} ml={1}>
                    <Text fontSize="sm" fontWeight="medium" color={t.label}>Edit org details</Text>
                    <Text fontSize="xs" color={t.help}>
                      Update the org’s name, description and image. This replaces the org’s current
                      editing role with this {isGroup ? 'group' : 'role'}.
                    </Text>
                    {form.editOrgDetails && !canSetOrgMetadataAdmin(ctx) && (
                      <Text fontSize="xs" color={t.help}>Loading the org registry. This must be available before submitting.</Text>
                    )}
                  </VStack>
                </Checkbox>
              ),
            }}
          />

          {!isGroup && (
            <InheritedPermissions
              groups={groups.filter((g) => form.groupIds.includes(g.subjectId))}
              variant={variant}
            />
          )}

          <Divider borderColor={t.panelBorder} />

          <ProjectPermRows
            rows={form.projectPerms}
            onChange={(projectPerms) => update({ projectPerms })}
            projects={projects}
            variant={variant}
          />

          <Divider borderColor={t.panelBorder} />

          <VStack align="stretch" spacing={3}>
            <Text fontSize="xs" fontWeight="bold" color={t.help} textTransform="uppercase">
              Projects and folders
            </Text>
            <HStack justify="space-between" align="flex-start">
              <Box pr={4}>
                <Text fontSize="sm" fontWeight="medium" color={t.label}>Create projects and tasks</Text>
                <Text fontSize="xs" color={t.help}>
                  Start new projects and add tasks to any of them.
                </Text>
              </Box>
              <Switch
                isChecked={form.canCreateTasks}
                onChange={(e) => update({ canCreateTasks: e.target.checked })}
                colorScheme={t.accent}
                aria-label="Create projects and tasks"
                data-testid="role-form-create-tasks"
              />
            </HStack>
            <HStack justify="space-between" align="flex-start">
              <Box pr={4}>
                <Text fontSize="sm" fontWeight="medium" color={t.label}>Organise the folders</Text>
                <Text fontSize="xs" color={t.help}>
                  Rearrange the project folder tree.
                </Text>
              </Box>
              <Switch
                isChecked={form.canOrganizeFolders}
                onChange={(e) => update({ canOrganizeFolders: e.target.checked })}
                colorScheme={t.accent}
                aria-label="Organise the folders"
                data-testid="role-form-organize-folders"
              />
            </HStack>
          </VStack>
          <Accordion allowToggle defaultIndex={[]} borderColor={t.panelBorder}>
            <AccordionItem border="1px solid" borderColor={t.panelBorder} borderRadius="lg">
              <AccordionButton px={4} py={3} data-testid="role-form-advanced">
                <Box flex="1" textAlign="left">
                  <Text fontSize="sm" fontWeight="semibold" color={t.label}>Advanced</Text>
                  <Text fontSize="xs" color={t.help}>Gas sponsorship, passkeys and role management</Text>
                </Box>
                <AccordionIcon color={t.help} />
              </AccordionButton>
              <AccordionPanel px={4} pb={4}>
                <SponsorshipSettings
                  value={form.sponsorship}
                  onChange={(sponsorship) => update({ sponsorship })}
                  config={ctx.sponsorshipConfig}
                  onRetry={ctx.refreshRoleCreation}
                  kind={form.kind}
                  emailJoining={!isGroup && (form.join.domains.length > 0 || form.emailInvites.length > 0)}
                  variant={variant}
                />
                <Box borderTop="1px solid" borderColor={t.panelBorder} mt={4} pt={4}>
                  <ManagerSettings
                    value={form.manager}
                    onChange={(manager) => update({ manager })}
                    subjects={[
                      ...roles.filter((role) => !isGroup || !form.memberRoleIds.includes(role.subjectId)),
                      ...groups,
                    ]}
                    kind={form.kind}
                    variant={variant}
                  />
                </Box>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </VStack>
      )}

      {/* ── JOINING ────────────────────────────────────────────────────────── */}
      {current === 'joining' && (
        <VStack align="stretch" spacing={5}>
          <Box p={4} borderRadius="lg" bg={t.subtleBg} border="1px solid" borderColor={t.panelBorder}>
            <HStack justify="space-between" mb={1}>
              <Text fontSize="sm" fontWeight="semibold" color={t.label}>Election</Text>
              <Badge colorScheme="green">Always available</Badge>
            </HStack>
            {sectionHelp('A passing governance vote can add people to this role. Leave the optional methods below off for election only.')}
          </Box>

          <HStack justify="space-between" align="flex-start">
            <Box pr={4}>
              <Text fontSize="sm" fontWeight="medium" color={t.label}>Open to claim</Text>
              <Text fontSize="xs" color={t.help}>
                Anyone already in the org can add themselves to this role, subject to its seat limit.
              </Text>
              {(form.join.domains.length > 0 || form.emailInvites.length > 0) && (
                <Text fontSize="xs" color={t.help} mt={1}>
                  Remove email domains and email invites to make this role open to claim.
                </Text>
              )}
            </Box>
            <Switch
              isChecked={form.openRole}
              isDisabled={!form.openRole && (form.join.domains.length > 0 || form.emailInvites.length > 0)}
              onChange={(e) => update({
                openRole: e.target.checked,
                perms: { ...form.perms, QJ_AUTOJOIN: e.target.checked && Boolean(form.perms.QJ_AUTOJOIN) },
              })}
              colorScheme={t.accent}
              aria-label="Open to claim"
              data-testid="role-form-open-role"
            />
          </HStack>

          <Checkbox
            isChecked={Boolean(form.perms.QJ_AUTOJOIN)}
            isDisabled={!form.openRole && !form.perms.QJ_AUTOJOIN}
            onChange={(e) => update({ perms: { ...form.perms, QJ_AUTOJOIN: e.target.checked } })}
            colorScheme={t.accent}
            alignItems="flex-start"
            data-testid="role-form-autojoin"
          >
            <VStack align="start" spacing={0} ml={1}>
              <Text fontSize="sm" fontWeight="medium" color={t.label}>Add new org members automatically</Text>
              <Text fontSize="xs" color={t.help}>
                Requires Open to claim. New members receive this role through Quick Join; existing members are unchanged.
              </Text>
            </VStack>
          </Checkbox>

          <Divider borderColor={t.panelBorder} />
          <InviteListInput
            kind="domain"
            value={form.join.domains}
            onChange={(domains) => update({ join: { ...form.join, domains } })}
            openRole={form.openRole}
            config={ctx.emailConfig}
            variant={variant}
          />

          {!isGroup && (
            <>
              <Divider borderColor={t.panelBorder} />
              <Box>
                <HStack justify="space-between" align="flex-start">
                  <Box pr={4}>
                    <Text fontSize="sm" fontWeight="medium" color={t.label}>Vouching</Text>
                    <Text fontSize="xs" color={t.help}>
                      People join by collecting vouches from an existing role, instead of waiting
                      for a vote or an invitation.
                    </Text>
                  </Box>
                  <Switch
                    isChecked={Boolean(form.vouching?.enabled)}
                    onChange={(e) => update({ vouching: { ...form.vouching, enabled: e.target.checked } })}
                    colorScheme={t.accent}
                    aria-label="Join with vouches"
                    data-testid="role-form-vouching"
                  />
                </HStack>

                {form.vouching?.enabled && (
                  <VStack align="stretch" spacing={3} mt={3}>
                    <FormControl>
                      <FormLabel color={t.label} fontSize="sm">How many vouches</FormLabel>
                      <NumberInput
                        min={1}
                        value={form.vouching.quorum}
                        onChange={(_, n) => update({
                          vouching: { ...form.vouching, quorum: Number.isFinite(n) ? n : form.vouching.quorum },
                        })}
                      >
                        <NumberInputField data-testid="role-form-vouch-quorum" {...t.input} />
                      </NumberInput>
                    </FormControl>

                    <FormControl>
                      <FormLabel color={t.label} fontSize="sm">Who can vouch</FormLabel>
                      <Select
                        value={form.vouching.selfVouch ? 'self' : (form.vouching.voucherSubjectId || '')}
                        onChange={(e) => update({
                          vouching: {
                            ...form.vouching,
                            selfVouch: e.target.value === 'self',
                            voucherSubjectId: e.target.value === 'self' ? '' : e.target.value,
                          },
                        })}
                        placeholder="Pick a role"
                        data-testid="role-form-voucher"
                        {...t.input}
                      >
                        <option value="self" style={{ background: t.optionBg }}>
                          This role vouches for itself
                        </option>
                        {[...roles, ...groups].map((s) => (
                          <option key={s.subjectId} value={s.subjectId} style={{ background: t.optionBg }}>
                            {s.name || 'Untitled'}
                          </option>
                        ))}
                      </Select>
                    </FormControl>

                    {vouchLints.map((l) => (
                      <Alert key={l.code} status="warning" borderRadius="md" fontSize="sm">
                        <AlertIcon />
                        {l.message}
                      </Alert>
                    ))}
                  </VStack>
                )}
              </Box>
            </>
          )}
        </VStack>
      )}

      {/* ── PEOPLE ─────────────────────────────────────────────────────────── */}
      {current === 'people' && (
        <VStack align="stretch" spacing={4}>
          {sectionHelp(
            'Who holds it from day one. People already in this org are added directly; anyone '
            + 'else gets an invitation they accept themselves.'
          )}

          <UserSearchInput
            variant={t.search}
            size="sm"
            resultsPlacement="inline"
            placeholder="Search by username or 0x address…"
            onSelect={(user) => addHolder(user?.address, user?.username || '')}
          />

          <HStack>
            <Input
              size="sm"
              placeholder="…or paste an address (0x…)"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              data-testid="role-form-holder-address"
              {...t.input}
            />
            <Button
              size="sm"
              leftIcon={<FiPlus />}
              colorScheme={t.accent}
              variant="outline"
              isDisabled={!ADDRESS_RE.test(manualAddress.trim())}
              data-testid="role-form-holder-add"
              onClick={() => { addHolder(manualAddress.trim()); setManualAddress(''); }}
            >
              Add
            </Button>
          </HStack>

          {(form.holders || []).length === 0 ? (
            <Text fontSize="xs" color={t.help}>Nobody yet — a role can start empty.</Text>
          ) : (
            (form.holders || []).map((h, i) => {
              const known = ADDRESS_RE.test(h.address) && inOrg.has(String(h.address).toLowerCase());
              return (
                <Box
                  key={`${h.address}-${i}`}
                  borderWidth="1px"
                  borderColor={t.panelBorder}
                  borderRadius="lg"
                  bg={t.subtleBg}
                  p={3}
                  data-testid="role-form-holder-row"
                >
                  <HStack justify="space-between">
                    <VStack align="start" spacing={0} minW={0}>
                      <Text fontSize="sm" color={t.label} fontWeight="medium">
                        {h.name || shortAddress(h.address)}
                      </Text>
                      {h.name && (
                        <Text fontSize="xs" color={t.help} fontFamily="mono">{shortAddress(h.address)}</Text>
                      )}
                    </VStack>
                    <HStack>
                      <Badge colorScheme={known ? 'green' : 'purple'}>{known ? 'Added' : 'Invited'}</Badge>
                      <IconButton
                        aria-label="Remove"
                        size="sm"
                        variant="ghost"
                        color={t.help}
                        icon={<FiTrash2 />}
                        onClick={() => update({ holders: (form.holders || []).filter((_, j) => j !== i) })}
                      />
                    </HStack>
                  </HStack>
                  <Checkbox
                    mt={2}
                    size="sm"
                    colorScheme={t.accent}
                    isChecked={Boolean(h.sticky)}
                    onChange={(e) => update({
                      holders: (form.holders || []).map((x, j) => (j === i ? { ...x, sticky: e.target.checked } : x)),
                    })}
                  >
                    <VStack align="start" spacing={0} ml={1}>
                      <Text fontSize="xs" fontWeight="medium" color={t.label}>{STICKY_COPY.sticky.label}</Text>
                      <Text fontSize="xs" color={t.help}>{STICKY_COPY.sticky.help}</Text>
                    </VStack>
                  </Checkbox>
                </Box>
              );
            })
          )}
          <Divider borderColor={t.panelBorder} />
          <InviteListInput
            kind="email"
            value={form.emailInvites}
            onChange={(emailInvites) => update({ emailInvites })}
            openRole={form.openRole}
            config={ctx.emailConfig}
            variant={variant}
          />
        </VStack>
      )}

      {/* ── REVIEW ─────────────────────────────────────────────────────────── */}
      {current === 'review' && (
        <VStack align="stretch" spacing={4}>
          {reviewError && (
            <Alert status="error" borderRadius="md" fontSize="sm" data-testid="role-form-blocked">
              <AlertIcon />
              {reviewError}
            </Alert>
          )}
          {built ? (
            <>
              <Box>
                <Text fontSize="xs" fontWeight="bold" color={t.help} textTransform="uppercase" mb={2}>
                  If this passes
                </Text>
                <VStack as="ul" align="stretch" spacing={2} pl={4}>
                  {built.summaries.map((s, i) => (
                    <Text as="li" key={i} fontSize="sm" color={t.text} pl={1}>{s}</Text>
                  ))}
                </VStack>
              </Box>
              {built.warnings.length > 0 && (
                <Alert
                  status="warning"
                  borderRadius="lg"
                  alignItems="flex-start"
                  bg={variant === 'dark' ? 'rgba(237, 137, 54, 0.08)' : 'orange.50'}
                  border="1px solid"
                  borderColor={variant === 'dark' ? 'rgba(237, 137, 54, 0.2)' : 'orange.100'}
                  fontSize="sm"
                >
                  <AlertIcon color={variant === 'dark' ? 'orange.300' : 'orange.500'} boxSize={4} mt={1} />
                  <Box>
                    <Text fontWeight="medium" color={t.label} mb={2}>Before submitting</Text>
                    <VStack align="stretch" spacing={2}>
                      {built.warnings.map((w, i) => <Text key={i} color={t.text}>{w}</Text>)}
                    </VStack>
                  </Box>
                </Alert>
              )}
            </>
          ) : !reviewError && (
            <Alert status="info" borderRadius="md" fontSize="sm">
              <AlertIcon />
              Still loading this org’s roles — give it a moment.
            </Alert>
          )}
        </VStack>
      )}

      {currentError && current !== 'review' && !(current === 'basics' && !String(form.name || '').trim()) && (
        <Alert status="warning" borderRadius="md" fontSize="sm">
          <AlertIcon />
          {currentError}
        </Alert>
      )}

      {/* Stack filters its direct children to React elements; keep the portal inside a fragment. */}
      {navigationTarget ? <>{createPortal(navigation, navigationTarget)}</> : navigation}
    </VStack>
  );
}
