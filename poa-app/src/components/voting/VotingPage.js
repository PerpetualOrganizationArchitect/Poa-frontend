/**
 * VotingPage — the lifecycle voting board.
 *
 * Wave 2: replaces the old tabbed VotingTabs/VotingPanel surface with a single
 * lifecycle board (VotingBoard) fed by useVoteLanes, one GovernanceStrip
 * education header on top, and ONE PollDetail (replacing pollModal +
 * CompletedPollModal) driven by usePollNavigation.
 *
 * Container responsibilities (kept out of the presentation components):
 *   - CreateVoteModal wiring + handleProposalSubmit (forwarding actionSummaries)
 *   - the cast + finalize handlers (useVoteActions — shared with /votes, and
 *     returning the executeWithNotification result so PollDetail can roll back
 *     its optimistic celebration on failure)
 *   - tour auto-open of CreateVoteModal at the create-vote-preview step
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/router";
import { Box, Container, Center, Flex, Heading, Button, Icon, Link, Tooltip, useToast } from "@chakra-ui/react";
import { PiPlusCircle, PiScales } from "react-icons/pi";
import {
  isContractAvailable, CONTRACT_MAP, buildSetterCopy,
} from "@/config/setterDefinitions";
import CommunityLoadingState from "@/components/shared/CommunityLoadingState";
import GlassBack from "./GlassBack";
import { useOrgGate } from "@/components/shared/OrgDeadEnd";
import { usePOContext } from "@/context/POContext";
import { useVotingContext } from "@/context/VotingContext";
import { useUserContext } from "@/context/UserContext";
import { useAuth } from "@/context/AuthContext";
import { useOrgTheme, useVoteLanes } from "@/hooks";
import { useVoteCreateGate } from "@/hooks/useVoteCreateGate";
import { useVoteActions } from "@/hooks/useVoteActions";
import { useOrgName } from "@/hooks/useOrgName";
import { useOrgAuthority } from "@/hooks/accessV2/useOrgAuthority";
import { useAuthoritySubjects } from "@/hooks/accessV2/useAuthoritySubjects";
import { useAuthorityMemberships } from "@/hooks/accessV2/useAuthorityMemberships";
import { useRoleCreationContext } from '@/hooks/accessV2/useRoleCreationContext';
import { parseCreatedProposalId } from "@/lib/voting/proposalReceipt";
import { recordGasFloor } from "@/lib/accessV2/gasFloors";
import { defaultRoleForm } from '@/lib/accessV2/roleFormBatch';
import { estimateBatchGas } from "@/lib/accessV2/proposalBuilders";
import { preflightRoleRemovals } from "@/lib/accessV2/roleRemoval";
import { votingLaneForBatches, isBindingType } from "./create/wizardSteps";
import { TRANSFER_DESTINATION, FUND_BOUNTIES_DEEP_LINK } from "@/lib/voting/treasuryBatches";
import { resolveSetterTemplate } from "@/lib/voting/setterAvailability";
import { getBountyTokenOptions } from "@/util/tokens";

import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import VotingEducationHeader from "./VotingEducationHeader";
import { VotingBoard } from "./VotingBoard";
import { PollDetail } from "./PollDetail";
import CreateVoteModal from "./CreateVoteModal";
import OrgConstitution from "./OrgConstitution";

// Custom hooks for logic extraction
import { usePollNavigation } from "../../hooks/usePollNavigation";
import { useProposalForm } from "../../hooks/useProposalForm";
import { useTour } from "@/features/tour";

const VotingPage = () => {
  const router = useRouter();
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const { currentStepDef, isActive: isTourActive } = useTour();
  const tourOpenedModalRef = useRef(false);

  // Auto-open/close CreateVoteModal when tour reaches the create-vote-preview step
  useEffect(() => {
    const tourWantsModal = isTourActive && currentStepDef?.id === 'create-vote-preview';
    if (tourWantsModal && !showCreatePoll) {
      tourOpenedModalRef.current = true;
      setShowCreatePoll(true);
    } else if (!tourWantsModal && tourOpenedModalRef.current) {
      // Only close if the tour opened it (not if user opened it manually)
      tourOpenedModalRef.current = false;
      setShowCreatePoll(false);
    }
  }, [isTourActive, currentStepDef?.id, showCreatePoll]);

  const { pageBackground } = useOrgTheme();
  const userDAO = useOrgName();
  const orgGate = useOrgGate();
  const toast = useToast();

  const {
    directDemocracyVotingContractAddress,
    votingContractAddress,
    taskManagerContractAddress,
    executorContractAddress,
    paymentManagerAddress,
    orgChainId,
    eligibilityModuleAddress,
    participationTokenAddress,
    zkEmailInvitesAddress,
    poContextLoading,
    roleNames,
    leaderboardData,
    poMembers,
  } = usePOContext();

  // Access v2 (MembershipAuthority) facts the wizard's builders need. Every
  // hook here self-skips on a legacy org (no query on the wire, empty arrays),
  // so `accessV2.enabled === false` means "build exactly what you built before".
  const authority = useOrgAuthority();
  const authoritySubjects = useAuthoritySubjects();
  const authorityMemberships = useAuthorityMemberships();
  const roleCreation = useRoleCreationContext({ enabled: authority.enabled && showCreatePoll, authority: authority.address });

  const {
    hybridVotingOngoing,
    democracyVotingOngoing,
    democracyVotingCompleted,
    hybridVotingCompleted,
    votingType: PTVoteType,
    resolveMissingPoll,
    votingClasses,
    hybridThresholdPct,
    hybridQuorum,
    ddThresholdPct,
    ddQuorum,
    refetch,
  } = useVotingContext();

  const { hasMemberRole, userDataLoading } = useUserContext();
  const { accountAddress } = useAuth();
  const isConnected = !!accountAddress;

  // On-chain creator-hat gate: membership alone is NOT enough to create votes —
  // createProposal reverts Unauthorized for members without a creator hat,
  // after they've walked the whole wizard and uploaded metadata to IPFS.
  // Kept whole as well as destructured: OrgConstitution describes the creator
  // sets this same read resolved, so the copy can't drift from the button.
  const voteGate = useVoteCreateGate();
  const { canCreatePoll, canCreateProposal, canCreateAny, creatorGateLoading } = voteGate;

  // Derived lifecycle lanes (shared definitions with /votes + dashboard).
  const { lanes, loading, error } = useVoteLanes();

  // Poll navigation + the single PollDetail surface.
  const {
    selectedPoll,
    votingTypeSelected,
    handlePollClick,
    getContractAddressForVotingType,
    isDetailOpen,
    onDetailClose,
  } = usePollNavigation({
    democracyVotingOngoing,
    democracyVotingCompleted,
    hybridVotingOngoing,
    hybridVotingCompleted,
    PTVoteType,
    resolveMissingPoll,
  });

  // Cast + finalize handlers, shared with the /votes archive so the two
  // PollDetail surfaces can't drift (they did: the archive shipped without a
  // cast handler and celebrated votes it never sent). Both RETURN the
  // executeWithNotification result so PollDetail can roll its optimistic
  // celebration back and show the calm error on failure.
  //
  // `voting`/`executeWithNotification` come from here too — proposal creation
  // below needs them, and a second useWeb3Services() would give this page two
  // independent txManagers (see the hook for why that bites on EIP-7702).
  const {
    handleVote,
    handleFinalize,
    voting,
    membershipAuthority,
    executeWithNotification,
  } = useVoteActions(votingTypeSelected);

  // PollDetail must render LIVE data — selectedPoll is a click-time snapshot,
  // so optimistic votes and 30s polling refreshes would never reach an open
  // detail (celebration bars would exclude the user's own vote). Re-derive the
  // fresh transformed proposal by id on every context update.
  const livePoll = useMemo(() => {
    if (!selectedPoll) return null;
    const all = [
      ...hybridVotingOngoing,
      ...hybridVotingCompleted,
      ...democracyVotingOngoing,
      ...democracyVotingCompleted,
    ];
    return all.find((p) => p.id === selectedPoll.id) || selectedPoll;
  }, [selectedPoll, hybridVotingOngoing, hybridVotingCompleted, democracyVotingOngoing, democracyVotingCompleted]);

  // Proposal creation. Resolves `true` when the proposal landed and `false`
  // when it did not — useProposalForm keeps the member's draft on `false`.
  const handleProposalSubmit = useCallback(async (proposalData) => {
    if (!voting) return false;

    // Every authority removal is one call in a single atomic Executor batch. A stale member or a
    // newly-acquired eligibility source would make the ENTIRE winning batch revert later, while
    // HybridVoting still settles successfully. Narrow that window with live on-chain canRemove
    // checks immediately before creating the proposal. The state can still change while voting is
    // open; finalization surfaces ProposalExecutionFailed and never claims that action succeeded.
    if (proposalData.type === 'removeRoleMembers') {
      if (!authority.enabled || !authority.address) {
        throw new Error('This group is not using the new roles system yet.');
      }
      const selectedRole = (authoritySubjects.roles || []).find(
        (role) => String(role.subjectId) === String(proposalData.roleRemovalConfig?.subjectId),
      );
      if (!selectedRole) {
        throw new Error('The selected role is no longer available. Go back and refresh the selection.');
      }
      if ((selectedRole.name || '') !== (proposalData.roleRemovalConfig?.subjectName || '')) {
        throw new Error('The selected role was renamed. Go back to review the updated vote wording.');
      }
      await preflightRoleRemovals({
        membershipAuthority,
        authority: authority.address,
        config: proposalData.roleRemovalConfig,
      });
    }

    const proposalParams = {
      name: proposalData.name,
      description: proposalData.description,
      durationMinutes: proposalData.time,
      numOptions: proposalData.numOptions,
      optionNames: proposalData.optionNames || [],
      batches: proposalData.batches || [],
      hatIds: proposalData.hatIds || [],
      // Forward human-readable action previews so the metadata JSON carries
      // them (useProposalForm emits this; the old VotingPage dropped it).
      actionSummaries: proposalData.actionSummaries || [],
    };

    // The BATCH decides the contract, not the intent name. Anything that runs
    // a call when it passes goes to Blended voting: HybridVoting has no target
    // allow-list (#74) and is the Executor's ONLY permitted caller. A batch-less
    // poll goes to DirectDemocracy — whose allow-list is empty on every org we
    // deploy, so a payout routed there reverted TargetNotAllowed at creation.
    // A binding TYPE also goes to Blended voting even when its batches happen
    // to be empty (a v2 election that only confirms the incumbent): the member
    // was gated on the binding-creator permission and the ballot says BINDING.
    const lane = (votingLaneForBatches(proposalParams.batches) === 'hybrid' || isBindingType(proposalData.type))
      ? 'hybrid'
      : 'dd';
    const contractAddress = lane === 'hybrid'
      ? votingContractAddress
      : directDemocracyVotingContractAddress;

    const result = await executeWithNotification(
      () => (lane === 'hybrid'
        ? voting.createHybridProposal(contractAddress, proposalParams)
        : voting.createDDProposal(contractAddress, proposalParams)),
      {
        pendingMessage: 'Creating proposal...',
        successMessage: 'Proposal created successfully!',
        refreshEvent: 'proposal:created',
      }
    );

    // executeWithNotification never throws on a reverted transaction — it
    // shows the failure and resolves { success: false }. That used to be
    // dropped here, so the form read a revert as success (reset, draft wiped,
    // green toast). Hand the answer back instead.
    if (!result?.success) return false;

    // announceWinner runs the winning batch inside a try/catch, so every gas
    // estimator prices only the cheap caught-failure path; an under-funded
    // finalize SUCCEEDS while silently skipping the batch. Park the floor the
    // builder computed (or a generous per-call default) against the on-chain
    // id so useVoteActions.handleFinalize can apply it — the same thing
    // useAccessV2Proposal does for the /team wizard.
    if (lane === 'hybrid') {
      const proposalId = parseCreatedProposalId(result.receipt, contractAddress);
      const perOption = proposalParams.batches.map((b) => estimateBatchGas(b || []));
      const floor = proposalData.gasLimit
        || (perOption.length ? Math.max(...perOption) : 0);
      if (proposalId && floor) recordGasFloor(contractAddress, proposalId, floor);
    }

    setShowCreatePoll(false);
    return true;
  }, [
    voting,
    membershipAuthority,
    authoritySubjects.roles,
    authority.enabled,
    authority.address,
    executeWithNotification,
    directDemocracyVotingContractAddress,
    votingContractAddress,
  ]);

  const {
    proposal,
    loadingSubmit,
    handleInputChange,
    handleOptionChange,
    addOption,
    removeOption,
    handleProposalTypeChange,
    handleTransferAddressChange,
    handleTransferAmountChange,
    handleRestrictedToggle,
    toggleRestrictedRole,
    handleSetterChange,
    handleSubmit,
    restoreProposal,
  } = useProposalForm({
    onSubmit: handleProposalSubmit,
  });

  // Keys here must cover every CONTRACT_MAP contextKey a setter template can
  // target — a missing key makes buildProposalData skip the encode step, and
  // the proposal would go on-chain carrying an empty batch.
  const contractAddresses = useMemo(() => ({
    votingContractAddress,
    directDemocracyVotingContractAddress,
    taskManagerContractAddress,
    executorContractAddress,
    // The treasury's payout account — the source a "send money" vote withdraws
    // from when the Executor's own balance can't cover it.
    paymentManagerAddress,
    participationTokenAddress,
    zkEmailInvitesAddress,
    // Only set on a cut-over org: the access-v2 setter templates target it and
    // isContractAvailable hides them on a legacy org.
    membershipAuthorityAddress: authority.enabled ? (authority.address || '') : '',
  }), [
    votingContractAddress, directDemocracyVotingContractAddress, taskManagerContractAddress,
    executorContractAddress, paymentManagerAddress, participationTokenAddress,
    zkEmailInvitesAddress, authority.enabled, authority.address,
  ]);

  // Live access-v2 facts the pure builders need (subject ids for role pickers,
  // who is already in the org for grant-vs-offer, in-flight proposals for the
  // id-prediction race). Empty on a legacy org.
  const accessV2 = useMemo(() => ({
    roleCreation,
    enabled: !!authority.enabled,
    authority: authority.enabled ? (authority.address || '') : '',
    subjects: authoritySubjects.subjects || [],
    // The DISPLAY projection hides structural subjects (the migrated top hat), but a hidden
    // subject still consumed a sequence number — so subject-id prediction has to see the indexed
    // list or a new role's whole batch lands on the wrong id.
    indexedSubjects: authoritySubjects.indexedSubjects || [],
    roles: authoritySubjects.roles || [],
    groups: authoritySubjects.groups || [],
    // A SET of lowercased addresses (the contract's `_isInOrg`), not an array — the grant-vs-offer
    // decision reads it directly.
    inOrgUsers: authorityMemberships.inOrgUsers || new Set(),
    // `members` is accepted && eligible; `memberships` is every row. An election needs the rows:
    // `remove` only requires acceptance, so an accepted-but-lapsed incumbent is still removable
    // (and would still make `grant` revert AlreadyMember).
    members: authorityMemberships.members || [],
    memberships: authorityMemberships.memberships || [],
    activeProposals: hybridVotingOngoing || [],
    // The org's Blended voting classes. A new role has NO weight in a binding vote until it is in
    // one (`addHatToClass`), so the create-role batch has to be able to add it — permissions alone
    // buy a role exactly zero votes, silently.
    votingClasses: votingClasses || [],
  }), [
    roleCreation, authority.enabled, authority.address,
    authoritySubjects.subjects, authoritySubjects.indexedSubjects,
    authoritySubjects.roles, authoritySubjects.groups,
    authorityMemberships.inOrgUsers, authorityMemberships.members,
    authorityMemberships.memberships,
    hybridVotingOngoing, votingClasses,
  ]);

  const handlePollCreated = useCallback(() => {
    return handleSubmit(eligibilityModuleAddress, contractAddresses, { accessV2 });
  }, [handleSubmit, eligibilityModuleAddress, contractAddresses, accessV2]);

  // True only when the modal was opened by a deep link that pre-filled the
  // proposal (the /rules "Propose a change" rows and ?propose=<template>).
  // Those land on the step their payload already satisfies. A plain
  // "Create vote" click must always start at the intent gallery — even when a
  // previous, abandoned attempt left the form fully configured.
  const [deepLinkedOpen, setDeepLinkedOpen] = useState(false);

  const handleCreatePollClick = useCallback(() => {
    setDeepLinkedOpen(false);
    setShowCreatePoll(prev => !prev);
  }, []);

  // Current rule values, threaded to SetterActionSelector so the setter preview
  // can render a BEFORE → AFTER diff for the five rule templates.
  const currentRuleValues = useMemo(() => ({
    hybridThresholdPct,
    hybridQuorum,
    ddThresholdPct,
    ddQuorum,
    votingClasses,
  }), [hybridThresholdPct, hybridQuorum, ddThresholdPct, ddQuorum, votingClasses]);

  // "Propose a change" from the Constitution panel — prefills the create form
  // with the matching setter template preselected, then opens the modal. Mirrors
  // exactly the state SetterActionSelector.handleTemplateSelect sets on click
  // (setterContract/Function + initialized setterValues) so the modal lands on
  // the template's configured step, not the category picker.
  const handleProposeRuleChange = useCallback((templateId, initialValues = null) => {
    // On a cut-over org some templates write tables the contracts no longer
    // read (creator hats, project role masks) — resolve through the availability
    // rules so a stale /rules row or ?propose= link says why instead of opening
    // a wizard for a dead action.
    const resolved = resolveSetterTemplate(templateId, {
      authorityEnabled: authority.enabled,
      contractAddresses,
    });
    const template = resolved.template;
    if (!template) return;
    if (!resolved.available) {
      toast({
        title: 'Not available here',
        description: resolved.reason,
        status: 'info',
        duration: 6000,
        isClosable: true,
      });
      return;
    }
    // Rule changes are setter proposals on HybridVoting — require its creator
    // hat up front. This also closes the ?propose= deep link, which previously
    // opened the wizard with no gate at all.
    if (!canCreateProposal) {
      toast({
        title: "You can't propose changes here",
        description: 'Only members holding a vote-creator role can open proposals.',
        status: 'info',
        duration: 6000,
        isClosable: true,
      });
      return;
    }
    // A ?propose= link can outlive the org it was copied from. Opening the form
    // for a contract this org never deployed would only build an empty proposal
    // — say so instead of dropping the click on the floor.
    if (!isContractAvailable(template.contract, contractAddresses)) {
      toast({
        title: "Not available here",
        description: `"${template.name}" needs ${CONTRACT_MAP[template.contract]?.displayName || template.contract}, `
          + 'which this group doesn\'t have set up.',
        status: "info",
        duration: 6000,
        isClosable: true,
      });
      return;
    }
    const setterValues = (template.inputs || []).reduce((acc, input) => {
      if (input.type === 'votingClassWeights') {
        acc[input.name] = votingClasses.length > 0 ? votingClasses.map(c => ({ ...c })) : [];
      } else if (input.seedFrom === 'votingClasses') {
        // Same seed SetterActionSelector writes when the card is clicked: the class snapshot a
        // template validates against. Without it a `?propose=change-class-voters` link opens on
        // a false “voters haven't loaded yet”.
        acc[input.name] = votingClasses.map(c => ({ ...c }));
      } else {
        // Deep-link prefill (e.g. Settings staging an allowlist hands the root/cid straight to the
        // proposal) — falls back to the template default.
        acc[input.name] = initialValues?.[input.name] ?? (input.default || '');
      }
      return acc;
    }, {});
    // Write the SAME title/description the picker would have written. Without
    // this the deep link lands with an empty title, the review screen shows
    // "(no title)" — setter proposals are exempt from the title gate — and
    // submit then quietly synthesises one from the template preview. The
    // reviewed ballot would not be the proposal that got created.
    const copy = buildSetterCopy(template, setterValues, roleNames, {});
    restoreProposal({
      type: 'setter',
      setterMode: 'template',
      setterTemplate: templateId,
      setterContract: template.contract || '',
      setterFunction: template.functionName || '',
      setterValues,
      setterParams: [],
      ...(copy.title ? { name: copy.title, autoTitle: copy.title } : {}),
      ...(copy.description
        ? { description: copy.description, autoDescription: copy.description }
        : {}),
    });
    setDeepLinkedOpen(true);
    setShowCreatePoll(true);
  }, [restoreProposal, votingClasses, contractAddresses, toast, roleNames, canCreateProposal, authority.enabled]);

  // "Propose a move" from /treasury's fund-task-rewards modal: open the wizard
  // on the payout config step with the task-reward pool already chosen. Gated
  // like every other deep link — a payout is a binding proposal.
  const handleProposeFundBounties = useCallback(() => {
    if (!canCreateProposal) {
      toast({
        title: "You can't propose a payout here",
        description: 'Only members holding a vote-creator role can open proposals.',
        status: 'info',
        duration: 6000,
        isClosable: true,
      });
      return;
    }
    if (!taskManagerContractAddress) {
      toast({
        title: 'Not available here',
        description: "This group doesn't have a task-reward pool set up.",
        status: 'info',
        duration: 6000,
        isClosable: true,
      });
      return;
    }
    const firstToken = getBountyTokenOptions(orgChainId)[0];
    restoreProposal({
      type: 'transferFunds',
      transferDestination: TRANSFER_DESTINATION.BOUNTY_POOL,
      transferAddress: taskManagerContractAddress,
      transferToken: firstToken?.address || '',
    });
    setDeepLinkedOpen(true);
    setShowCreatePoll(true);
  }, [canCreateProposal, taskManagerContractAddress, orgChainId, restoreProposal, toast]);

  const handleProposeCreateRole = useCallback(() => {
    if (!authority.enabled || !canCreateProposal) {
      toast({
        title: "You can't propose a role or group here",
        description: !authority.enabled
          ? 'This org is not using the new roles system.'
          : 'Only members holding a vote-creator role can open proposals.',
        status: 'info',
        duration: 6000,
        isClosable: true,
      });
      return;
    }
    restoreProposal({ type: 'createRole', roleFormV2: defaultRoleForm() });
    setDeepLinkedOpen(true);
    setShowCreatePoll(true);
  }, [authority.enabled, canCreateProposal, restoreProposal, toast]);

  // Deep link support: /voting?propose=<templateId> (from the /rules page)
  // opens the create modal with that rule template preselected, once.
  // Role creation from org structure and treasury funding also use this entry point.
  const proposeParamHandledRef = useRef(false);
  useEffect(() => {
    if (!router.query.propose) {
      proposeParamHandledRef.current = false;
      return;
    }
    if (!router.isReady || proposeParamHandledRef.current) return;
    // Wait for POContext to resolve the org's contract addresses. Firing on
    // router.isReady alone races the subgraph fetch, and handleProposeRuleChange
    // would reject the template as "not deployed here" before we know better.
    if (poContextLoading) return;
    // Also wait for the creator gate's inputs: on a cold load the user query
    // can only START after orgId resolves, so at this instant hasMemberRole is
    // still false and consuming the param would bounce an authorized creator
    // with a false denial (and strip the link). isConnected scopes the wait —
    // visitors' userDataLoading never settles and they should get the toast.
    if (creatorGateLoading || (isConnected && userDataLoading)) return;
    const templateId = router.query.propose;
    if (!templateId || typeof templateId !== 'string') return;
    if (templateId === 'create-role' && authority.loading) return;
    proposeParamHandledRef.current = true;
    if (templateId === FUND_BOUNTIES_DEEP_LINK) {
      handleProposeFundBounties();
    } else if (templateId === 'create-role') {
      handleProposeCreateRole();
    } else {
      // Collect ?prefill_<inputName>=… params into the template's initial values.
      const prefill = {};
      for (const [key, value] of Object.entries(router.query)) {
        if (key.startsWith('prefill_') && typeof value === 'string') prefill[key.slice(8)] = value;
      }
      handleProposeRuleChange(templateId, Object.keys(prefill).length ? prefill : null);
    }
    // Strip the params so a refresh / back doesn't reopen the modal.
    const rest = Object.fromEntries(
      Object.entries(router.query).filter(([key]) => key !== 'propose' && !key.startsWith('prefill_')),
    );
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
  }, [router.isReady, router.query, handleProposeRuleChange, handleProposeFundBounties, handleProposeCreateRole, router, poContextLoading, creatorGateLoading, isConnected, userDataLoading, authority.loading]);

  const canCreate = canCreateAny;

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;

  return (
    <>
      <Navbar />
      {poContextLoading ? (
        <Center minH="90vh" background={pageBackground()}>
          <CommunityLoadingState label="Loading community decisions…" />
        </Center>
      ) : (
        <Container maxW="container.2xl" py={4} px={{ base: "1%", md: "3%" }} minH="100vh" background={pageBackground()}>
          {/* GovernanceStrip — the one-line education header. `modalOpen` holds
              its first-visit coach-mark back while a modal owns the screen. */}
          <Box data-tour="voting-header" mb={6}>
            <VotingEducationHeader
              selectedTab={0}
              PTVoteType={PTVoteType}
              modalOpen={isDetailOpen || showCreatePoll}
            />
          </Box>

          {/* Board panel — the dark glass container the whole board lives in.
              Lane headers, chips, and cards are unreadable directly on themed
              org backgrounds (e.g. Test6 mint), so everything sits on glass,
              matching the /votes archive panels and the old VotingPanel. */}
          <Box
            position="relative"
            zIndex={1}
            borderRadius="3xl"
            p={{ base: 4, md: 8 }}
            mb={8}
            w="100%"
            maxW="1400px"
            mx="auto"
            boxShadow="lg"
          >
            <GlassBack />

            {/* Board header row: title + Create Vote CTA (top-right). */}
            <Flex justify="space-between" align="center" mb={5} gap={3} flexWrap="wrap">
              <Flex align="center" gap={3} flexWrap="wrap">
                <Heading as="h1" size="lg" color="white" fontWeight="800">
                  Votes
                </Heading>
                <Link
                  display="inline-flex"
                  alignItems="center"
                  gap={1}
                  fontSize="sm"
                  fontWeight="600"
                  color="gray.300"
                  _hover={{ color: "white", textDecoration: "none" }}
                  onClick={() => {
                    if (typeof document !== "undefined") {
                      document.getElementById("our-rules")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }}
                >
                  <Icon as={PiScales} boxSize={4} />
                  Our rules
                </Link>
              </Flex>
              {hasMemberRole && (
                <Tooltip
                  isDisabled={canCreate}
                  hasArrow
                  label="Only members holding a vote-creator role can start votes. Ask an admin to grant you one."
                >
                  <Box display="inline-block">
                    <Button
                      leftIcon={<Icon as={PiPlusCircle} boxSize={5} />}
                      minH="44px"
                      bg="#9473DC"
                      color="white"
                      _hover={{ bg: "#B79BF0" }}
                      isDisabled={!canCreate}
                      onClick={handleCreatePollClick}
                    >
                      Create vote
                    </Button>
                  </Box>
                </Tooltip>
              )}
            </Flex>

            <VotingBoard
              lanes={lanes}
              loading={loading}
              error={error}
              onRetry={refetch}
              onOpenPoll={(p) => handlePollClick(p, !p.isOngoing)}
              onFinalize={(p) => handlePollClick(p, false)}
              poMembers={poMembers}
              isConnected={isConnected}
              isMember={hasMemberRole}
              canCreate={canCreate}
              onCreate={handleCreatePollClick}
              orgName={userDAO}
            />
          </Box>

          {/* Constitution — "Our rules" (collapsible, below the board). Takes
              the whole gate: the propose rows follow the proposal-creator hat
              rather than bare membership, and the "who can open a vote" section
              describes the same creator sets that enable the Create button. */}
          <OrgConstitution
            voteGate={voteGate}
            onProposeRuleChange={handleProposeRuleChange}
          />

          <CreateVoteModal
            isOpen={showCreatePoll}
            deepLinkedOpen={deepLinkedOpen}
            onClose={handleCreatePollClick}
            proposal={proposal}
            handleInputChange={handleInputChange}
            handleOptionChange={handleOptionChange}
            addOption={addOption}
            removeOption={removeOption}
            handleProposalTypeChange={handleProposalTypeChange}
            handleTransferAddressChange={handleTransferAddressChange}
            handleTransferAmountChange={handleTransferAmountChange}
            handleRestrictedToggle={handleRestrictedToggle}
            toggleRestrictedRole={toggleRestrictedRole}
            handleSetterChange={handleSetterChange}
            handlePollCreated={handlePollCreated}
            loadingSubmit={loadingSubmit}
            roleNames={roleNames}
            votingClasses={votingClasses}
            currentValues={currentRuleValues}
            leaderboardData={leaderboardData}
            ongoingProposals={hybridVotingOngoing}
            contractAddresses={contractAddresses}
            canCreatePoll={canCreatePoll}
            canCreateProposal={canCreateProposal}
            // The same object the builders get, so the configurators and the batch can never
            // disagree about what this org's roles actually are.
            accessV2={accessV2}
          />

          {/* ONE detail surface for ongoing AND completed polls. */}
          <PollDetail
            poll={livePoll}
            isOpen={isDetailOpen}
            onClose={onDetailClose}
            onVote={handleVote}
            onFinalize={handleFinalize}
            contractAddress={getContractAddressForVotingType(
              directDemocracyVotingContractAddress,
              votingContractAddress
            )}
          />
        </Container>
      )}
    </>
  );
};

export default VotingPage;
