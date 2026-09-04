/**
 * RoleForm — ONE screen for "bring a new role (or group) into existence".
 *
 * CONTROLLED and chrome-less on purpose: it takes `value` / `onChange` / `ctx`, owns its own step
 * navigation and nothing else. No modal, no submit button, no contract call. That is what lets the
 * SAME form be the whole of /team's "Create a role or group" modal and the whole of the
 * Create-a-Vote wizard's createRole config step — the two doors that used to disagree about what a
 * role is (one could not set vouching or task permissions, the other could not make a group,
 * neither could give the new role a vote).
 *
 * The decisions it exists to make un-missable, because on chain they are invisible until it is too
 * late to change them without another vote:
 *
 *   • A ROLE is what people hold; a GROUP is a bundle of permissions that ROLES go into. Picking
 *     the wrong one is a whole proposal wasted, so it is the first question, not a checkbox.
 *   • Permissions do NOT include voting. A role with every permission in the catalogue still has
 *     zero weight in a binding vote until it is added to a voting class — so the Voting step asks
 *     for that explicitly and says what happens if you say no.
 *   • ADDED vs INVITED is the contract's own `_isInOrg`, never a guess: `grant` on someone outside
 *     the org does not revert, it silently becomes an offer they have to accept. The badge is read
 *     from the fold mirror so it cannot describe something that did not happen.
 *
 * Everything it produces is `value` — a plain object the caller stores (in the wizard's draft, or
 * in local state) and hands to `lib/accessV2/roleFormBatch` to encode.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
  Tag,
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
import PermissionPicker from './PermissionPicker';
import ProjectPermRows from './roleForm/ProjectPermRows';
import { tokensFor } from './roleForm/formTokens';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** The steps, in order. `people` and the vouching block are role-only; a group has no members. */
const ALL_STEPS = ['basics', 'membership', 'permissions', 'voting', 'people', 'review'];

const STEP_LABEL = {
  basics: 'Basics',
  membership: { role: 'Groups', group: 'Roles' },
  permissions: 'Permissions',
  voting: 'Voting',
  people: 'People',
  review: 'Review',
};

const stepLabel = (step, kind) => {
  const label = STEP_LABEL[step];
  return typeof label === 'string' ? label : label[kind] || label.role;
};

const stepsFor = (kind) => ALL_STEPS.filter((s) => (kind === ROLE_FORM_KIND.GROUP ? s !== 'people' : true));

/**
 * Which step a validation error belongs to, so Next can refuse on the screen that owns the answer
 * rather than letting a bad row surface three steps later on Review.
 */
function stepError(step, form) {
  const error = roleFormError(form);
  if (!error) return null;
  const onBasics = /name|seat limit/i.test(error);
  const onPeople = /address|listed twice/i.test(error);
  const onPermissions = /project/i.test(error) && !onPeople;
  const onVoting = /vouch|group of voters/i.test(error);

  if (step === 'basics') return onBasics ? error : null;
  if (step === 'permissions') return onPermissions ? error : null;
  if (step === 'voting') return onVoting ? error : null;
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
export default function RoleForm({ value, onChange, ctx = {}, variant = 'light', onStatus = null }) {
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
  const built = useMemo(() => {
    if (current !== 'review' || !ctx?.authority || !String(form.name || '').trim()) return null;
    try {
      return buildRoleFormBatch({
        authority: ctx.authority,
        hybridVoting: ctx.hybridVoting || '',
        taskManagerAddress: ctx.taskManagerAddress || '',
        indexedSubjects: ctx.indexedSubjects || [],
        activeProposals: ctx.activeProposals || [],
        inOrgUsers: inOrg,
        votingClasses,
        form,
      });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, form, ctx, votingClasses]);

  const currentError = stepError(current, form);

  useEffect(() => {
    if (!onStatus) return undefined;
    onStatus({
      atReview: current === 'review',
      blocked: built && built.submittable && !built.submittable.ok ? built.submittable.message : null,
    });
    return () => onStatus({ atReview: false, blocked: null });
  }, [current, built, onStatus]);

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

  return (
    <VStack align="stretch" spacing={5} data-testid="role-form">
      <Box>
        <Progress
          value={((stepIndex + 1) / steps.length) * 100}
          size="xs"
          colorScheme={t.accent}
          borderRadius="full"
        />
        <Text fontSize="xs" color={t.help} mt={2}>
          Step {stepIndex + 1} of {steps.length} — {stepLabel(current, form.kind)}
        </Text>
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
                  <Text fontSize="sm" fontWeight="medium" color={t.label}>
                    Anyone in the co-op can join it
                  </Text>
                  <Text fontSize="xs" color={t.help}>
                    Open roles need no invitation — people add themselves. Leave this off for a
                    titled role.
                  </Text>
                </Box>
                <Switch
                  isChecked={form.openRole}
                  onChange={(e) => update({ openRole: e.target.checked })}
                  colorScheme={t.accent}
                  data-testid="role-form-open-role"
                />
              </HStack>

              <HStack justify="space-between" align="flex-start">
                <Box pr={4}>
                  <Text fontSize="sm" fontWeight="medium" color={t.label}>Limit the number of seats</Text>
                  <Text fontSize="xs" color={t.help}>Off means as many people as you like.</Text>
                </Box>
                <Switch
                  isChecked={form.limitSeats}
                  onChange={(e) => update({ limitSeats: e.target.checked })}
                  colorScheme={t.accent}
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
                        <Tag
                          size="lg"
                          cursor="pointer"
                          colorScheme={on ? t.accent : 'gray'}
                          variant={on ? 'solid' : 'subtle'}
                          data-testid={`role-form-member-role-${r.subjectId}`}
                          onClick={() => update({ memberRoleIds: toggleId(form.memberRoleIds || [], r.subjectId) })}
                        >
                          {r.name || 'Untitled'}
                        </Tag>
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
                  This co-op has no groups yet. You can put this role in one later.
                </Alert>
              ) : (
                <Wrap>
                  {groups.map((g) => {
                    const on = (form.groupIds || []).includes(g.subjectId);
                    return (
                      <WrapItem key={g.subjectId}>
                        <Tag
                          size="lg"
                          cursor="pointer"
                          colorScheme={on ? t.accent : 'gray'}
                          variant={on ? 'solid' : 'subtle'}
                          data-testid={`role-form-group-${g.subjectId}`}
                          onClick={() => update({ groupIds: toggleId(form.groupIds || [], g.subjectId) })}
                        >
                          {g.name || 'Untitled'}
                        </Tag>
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
          />

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
                data-testid="role-form-organize-folders"
              />
            </HStack>
          </VStack>
        </VStack>
      )}

      {/* ── VOTING (and joining) ───────────────────────────────────────────── */}
      {current === 'voting' && (
        <VStack align="stretch" spacing={5}>
          <Box>
            <HStack justify="space-between" align="flex-start">
              <Box pr={4}>
                <Text fontSize="sm" fontWeight="medium" color={t.label}>
                  {isGroup ? 'Count these roles as voters in binding votes' : 'Count this role as voters in binding votes'}
                </Text>
                <Text fontSize="xs" color={t.help}>
                  Only needed if the people in this {isGroup ? 'group' : 'role'} won’t already vote as
                  members of the co-op. Leave it off and they keep whatever vote their other roles
                  give them.
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
                data-testid="role-form-class-vote"
              />
            </HStack>

            {classOptions.length === 0 ? (
              <Alert status="info" borderRadius="md" fontSize="sm" mt={3}>
                <AlertIcon />
                This group’s binding votes aren’t set up yet, so there is nothing to join.
              </Alert>
            ) : form.bindingVote && (
              <FormControl mt={3}>
                <FormLabel color={t.label} fontSize="sm">Vote as</FormLabel>
                <Select
                  value={form.bindingClassIdx ?? ''}
                  onChange={(e) => update({ bindingClassIdx: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="Pick a group of voters"
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
            'Who holds it from day one. People already in this group are added directly; anyone '
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
        </VStack>
      )}

      {/* ── REVIEW ─────────────────────────────────────────────────────────── */}
      {current === 'review' && (
        <VStack align="stretch" spacing={4}>
          {currentError ? (
            <Alert status="error" borderRadius="md" fontSize="sm">
              <AlertIcon />
              {currentError}
            </Alert>
          ) : built ? (
            <>
              <Box>
                <Text fontSize="xs" fontWeight="bold" color={t.help} textTransform="uppercase" mb={2}>
                  If this passes
                </Text>
                <VStack align="stretch" spacing={1}>
                  {built.summaries.map((s, i) => (
                    <Text key={i} fontSize="sm" color={t.text}>• {s}</Text>
                  ))}
                </VStack>
              </Box>
              {built.warnings.length > 0 && <Divider borderColor={t.panelBorder} />}
              {built.warnings.map((w, i) => (
                <Alert key={i} status="warning" borderRadius="md" fontSize="sm">
                  <AlertIcon />
                  {w}
                </Alert>
              ))}
              {built.submittable && !built.submittable.ok && (
                <Alert status="error" borderRadius="md" fontSize="sm" data-testid="role-form-blocked">
                  <AlertIcon />
                  {built.submittable.message}
                </Alert>
              )}
              <Text fontSize="xs" color={t.help}>
                {built.batch.length === 1
                  ? 'One step, one vote.'
                  : built.batch.length === 2
                    ? 'Passing this vote does both of these at once.'
                    : `Passing this vote does all ${built.batch.length} of these at once.`}
              </Text>
            </>
          ) : (
            <Alert status="info" borderRadius="md" fontSize="sm">
              <AlertIcon />
              Still loading this co-op’s roles — give it a moment.
            </Alert>
          )}
        </VStack>
      )}

      {currentError && current !== 'review' && (
        <Alert status="warning" borderRadius="md" fontSize="sm">
          <AlertIcon />
          {currentError}
        </Alert>
      )}

      <HStack justify="space-between" pt={1}>
        <Button
          size="sm"
          variant="ghost"
          color={t.help}
          leftIcon={<FiArrowLeft />}
          isDisabled={stepIndex === 0}
          data-testid="role-form-back"
          onClick={() => setStep(steps[Math.max(0, stepIndex - 1)])}
        >
          Back
        </Button>
        {stepIndex < steps.length - 1 && (
          <Button
            size="sm"
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
    </VStack>
  );
}
