import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useTour } from "@/features/tour";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Button,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Input,
  Select,
  Textarea,
  Text,
  Box,
  Alert,
  AlertIcon,
  Tooltip,
  Switch,
  Checkbox,
  Wrap,
  WrapItem,
  IconButton,
  Tag,
  TagLabel,
  Link,
  RadioGroup,
  Radio,
  Stack,
} from "@chakra-ui/react";
import { InfoOutlineIcon, AddIcon, CloseIcon } from "@chakra-ui/icons";
import SubjectRestrictionPicker from '@/components/accessV2/SubjectRestrictionPicker';
import { useRoleNames } from "@/hooks";
import { subjectNamesLabel } from "@/lib/accessV2/subjectNames";
import { hasCompetingSubjectCreation } from "@/lib/accessV2/ids";
import { usePOContext } from "@/context/POContext";
import { useProjectContext } from "@/context/ProjectContext";
import { getNetworkByChainId } from "../../config/networks";
import { getBountyTokenOptions, getTokenByAddress } from "@/util/tokens";
import { formatTokenAmount } from "@/util/formatToken";
import { useOrgPotBalances } from "@/hooks/useOrgPotBalances";
import {
  TRANSFER_DESTINATION,
  TRANSFER_SOURCE,
  BOUNTY_POOL_LABEL,
  paymentManagerAvailability,
  resolveTransferSource,
  amountToWei,
  amountDecimalsError,
  treasuryTransferCopy,
} from "@/lib/voting/treasuryBatches";
import SetterActionSelector from "./SetterActionSelector";
import ElectionConfigurator from "./ElectionConfigurator";
import RoleConfigurator, { parseAutoTitle as parseRoleAutoTitle } from "./RoleConfigurator";
import RoleForm from "@/components/accessV2/RoleForm";
import { ROLE_FORM_KIND, resolveRoleForm, roleConfigToRoleForm, roleFormCopy } from "@/lib/accessV2/roleFormBatch";
import { inputStyles } from '@/components/shared/glassStyles';
import IntentGallery, { INTENT_OPTIONS } from "./create/IntentGallery";
import DurationField from "./create/DurationField";
import BallotReview, { BINDING_REVIEW_BADGE } from "./create/BallotReview";
import useVoteDraft from "@/hooks/useVoteDraft";
import {
  STEP_INTENT,
  STEP_CONFIG,
  STEP_DETAILS,
  STEP_REVIEW,
  CONFIG_TYPES,
  BINDING_TYPES,
  stepsForType,
  resolveEntryStep,
  STEP_ERROR_KEYS,
} from "./create/wizardSteps";
import { configError as computeConfigError, isComplete } from "@/lib/voting/proposalChecks";
import { isDurationAllowed, durationTooShortMessage } from "@/lib/voting/durationLimits";
import { applyAutoCopy, backfillProvenance } from "./create/autoCopy";

const glassLayerStyle = {
  position: "absolute",
  height: "100%",
  width: "100%",
  zIndex: -1,
  borderRadius: "inherit",
  backgroundColor: "rgba(15, 10, 25, 0.97)",
  boxShadow: "inset 0 0 15px rgba(148, 115, 220, 0.15)",
  border: "1px solid rgba(148, 115, 220, 0.3)",
};

// The types that route through official Blended-voting governance are
// `BINDING_TYPES` from ./create/wizardSteps — ONE definition shared with the
// intent gallery's badges and VotingPage's routing, so they cannot disagree.

const shortAddress = (address) => {
  const a = String(address || '');
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
};

// Per-step heading shown under "Create a vote". The config step's title depends
// on the intent, since "Choose the rule change" and "Set up the election" are
// very different screens.
const CONFIG_STEP_TITLES = {
  setter: "Choose the rule change",
  election: "Set up the election",
  createRole: "Configure the role",
  transferFunds: "Choose the payment",
};

function stepTitle(step, type, accessV2 = false) {
  // On a cut-over org the create-role screen also makes GROUPS, so the heading can't say "role".
  if (step === STEP_CONFIG && type === "createRole" && accessV2) return "Set up the role or group";
  if (step === STEP_CONFIG) return CONFIG_STEP_TITLES[type] || "Configure";
  if (step === STEP_DETAILS) return "Vote details";
  if (step === STEP_REVIEW) return "Review your ballot";
  return "";
}

const CreateVoteModal = ({
  isOpen,
  deepLinkedOpen = false,
  onClose,
  proposal,
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
  handlePollCreated,
  loadingSubmit,
  // Optional overrides — CreateVoteModal derives projects from ProjectContext
  // when these aren't provided (ProjectProvider sits above the voting page in
  // _app.js). Kept as props so callers can still inject test data.
  allProjects: allProjectsProp,
  roleNames = {},
  projectNames: projectNamesProp,
  votingClasses = [],
  currentValues = null,
  leaderboardData = [],
  ongoingProposals = [],
  // Org contract addresses keyed by CONTRACT_MAP contextKey. Used to hide
  // rule-change actions targeting contracts this org never deployed.
  contractAddresses = null,
  // Per-contract creator gates (on-chain creator hats via useVoteCreateGate).
  // Binding intents submit through Hybrid, the rest through DirectDemocracy;
  // the sets can differ, so the gallery disables cards the user can't submit.
  canCreatePoll = true,
  canCreateProposal = true,
  // Access-v2 facts from VotingPage (the SAME object the proposal builders get). Null / disabled
  // on a legacy org, where every branch below falls through to the legacy rendering.
  accessV2 = null,
}) => {
  const { allRoles, resolveSubjectName } = useRoleNames();
  const accessV2Enabled = Boolean(accessV2?.enabled);
  const { orgChainId, taskManagerContractAddress } = usePOContext();
  const { projectsData } = useProjectContext() || {};
  const orgNetwork = getNetworkByChainId(orgChainId);
  const nativeCurrencySymbol = orgNetwork?.nativeCurrency?.symbol || 'ETH';

  const isTransfer = proposal.type === 'transferFunds';
  const isBountyPool = isTransfer && proposal.transferDestination === TRANSFER_DESTINATION.BOUNTY_POOL;

  // Assets a treasury payout can move: the chain's native currency plus every
  // ERC20 configured for this chain. The task-reward pool is ERC20-only — the
  // TaskManager pays bounties with an ERC20 transfer — so the native currency is
  // not offered for it.
  const transferAssetOptions = useMemo(() => ([
    ...(isBountyPool ? [] : [
      { address: '', symbol: nativeCurrencySymbol, label: `${nativeCurrencySymbol} — ${orgNetwork?.name ? `${orgNetwork.name}'s` : 'the chain’s'} native currency` },
    ]),
    ...getBountyTokenOptions(orgChainId).map(t => ({
      address: t.address,
      symbol: t.symbol,
      label: `${t.symbol} — ${t.name}`,
    })),
  ]), [nativeCurrencySymbol, orgChainId, isBountyPool, orgNetwork]);

  // Symbol for the currently selected asset — drives the amount label, the
  // auto-written title/description and the review screen's payout row.
  const transferSymbol = useMemo(() => (
    transferAssetOptions.find(a => a.address === (proposal.transferToken || ''))?.symbol
      || nativeCurrencySymbol
  ), [transferAssetOptions, proposal.transferToken, nativeCurrencySymbol]);
  const transferDecimals = useMemo(() => (
    proposal.transferToken
      ? getTokenByAddress(proposal.transferToken).decimals
      : (orgNetwork?.nativeCurrency?.decimals ?? 18)
  ), [proposal.transferToken, orgNetwork]);
  // Same precision rule as /treasury's ledger (TokenBalancesGrid): two places
  // for a dollar-pegged asset, four otherwise — so the wizard and the ledger
  // print the same balance the same way. Zeros are padded to the column.
  const potPrecision = useMemo(() => {
    const stable = proposal.transferToken
      ? Boolean(getTokenByAddress(proposal.transferToken).isStable)
      : Boolean(orgNetwork?.nativeCurrency?.usdPegged);
    return stable ? 2 : 4;
  }, [proposal.transferToken, orgNetwork]);
  const fmtPot = useCallback((wei) => {
    const s = formatTokenAmount(wei, transferDecimals, potPrecision);
    return s === '0' ? `0.${'0'.repeat(potPrecision)}` : s;
  }, [transferDecimals, potPrecision]);

  // ---- Which pot pays? ----
  // The org's money sits in three places (lib/voting/treasuryBatches explains
  // why). Read them live for the selected asset, work out which one can cover
  // the amount, and write the answer into the form so submit encodes exactly
  // what this screen showed.
  const pots = useOrgPotBalances({ token: proposal.transferToken || '', enabled: isOpen && isTransfer });
  const pmAvailability = useMemo(() => paymentManagerAvailability({
    balance: pots.paymentManager,
    distributions: pots.distributions,
    token: proposal.transferToken || '',
  }), [pots.paymentManager, pots.distributions, proposal.transferToken]);
  const transferAmountWei = useMemo(
    () => amountToWei(proposal.transferAmount, transferDecimals),
    [proposal.transferAmount, transferDecimals],
  );
  const sourceResolution = useMemo(() => resolveTransferSource({
    amountWei: transferAmountWei ?? 0n,
    executorBalance: pots.executor,
    paymentManager: pmAvailability,
  }), [transferAmountWei, pots.executor, pmAvailability]);
  // A single pot must cover the whole amount (the batch never splits a payout).
  const transferAvailableWei = useMemo(() => {
    const exec = BigInt(pots.executor || '0');
    const pm = BigInt(pmAvailability.spendableAfterRelease || '0');
    return (exec > pm ? exec : pm).toString();
  }, [pots.executor, pmAvailability.spendableAfterRelease]);
  const potsSettled = !pots.loading && !pots.error;
  // One sentence for the cap, used by the inline field error and the pure
  // config gate alike.
  const overLimitMessage = useMemo(
    () => `Only ${fmtPot(transferAvailableWei)} ${transferSymbol} can go out in one vote.`,
    [fmtPot, transferAvailableWei, transferSymbol],
  );

  const sourceLabelFor = useCallback((source, finalizeIds) => {
    if (source === TRANSFER_SOURCE.PAYMENT_MANAGER) {
      const closing = (finalizeIds || []).length > 0
        ? ` (after closing fully-claimed payout round${finalizeIds.length === 1 ? '' : 's'} ${finalizeIds.map((id) => `#${id}`).join(', ')})`
        : '';
      return `the treasury — ${fmtPot(pmAvailability.spendableAfterRelease)} ${transferSymbol} there before this payout${closing}`;
    }
    return `the group's wallet — ${fmtPot(pots.executor)} ${transferSymbol} there before this payout`;
  }, [fmtPot, pmAvailability.spendableAfterRelease, pots.executor, transferSymbol]);

  // The task-reward pool IS the TaskManager: lock the recipient to it, and pick
  // the first ERC20 when the native currency was selected before the switch.
  useEffect(() => {
    if (!isBountyPool) return;
    const patch = {};
    if (taskManagerContractAddress && proposal.transferAddress !== taskManagerContractAddress) {
      patch.transferAddress = taskManagerContractAddress;
    }
    if (!proposal.transferToken && transferAssetOptions[0]?.address) {
      patch.transferToken = transferAssetOptions[0].address;
    }
    if (Object.keys(patch).length > 0) handleSetterChange(patch);
  }, [isBountyPool, taskManagerContractAddress, proposal.transferAddress, proposal.transferToken, transferAssetOptions, handleSetterChange]);

  // Persist the resolved source (and the payout rounds to close first) into
  // the form. Only on a settled read: while balances load the answer is
  // "unknown", not "nothing", and a stale answer must not be written over it.
  useEffect(() => {
    if (!isTransfer || !potsSettled) return;
    const ok = sourceResolution.ok;
    const next = {
      transferSource: ok ? sourceResolution.source : '',
      transferFinalizeIds: ok ? sourceResolution.finalizeIds : [],
      transferSourceLabel: ok ? sourceLabelFor(sourceResolution.source, sourceResolution.finalizeIds) : '',
    };
    const same = proposal.transferSource === next.transferSource
      && proposal.transferSourceLabel === next.transferSourceLabel
      && JSON.stringify(proposal.transferFinalizeIds || []) === JSON.stringify(next.transferFinalizeIds);
    if (!same) handleSetterChange(next);
  }, [
    isTransfer, potsSettled, sourceResolution, sourceLabelFor, handleSetterChange,
    proposal.transferSource, proposal.transferSourceLabel, proposal.transferFinalizeIds,
  ]);
  const { currentStepDef, isActive: isTourActive } = useTour();
  const isTourStep = isTourActive && currentStepDef?.id === 'create-vote-preview';

  // Derive project data from ProjectContext, with props as overrides. This
  // un-bricks RoleConfigurator's "Add project" and the "Set Project Role
  // Permissions" setter template without any VotingPage change.
  const allProjects = useMemo(() => {
    if (allProjectsProp && allProjectsProp.length > 0) return allProjectsProp;
    return projectsData || [];
  }, [allProjectsProp, projectsData]);

  const projectNames = useMemo(() => {
    if (projectNamesProp && Object.keys(projectNamesProp).length > 0) return projectNamesProp;
    const map = {};
    for (const p of (projectsData || [])) {
      if (p?.id) map[p.id] = p.name || p.title || p.id;
    }
    return map;
  }, [projectNamesProp, projectsData]);

  // ---- Draft autosave ----
  const draft = useVoteDraft({ isOpen, proposal });

  // ---- Touched gating for inline errors ----
  // A pristine form must not open covered in red: error styling appears only
  // after the member has interacted with (blurred/changed) that field. The
  // Create button still gates on the FULL error set + names the first missing
  // thing in its tooltip.
  const [touched, setTouched] = useState({});
  useEffect(() => {
    if (isOpen) setTouched({});
  }, [isOpen]);
  const markTouched = useCallback((key) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  // ---- Wizard step machine ----
  // The gallery renders off `step`, NOT off `!proposal.type`. That is what makes
  // a fresh open always land on "what do you want to do?" even though
  // defaultProposal.type is still "normal" — and it keeps `type: ''` unreachable,
  // so useProposalForm's empty-type branches (buildProposalData's trailing else,
  // the validator switchboard, VotingPage's DD-vs-hybrid routing) stay dead.
  const [step, setStep] = useState(STEP_INTENT);

  const steps = useMemo(() => stepsForType(proposal.type), [proposal.type]);
  const stepIndex = steps.indexOf(step);
  const nextStep = steps[stepIndex + 1] || null;
  const prevStep = stepIndex > 0 ? steps[stepIndex - 1] : null;

  // Re-derive the entry step on every open. One walk covers all of it: a
  // pristine form stops at the gallery, a deep-linked setter payload
  // (VotingPage.handleProposeRuleChange batches restoreProposal + open in the
  // same tick) stops at details, a restored draft stops where it left off.
  useEffect(() => {
    if (!isOpen) return;
    // A deep link arrives with its config already satisfied and should land on
    // the step that payload reaches. Every other open starts at the gallery —
    // including reopening after abandoning a half-built vote, where resolving
    // to "first incomplete step" would drop the member back into the middle of
    // a flow they just left. Draft restore does its own resolve, on click.
    if (!deepLinkedOpen) {
      setStep(STEP_INTENT);
      return;
    }
    // A fully-specified deep link resolves to `review`. Stop one short: the
    // member should always get to see and edit the title, description and
    // duration before confirming a ballot they did not assemble themselves.
    const entry = resolveEntryStep(proposal, { isComplete });
    setStep(entry === STEP_REVIEW ? STEP_DETAILS : entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, deepLinkedOpen]);

  // Clamp if the type changes out from under the current step.
  useEffect(() => {
    setStep((s) => (stepsForType(proposal.type).includes(s) ? s : STEP_INTENT));
  }, [proposal.type]);

  // ---- transferFunds prefill ----
  // The payout IS the decision, so once recipient + amount are valid the title
  // and description write themselves. The other four types are prefilled by
  // their own configurators; this one has no configurator to own it.
  // applyAutoCopy returns {} once the copy matches what we last wrote (or the
  // member has edited it), so this settles after one pass instead of looping.
  useEffect(() => {
    if (proposal.type !== 'transferFunds') return;
    const address = proposal.transferAddress || '';
    const amount = parseFloat(proposal.transferAmount);
    if (!/^0x[a-fA-F0-9]{40}$/.test(address) || isNaN(amount) || amount <= 0) return;
    // Unlike the configurators, this effect refires on every keystroke — so an
    // empty field here means the member is deleting our suggestion, not that
    // there is nothing yet. Refilling it would make the box impossible to clear.
    const clearedTitle = !proposal.name && Boolean(proposal.autoTitle);
    const clearedDescription = !proposal.description && Boolean(proposal.autoDescription);
    const copy = treasuryTransferCopy({
      amount,
      symbol: transferSymbol,
      recipient: address,
      destination: proposal.transferDestination,
    });
    const patch = applyAutoCopy(proposal, {
      title: clearedTitle ? null : copy.title,
      description: clearedDescription ? null : copy.description,
    });
    if (Object.keys(patch).length > 0) handleSetterChange(patch);
  }, [
    proposal.type, proposal.transferAddress, proposal.transferAmount, proposal.transferToken,
    proposal.transferDestination,
    proposal.name, proposal.description, proposal.autoTitle, proposal.autoDescription,
    transferSymbol, handleSetterChange, proposal,
  ]);

  const isBinding = BINDING_TYPES.has(proposal.type);

  // The ballot as voters will actually see it. The binding types don't keep
  // their choices in `proposal.options` — those are synthesized at submit time
  // — so without this the review screen reads "(no options yet)" for a vote
  // that is really Apply Changes / Reject. Mirrors the optionNames built in
  // useProposalForm.buildProposalData for each type.
  const reviewOptions = useMemo(() => {
    if (proposal.type === 'setter') return ['Apply Changes', 'Reject'];
    if (proposal.type === 'createRole') {
      // The v2 form can be making a GROUP — the ballot has to name what it actually creates.
      // The same resolution the encoder uses, so the review can never say “group” to a ballot
      // that creates a role.
      return accessV2Enabled && resolveRoleForm(proposal).kind === ROLE_FORM_KIND.GROUP
        ? ['Create group', 'Reject']
        : ['Create role', 'Reject'];
    }
    if (proposal.type === 'election') {
      const names = (proposal.electionCandidates || []).map(c => c.name).filter(Boolean);
      return proposal.electionIncludeNoOneOption ? [...names, 'No One'] : names;
    }
    // normal + transferFunds already derive correctly inside BallotReview.
    return undefined;
  }, [
    proposal.type,
    proposal.electionCandidates,
    proposal.electionIncludeNoOneOption,
    proposal.roleFormV2?.kind,
    accessV2Enabled,
  ]);
  const selectedIntent = useMemo(
    () => INTENT_OPTIONS.find(o => o.type === proposal.type),
    [proposal.type],
  );

  // Build a list of currently-active createRole proposals, keyed by parent
  // hatId. We parse the auto-title sentinel "Create role: <name> (under <parent>)"
  // and resolve the parent NAME back to its hatId via allRoles. This is what
  // gates concurrent role creation under the same parent (which would race
  // on Hats.getNextId — see useProposalForm createRole branch).
  const activeCreateRoleProposals = useMemo(() => {
    const out = [];
    for (const p of (ongoingProposals || [])) {
      const parsed = parseRoleAutoTitle(p.title);
      if (!parsed) continue;
      const parentRole = allRoles.find(r => r.name === parsed.parentName);
      if (!parentRole) continue;
      out.push({
        proposalId: p.proposalId ?? p.id,
        name: parsed.name,
        parentName: parsed.parentName,
        parentHatId: String(parentRole.hatId),
        title: p.title,
      });
    }
    return out;
  }, [ongoingProposals, allRoles]);

  // ── Access v2 ──────────────────────────────────────────────────────────────
  // WHO HOLDS A ROLE comes from the authority's fold mirror, not from the legacy hat roster: a
  // role created after cutover has no hat at all, and anyone who joined since holds no hat token,
  // so `leaderboardData` would show an empty or stale seat list. That is not cosmetic — the
  // election batch is built from this list and the contract reverts on a wrong one (`grant` ->
  // AlreadyMember, `remove` -> NotMember), silently, inside announceWinner's try/catch.
  // ACCEPTED, not active: `remove` only needs acceptance, so a lapsed member still holds a seat.
  const v2HoldersReady = accessV2Enabled && (accessV2?.memberships || []).length > 0;
  const v2HolderResolver = useMemo(() => {
    // Null on a legacy org — ElectionConfigurator then keeps its own leaderboard derivation,
    // unchanged.
    if (!accessV2Enabled) return null;
    const rows = accessV2?.memberships || [];
    const knownNames = new Map(
      (leaderboardData || []).map(u => [String(u.address).toLowerCase(), u.name]),
    );
    return (subjectId) => {
      const id = String(subjectId ?? '');
      if (!id) return [];
      return rows
        .filter(m => String(m.subjectId) === id && m.accepted)
        .map(m => ({
          address: m.user,
          name: knownNames.get(String(m.user).toLowerCase()) || m.username || '',
        }));
    };
  }, [accessV2Enabled, accessV2?.memberships, leaderboardData]);

  // The id-prediction race, v2 flavour: ANY open proposal that creates a role or a group shifts
  // the next subject id — not just one under the same parent, because there are no parents.
  const v2SubjectRaceWarning = useMemo(() => (
    accessV2Enabled && hasCompetingSubjectCreation(ongoingProposals || [])
      ? 'Another open proposal creates a role or group. If it passes first, this role’s '
        + 'permissions and members would land on the wrong role — finish or close that one first.'
      : ''
  ), [accessV2Enabled, ongoingProposals]);

  /**
   * Everything RoleForm needs to describe the org back to the member, and everything the encoder
   * needs to predict the new subject's id. The SAME facts /team's modal assembles — this is one
   * form with two doors, so the two ctx objects have to mean the same thing.
   *
   * `indexedSubjects`, not the display list: the migrated top hat is hidden from every surface but
   * still consumed a sequence number, so a prediction that can't see it lands the whole batch on
   * the wrong subject.
   */
  const roleFormCtx = useMemo(() => ({
    authority: accessV2?.authority || contractAddresses?.membershipAuthorityAddress || '',
    hybridVoting: contractAddresses?.votingContractAddress || '',
    taskManagerAddress: taskManagerContractAddress || '',
    indexedSubjects: accessV2?.indexedSubjects?.length ? accessV2.indexedSubjects : (accessV2?.subjects || []),
    roles: accessV2?.roles || [],
    groups: accessV2?.groups || [],
    projects: allProjects,
    votingClasses,
    inOrgUsers: accessV2?.inOrgUsers || new Set(),
    activeProposals: ongoingProposals || [],
  }), [accessV2, contractAddresses, taskManagerContractAddress, allProjects, votingClasses, ongoingProposals]);

  /**
   * The v2 create-role screen owns `proposal.roleFormV2` and, like every other configurator here,
   * writes the title/description suggestion as it goes — `applyAutoCopy` keeps a wording the
   * member typed themselves, so edit → Back → reconfigure survives.
   */
  const [roleFormStatus, setRoleFormStatus] = useState({ atReview: false, blocked: null });

  const handleRoleFormChange = useCallback((nextForm) => {
    const copy = roleFormCopy(nextForm);
    handleSetterChange({
      roleFormV2: nextForm,
      ...applyAutoCopy(proposal, { title: copy.title, description: copy.description }),
    });
  }, [proposal, handleSetterChange]);

  // ---- Inline validation (mirrors useProposalForm.fieldErrors; kept local so
  // this component stays compatible with the current VotingPage prop set) ----
  const fieldErrors = useMemo(() => {
    const errors = {};
    const setterProvidesTitle =
      proposal.type === 'setter' && proposal.setterMode === 'template' && proposal.setterTemplate;
    if (!setterProvidesTitle && (!proposal.name || proposal.name.trim() === '')) {
      errors.name = 'Give your vote a title.';
    }
    if (!isDurationAllowed(proposal.time)) {
      errors.time = durationTooShortMessage();
    }
    if (proposal.type === 'normal') {
      const nonEmpty = (proposal.options || []).filter(o => o.trim() !== '');
      if (nonEmpty.length < 2) errors.options = 'Add at least 2 options.';
    }
    if (proposal.type === 'transferFunds') {
      if (!proposal.transferAddress || !/^0x[a-fA-F0-9]{40}$/.test(proposal.transferAddress)) {
        errors.transferAddress = 'Enter a valid recipient address (0x…).';
      }
      const amt = parseFloat(proposal.transferAmount);
      if (isNaN(amt) || amt <= 0) {
        errors.transferAmount = 'Enter an amount greater than 0.';
      } else {
        const decimalsError = amountDecimalsError(proposal.transferAmount, transferDecimals, transferSymbol);
        if (decimalsError) {
          errors.transferAmount = decimalsError;
        } else if (
          // Over the cap: said right under the field, in red, the moment it is
          // typed — a disabled Next with a hover-only tooltip is no feedback on
          // a money screen. Only on a SETTLED balance read.
          potsSettled && transferAmountWei !== null && transferAmountWei > BigInt(transferAvailableWei || '0')
        ) {
          errors.transferAmount = overLimitMessage;
        }
      }
    }
    if (proposal.isRestricted && (proposal.restrictedHatIds?.length ?? 0) === 0) {
      errors.restrictedHatIds = 'Pick at least one role, or turn restriction off.';
    }
    return errors;
  }, [proposal, transferDecimals, transferSymbol, potsSettled, transferAmountWei, transferAvailableWei, overLimitMessage]);

  // Errors shown in the UI — only for fields the member has touched.
  const visibleErrors = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(fieldErrors)) {
      // The amount is the one field whose error must show WHILE typing (an
      // over-budget payout), so having typed anything counts as touched.
      const typedAmount = k === 'transferAmount' && String(proposal.transferAmount ?? '') !== '';
      if (touched[k] || typedAmount) out[k] = v;
    }
    return out;
  }, [fieldErrors, touched, proposal.transferAmount]);

  // The config screen's gate is a predicate, not a field-key list — it is the
  // same expression the submit-time validators use (lifted into
  // lib/voting/proposalChecks so there is exactly one copy of each message).
  // Live facts the pure checks can't know: the asset's precision and how much
  // the group can actually pay out. Only refuses on a SETTLED balance read.
  const transferCtx = useMemo(() => (isTransfer ? {
    transfer: {
      decimals: transferDecimals,
      symbol: transferSymbol,
      loading: Boolean(pots.loading),
      readFailed: Boolean(pots.error),
      // More payout rounds than the hook reads: an older unfinalized round still pins the
      // PaymentManager's balance on chain, so `spendable` would be a guess — refuse, don't guess.
      roundsUnread: Boolean(pots.distributionsTruncated ?? pots.data?.distributionsTruncated),
      availableWei: transferAvailableWei,
      overLimitMessage,
    },
  } : null), [isTransfer, transferDecimals, transferSymbol, pots.loading, pots.error, pots.distributionsTruncated, pots.data?.distributionsTruncated, transferAvailableWei, overLimitMessage]);
  // The whole live-facts context for the pure gates. The access-v2 flag drops the create-role
  // rules that describe a Hats tree this org no longer has (parent role, uint32 max supply) —
  // exactly the fields the configurator stops rendering below.
  const checkCtx = useMemo(
    () => ({ ...(transferCtx || {}), accessV2: { enabled: accessV2Enabled } }),
    [transferCtx, accessV2Enabled],
  );
  const configError = useMemo(() => computeConfigError(proposal, checkCtx), [proposal, checkCtx]);

  // Only complain about something the member can actually see. A blank title on
  // the details step must not disable Next on the config step, and the
  // disabled-button tooltip can never name a field two screens away.
  //
  // `review` is the last gate, so it ORs in configError too: pressing "Create
  // vote" can never toast about a config problem the user would have to
  // navigate back to.
  const firstError = useMemo(() => {
    if (step === STEP_CONFIG) return configError;
    for (const k of (STEP_ERROR_KEYS[step] || [])) {
      if (fieldErrors[k]) return fieldErrors[k];
    }
    if (step === STEP_REVIEW) return configError;
    return null;
  }, [step, configError, fieldErrors]);

  // The v2 role/group form runs its own steps INSIDE the config step. While the member is still
  // walking them there must be exactly one Next on screen — the form's — so the footer primary is
  // hidden until the form reaches its review, and refused while the form reports a blocker
  // (a batch over the on-chain call ceiling).
  const roleFormMounted = step === STEP_CONFIG && proposal.type === 'createRole' && accessV2Enabled;
  const roleFormMidFlow = roleFormMounted && !roleFormStatus.atReview;
  const roleFormBlocked = roleFormMounted ? roleFormStatus.blocked : null;

  // Creator gate for the CURRENT proposal type — not just the intent gallery.
  // A restored draft (or a deep link) jumps past the gallery straight into
  // later steps, and the poll/proposal creator sets can differ, so the gate
  // must hold at every step and at final submission, or a poll-only creator
  // submits a Hybrid draft into a contract rejection after the IPFS upload.
  const typeAllowed = isTourActive
    || (BINDING_TYPES.has(proposal.type) ? canCreateProposal : canCreatePoll);

  // Gates leaving the current step (and, on the last step, submitting).
  const canSubmit = !firstError && !isTourStep && typeAllowed && !roleFormMidFlow && !roleFormBlocked;

  const whoCanVoteLabel = useMemo(() => {
    // A payout is binding (Blended voting) but can still be restricted to roles,
    // so the restriction wins the label when it is on.
    if (isBinding && !proposal.isRestricted) return 'All members (Blended voting)';
    if (!proposal.isRestricted) return 'All members';
    // NEVER fall back to "All members" for a RESTRICTED poll: that is the inverse of the truth,
    // shown at the exact moment the creator is confirming the restriction. The picker writes v2
    // subject ids — including GROUP ids and v2-native role ids, neither of which is in the legacy
    // Hats list — so names come from the v2-aware resolver, which ends at a short id label rather
    // than at a lie. (An empty selection is a validation error, not "everyone".)
    const label = subjectNamesLabel(proposal.restrictedHatIds, resolveSubjectName);
    return label || 'No roles selected yet';
  }, [isBinding, proposal.isRestricted, proposal.restrictedHatIds, resolveSubjectName]);

  // ---- Type selection via the intent gallery / change-chip ----
  const handleSelectIntent = useCallback((type) => {
    // Re-picking the card you already chose must not wipe your work —
    // handleProposalTypeChange clears options / election fields / roleConfig.
    if (type !== proposal.type) handleProposalTypeChange({ target: { value: type } });
    setStep(CONFIG_TYPES.has(type) ? STEP_CONFIG : STEP_DETAILS);
  }, [proposal.type, handleProposalTypeChange]);

  // Back to the gallery is now pure navigation. It used to synthesize an empty
  // select, which ran the full clear branch in handleProposalTypeChange and
  // destroyed everything the member had entered just for looking.
  const handleChangeType = useCallback(() => setStep(STEP_INTENT), []);

  const goBack = useCallback(() => {
    if (prevStep) setStep(prevStep);
  }, [prevStep]);

  // ---- Restore draft on open ----
  const handleRestoreDraft = useCallback(() => {
    if (!draft.pendingDraft) return;
    // handleSetterChange is the form's general-purpose merge setter — safe to
    // restore any subset of fields (options, setterValues, roleConfig, election
    // arrays, restrictions, etc.) in one shot.
    //
    // backfillProvenance teaches a draft saved before autoTitle/autoDescription
    // existed which of its copy we generated, so restoring one keeps its
    // regenerate-on-change behaviour instead of freezing as "user typed this".
    const restored = { ...backfillProvenance(draft.pendingDraft) };
    // A draft saved before the v2 form existed carries `roleConfig` and no `roleFormV2`. Bridge it
    // HERE so the screen shows the role the encoder will build — otherwise the form renders blank
    // while `resolveRoleForm` quietly encodes fields the member can no longer see or edit.
    if (
      accessV2Enabled
      && !String(restored.roleFormV2?.name || '').trim()
      && String(restored.roleConfig?.name || '').trim()
    ) {
      restored.roleFormV2 = roleConfigToRoleForm(restored.roleConfig);
    }
    draft.markRestored();
    handleSetterChange({ ...restored });
    setStep(resolveEntryStep(restored, { isComplete }));
  }, [draft, handleSetterChange, accessV2Enabled]);

  const handleStartFresh = useCallback(() => {
    draft.startFresh();
    handleProposalTypeChange({ target: { value: 'normal' } });
    handleSetterChange({
      name: '', description: '', autoTitle: '', autoDescription: '',
      time: 72, options: ['', ''],
      transferAddress: '', transferAmount: '', isRestricted: false, restrictedHatIds: [],
      // The setter block was never cleared here, so "Start fresh" used to leave
      // the previous rule change armed behind a blank-looking form.
      setterMode: 'template', setterTemplate: '', setterCategory: '',
      setterContract: '', setterFunction: '', setterValues: {}, setterParams: [],
    });
    setStep(STEP_INTENT);
  }, [draft, handleProposalTypeChange, handleSetterChange]);

  // ---- Submit ----
  const doSubmit = useCallback(async () => {
    const result = await handlePollCreated();
    if (result === true) {
      draft.clear();
      // Leave a clean gallery behind rather than a review screen over a form
      // that useProposalForm has already reset.
      setStep(STEP_INTENT);
    }
  }, [handlePollCreated, draft]);

  const handleFooterPrimary = useCallback(() => {
    if (isTourStep) return;
    if (nextStep) {
      setStep(nextStep);
      return;
    }
    doSubmit();
  }, [isTourStep, nextStep, doSubmit]);

  const primaryLabel = isTourStep
    ? 'Demo only'
    : nextStep === STEP_REVIEW
      ? 'Review ballot'
      : nextStep
        ? 'Next'
        : 'Create vote';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={{ base: 'full', md: 'xl' }}
      isCentered
      scrollBehavior="inside"
      {...(isTourStep && { zIndex: 10001 })}
    >
      <ModalOverlay bg={isTourStep ? "transparent" : "blackAlpha.800"} />
      <ModalContent
        bg="transparent"
        borderRadius={{ base: 'none', md: 'xl' }}
        position="relative"
        boxShadow="dark-lg"
        mx={{ base: 0, md: 4 }}
        maxH="min(85dvh, 900px)"
      >
        <Box style={glassLayerStyle} />

        <ModalHeader color="white" fontSize="xl" fontWeight="bold" pb={2}>
          Create a vote
          {step !== STEP_INTENT && (
            <Text fontSize="xs" fontWeight="medium" color="gray.400" mt={0.5} noOfLines={1}>
              Step {stepIndex + 1} of {steps.length} · {stepTitle(step, proposal.type, accessV2Enabled)}
            </Text>
          )}
        </ModalHeader>
        <ModalCloseButton color="white" />

        <ModalBody pb={6}>
          <VStack spacing={6} align="stretch">
            {/* Restore-draft prompt */}
            {draft.pendingDraft && (
              <Alert status="info" borderRadius="md" bg="rgba(148, 115, 220, 0.15)" fontSize="sm">
                <AlertIcon color="purple.300" />
                <HStack justify="space-between" w="100%" flexWrap="wrap" spacing={2}>
                  <Text color="gray.200">Restored your unsaved draft.</Text>
                  <HStack spacing={3}>
                    <Link color="purple.200" fontWeight="medium" onClick={handleRestoreDraft}>
                      Restore
                    </Link>
                    <Link color="gray.400" onClick={handleStartFresh}>
                      Start fresh?
                    </Link>
                  </HStack>
                </HStack>
              </Alert>
            )}

            {step === STEP_INTENT ? (
              /* ---- Step 1: intent gallery ---- */
              <Box>
                <Text
                  fontSize="xs"
                  fontWeight="bold"
                  color="purple.300"
                  mb={3}
                  textTransform="uppercase"
                  letterSpacing="wide"
                >
                  What do you want to do?
                </Text>
                <IntentGallery
                  onSelect={handleSelectIntent}
                  // Tour demo never submits ("Demo only"), so keep every card
                  // walkable there regardless of the viewer's creator hats.
                  canCreatePoll={isTourActive || canCreatePoll}
                  canCreateProposal={isTourActive || canCreateProposal}
                  // On a cut-over org the create-role card also makes GROUPS, and says so.
                  accessV2={accessV2Enabled}
                />
              </Box>
            ) : (
              <>
                {/* Selected-type chip + change. Hidden on review, which carries
                    its own BINDING/POLL badge. */}
                {step !== STEP_REVIEW && (
                  <HStack justify="space-between" flexWrap="wrap" spacing={2}>
                    <Tag size="md" colorScheme="purple" variant="subtle" borderRadius="full">
                      <TagLabel>
                        {(accessV2Enabled && selectedIntent?.v2Title)
                          || selectedIntent?.title
                          || proposal.type}
                      </TagLabel>
                    </Tag>
                    <Link fontSize="sm" color="purple.200" onClick={handleChangeType}>
                      change
                    </Link>
                  </HStack>
                )}

                {/* Binding-governance banner */}
                {isBinding && step !== STEP_REVIEW && (
                  <Alert status="info" borderRadius="md" bg="rgba(66, 153, 225, 0.15)" fontSize="sm">
                    <AlertIcon color="blue.300" />
                    <Text color="gray.200">
                      This creates a binding vote — it runs through your group's official
                      Blended-voting governance.
                    </Text>
                  </Alert>
                )}

                {/* ---- Review your ballot (final step, every type) ---- */}
                {step === STEP_REVIEW && (
                  <BallotReview
                    proposal={proposal}
                    whoCanVoteLabel={whoCanVoteLabel}
                    symbol={transferSymbol}
                    {...(isBinding ? { badge: BINDING_REVIEW_BADGE } : {})}
                    {...(reviewOptions ? { options: reviewOptions } : {})}
                  />
                )}

                {/* Vote Details Section */}
                {step === STEP_DETAILS && (
                <Box>
                  <Text
                    fontSize="xs"
                    fontWeight="bold"
                    color="purple.300"
                    mb={3}
                    textTransform="uppercase"
                    letterSpacing="wide"
                  >
                    Vote Details
                  </Text>
                  <VStack spacing={4} align="stretch">
                    <FormControl isInvalid={Boolean(visibleErrors.name)}>
                      <FormLabel color="gray.200" fontSize="sm">
                        Vote Title
                      </FormLabel>
                      <Input
                        placeholder="Enter title"
                        name="name"
                        value={proposal.name}
                        onChange={handleInputChange}
                        onBlur={() => markTouched('name')}
                        {...inputStyles}
                      />
                      {visibleErrors.name && <FormErrorMessage>{visibleErrors.name}</FormErrorMessage>}
                    </FormControl>

                    <FormControl>
                      <FormLabel color="gray.200" fontSize="sm">
                        Description
                      </FormLabel>
                      <Textarea
                        placeholder="Enter description"
                        name="description"
                        value={proposal.description}
                        onChange={handleInputChange}
                        h="120px"
                        {...inputStyles}
                      />
                    </FormControl>

                    <DurationField
                      value={proposal.time}
                      onChange={(hours) => {
                        markTouched('time');
                        handleInputChange({ target: { name: 'time', value: hours } });
                      }}
                      isInvalid={Boolean(visibleErrors.time)}
                      errorMessage={visibleErrors.time}
                    />

                    {/* A basic poll's options are its only decision, so they
                        stay here beside the title rather than earning a screen
                        of their own. */}
                    {proposal.type === "normal" && (
                      <FormControl isInvalid={Boolean(visibleErrors.options)}>
                        <FormLabel color="gray.200" fontSize="sm">
                          Voting Options
                        </FormLabel>
                        <VStack spacing={2} align="stretch">
                          {proposal.options.map((option, index) => (
                            <HStack key={index} spacing={2}>
                              <Input
                                placeholder={`Option ${index + 1}`}
                                value={option}
                                onChange={(e) => handleOptionChange(index, e.target.value)}
                                onBlur={() => markTouched('options')}
                                {...inputStyles}
                              />
                              <IconButton
                                aria-label="Remove option"
                                icon={<CloseIcon boxSize={2.5} />}
                                size="sm"
                                variant="ghost"
                                color="gray.400"
                                _hover={{ color: "red.300", bg: "whiteAlpha.100" }}
                                onClick={() => removeOption(index)}
                                isDisabled={proposal.options.length <= 2}
                              />
                            </HStack>
                          ))}
                          <Button
                            leftIcon={<AddIcon boxSize={3} />}
                            size="sm"
                            variant="ghost"
                            color="purple.300"
                            _hover={{ bg: "whiteAlpha.100" }}
                            onClick={addOption}
                            alignSelf="flex-start"
                          >
                            Add Option
                          </Button>
                          {visibleErrors.options && (
                            <FormErrorMessage>{visibleErrors.options}</FormErrorMessage>
                          )}
                        </VStack>
                      </FormControl>
                    )}
                  </VStack>
                </Box>
                )}

                {/* Vote Configuration Section — the type-specific decisions.
                    On its own screen, before the details, so the title and
                    description can arrive pre-filled from these answers. */}
                {step === STEP_CONFIG && (
                <Box>
                  <VStack spacing={4} align="stretch">
                    {proposal.type === "election" && (
                      <ElectionConfigurator
                        proposal={proposal}
                        onChange={handleSetterChange}
                        allRoles={allRoles}
                        leaderboardData={leaderboardData}
                        resolveHolders={v2HolderResolver}
                        holdersReady={accessV2Enabled ? v2HoldersReady : undefined}
                      />
                    )}

                    {/* CREATE ROLE. On a cut-over org this is the SAME form /team's
                        "Create a role or group" modal renders — one screen, one encoder
                        (lib/accessV2/roleFormBatch), so the door you came in by can't decide
                        what your role is allowed to do. A legacy org keeps RoleConfigurator
                        and its Hats-era batch, untouched. */}
                    {proposal.type === "createRole" && (accessV2Enabled ? (
                      <RoleForm
                        value={proposal.roleFormV2}
                        onChange={handleRoleFormChange}
                        ctx={roleFormCtx}
                        variant="dark"
                        onStatus={setRoleFormStatus}
                      />
                    ) : (
                      <RoleConfigurator
                        proposal={proposal}
                        onChange={handleSetterChange}
                        allRoles={allRoles}
                        allProjects={allProjects}
                        leaderboardData={leaderboardData}
                        activeCreateRoleProposals={activeCreateRoleProposals}
                        accessV2Enabled={accessV2Enabled}
                        subjectRaceWarning={v2SubjectRaceWarning}
                      />
                    ))}

                    {proposal.type === "transferFunds" && (
                      <>
                        {/* Where the money goes. The task-reward pool is the
                            TaskManager: what completed tasks pay their bounties
                            from. Today members top it up from their own wallet
                            (/treasury → "Fund task rewards"); this lets the org's
                            treasury do it by vote. */}
                        <FormControl>
                          <FormLabel color="gray.200" fontSize="sm">
                            Where does it go?
                          </FormLabel>
                          <RadioGroup
                            value={proposal.transferDestination || TRANSFER_DESTINATION.ADDRESS}
                            onChange={(value) => handleSetterChange({
                              transferDestination: value,
                              // Leaving the pool: don't keep the TaskManager as
                              // a typed recipient.
                              ...(value === TRANSFER_DESTINATION.ADDRESS
                                && proposal.transferAddress === taskManagerContractAddress
                                ? { transferAddress: '' } : {}),
                            })}
                          >
                            <Stack direction={{ base: 'column', sm: 'row' }} spacing={{ base: 2, sm: 6 }}>
                              <Radio
                                value={TRANSFER_DESTINATION.ADDRESS}
                                colorScheme="purple"
                                data-testid="transfer-destination-address"
                              >
                                <Text fontSize="sm" color="gray.200">Someone's address</Text>
                              </Radio>
                              {taskManagerContractAddress && (
                                <Radio
                                  value={TRANSFER_DESTINATION.BOUNTY_POOL}
                                  colorScheme="purple"
                                  data-testid="transfer-destination-bounty-pool"
                                >
                                  <Text fontSize="sm" color="gray.200">The task-reward pool</Text>
                                </Radio>
                              )}
                            </Stack>
                          </RadioGroup>
                          {isBountyPool && (
                            <Text fontSize="xs" color="gray.400" mt={2}>
                              It can only leave the pool as payment for a completed task.
                            </Text>
                          )}
                        </FormControl>

                        <FormControl>
                          <FormLabel color="gray.200" fontSize="sm">
                            Asset
                          </FormLabel>
                          <Select
                            value={proposal.transferToken || ''}
                            onChange={(e) => handleSetterChange({ transferToken: e.target.value })}
                            data-testid="transfer-asset"
                            {...inputStyles}
                          >
                            {transferAssetOptions.map((asset) => (
                              <option key={asset.address || 'native'} value={asset.address} style={{ background: '#1a1a2e' }}>
                                {asset.label}
                              </option>
                            ))}
                          </Select>
                        </FormControl>

                        {isBountyPool ? (
                          <Box
                            bg="whiteAlpha.50"
                            borderRadius="md"
                            p={3}
                            border="1px solid rgba(148, 115, 220, 0.3)"
                            data-testid="transfer-bounty-pool-recipient"
                          >
                            <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="wide" mb={1}>
                              Recipient
                            </Text>
                            <Text fontSize="sm" color="white">
                              The {BOUNTY_POOL_LABEL}{' '}
                              <Text as="span" fontFamily="mono" color="gray.400">
                                {shortAddress(taskManagerContractAddress)}
                              </Text>
                            </Text>
                          </Box>
                        ) : (
                          <FormControl isInvalid={Boolean(visibleErrors.transferAddress)}>
                            <FormLabel color="gray.200" fontSize="sm">
                              Recipient Address
                            </FormLabel>
                            <Input
                              placeholder="0x..."
                              value={proposal.transferAddress}
                              onChange={handleTransferAddressChange}
                              onBlur={() => markTouched('transferAddress')}
                              data-testid="transfer-recipient"
                              {...inputStyles}
                            />
                            {visibleErrors.transferAddress && (
                              <FormErrorMessage>{visibleErrors.transferAddress}</FormErrorMessage>
                            )}
                          </FormControl>
                        )}

                        <FormControl isInvalid={Boolean(visibleErrors.transferAmount)}>
                          <FormLabel color="gray.200" fontSize="sm">
                            Amount ({transferSymbol})
                          </FormLabel>
                          <Input
                            placeholder={`Amount in ${transferSymbol}`}
                            value={proposal.transferAmount}
                            onChange={handleTransferAmountChange}
                            onBlur={() => markTouched('transferAmount')}
                            type="number"
                            step={transferDecimals <= 6 ? '0.000001' : '0.001'}
                            min="0"
                            // A deep link from /treasury lands here with everything
                            // but the amount decided — put the cursor in it.
                            autoFocus={deepLinkedOpen && isBountyPool}
                            data-testid="transfer-amount"
                            {...inputStyles}
                          />
                          {visibleErrors.transferAmount ? (
                            <FormErrorMessage>{visibleErrors.transferAmount}</FormErrorMessage>
                          ) : (
                            <Text fontSize="xs" color="gray.400" mt={1}>
                              {potsSettled
                                ? `A payout comes from one pot, so up to ${fmtPot(transferAvailableWei)} ${transferSymbol} can move in one vote. Members vote Yes or No.`
                                : pots.error
                                  ? "Couldn't read what the group holds — try again in a moment."
                                  : "Checking what the group holds…"}
                            </Text>
                          )}
                        </FormControl>

                        {/* The three pots, named honestly: what /treasury calls
                            "the treasury" is the payout account; the group's
                            wallet is what a passed vote spends directly. */}
                        <Box
                          bg="whiteAlpha.50"
                          borderRadius="md"
                          p={3}
                          border="1px solid rgba(148, 115, 220, 0.3)"
                          data-testid="transfer-pots"
                        >
                          <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="wide" mb={2}>
                            What the group holds in{' '}
                            <Text as="span" textTransform="none">{transferSymbol}</Text>
                          </Text>
                          <VStack align="stretch" spacing={1}>
                            <HStack justify="space-between">
                              <Text fontSize="sm" color="gray.300">
                                Spendable in the treasury <Text as="span" color="gray.500">· can pay</Text>
                              </Text>
                              <Text fontSize="sm" color="white" fontFamily="mono">
                                {potsSettled ? fmtPot(pmAvailability.spendable) : '…'}
                                {potsSettled && BigInt(pmAvailability.releasable || '0') > 0n && (
                                  <Text as="span" color="gray.400"> (+{fmtPot(pmAvailability.releasable)} in fully-claimed payout rounds)</Text>
                                )}
                              </Text>
                            </HStack>
                            {/* The Executor — what a passed vote spends directly. Empty on
                                every org we have seen, so the row only earns its place when
                                it holds something. */}
                            {potsSettled && BigInt(pots.executor || '0') > 0n && (
                              <HStack justify="space-between">
                                <Text fontSize="sm" color="gray.300">
                                  Group's wallet <Text as="span" color="gray.500">· can pay</Text>
                                </Text>
                                <Text fontSize="sm" color="white" fontFamily="mono">{fmtPot(pots.executor)}</Text>
                              </HStack>
                            )}
                            {isBountyPool && (
                              <HStack justify="space-between">
                                <Text fontSize="sm" color="gray.300">
                                  Task-reward pool <Text as="span" color="gray.500">· receiving</Text>
                                </Text>
                                <Text fontSize="sm" color="white" fontFamily="mono">{potsSettled ? fmtPot(pots.bountyPool) : '…'}</Text>
                              </HStack>
                            )}
                          </VStack>
                          {potsSettled && transferAmountWei !== null && transferAmountWei > 0n && (
                            <Text
                              fontSize="xs"
                              color={sourceResolution.ok ? 'green.300' : '#F6C177'}
                              mt={2}
                              data-testid="transfer-source"
                            >
                              {sourceResolution.ok
                                ? `Paid from ${proposal.transferSourceLabel || sourceLabelFor(sourceResolution.source, sourceResolution.finalizeIds)}`
                                : 'More than any one pot holds — lower the amount, or deposit to the treasury first.'}
                            </Text>
                          )}
                        </Box>
                      </>
                    )}

                    {proposal.type === "setter" && (
                      <SetterActionSelector
                        proposal={proposal}
                        onChange={handleSetterChange}
                        allRoles={allRoles}
                        allProjects={allProjects}
                        roleNames={roleNames}
                        votingClasses={votingClasses}
                        currentValues={currentValues}
                        projectNames={projectNames}
                        contractAddresses={contractAddresses}
                      />
                    )}
                  </VStack>
                </Box>
                )}

                {/* Voting Restrictions — only for direct-democracy types */}
                {step === STEP_DETAILS && proposal.type !== "election" && proposal.type !== "setter" && proposal.type !== "createRole" && (
                  <Box>
                    <Text
                      fontSize="xs"
                      fontWeight="bold"
                      color="purple.300"
                      mb={3}
                      textTransform="uppercase"
                      letterSpacing="wide"
                    >
                      Voting Restrictions
                    </Text>
                    <VStack spacing={4} align="stretch">
                      <FormControl display="flex" alignItems="center">
                        <HStack flex="1">
                          <FormLabel htmlFor="restricted-voting" mb="0" color="gray.200" fontSize="sm">
                            Restrict who can vote
                          </FormLabel>
                          <Tooltip
                            label="Limit voting to specific roles instead of all members"
                            placement="top"
                            hasArrow
                            bg="gray.700"
                          >
                            <InfoOutlineIcon boxSize={3} color="gray.400" cursor="help" />
                          </Tooltip>
                        </HStack>
                        <Switch
                          id="restricted-voting"
                          isChecked={proposal.isRestricted}
                          onChange={(e) => { markTouched('restrictedHatIds'); handleRestrictedToggle(e.target.checked); }}
                          colorScheme="purple"
                        />
                      </FormControl>

                      {proposal.isRestricted && (
                        <FormControl isInvalid={Boolean(visibleErrors.restrictedHatIds)}>
                          <Box
                            p={4}
                            bg="whiteAlpha.50"
                            borderRadius="md"
                            border="1px solid rgba(148, 115, 220, 0.3)"
                          >
                            <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={3}>
                              Select which roles can vote:
                            </Text>
                            {/* On a v2 org this offers GROUPS as single selections
                                ("Only Executives" = one id that stays correct as roles move in and
                                out of the group). On a legacy org it renders exactly the role
                                checkboxes this block always did. */}
                            <SubjectRestrictionPicker
                              legacyRoles={allRoles}
                              selected={proposal.restrictedHatIds}
                              onToggle={toggleRestrictedRole}
                            />
                            {visibleErrors.restrictedHatIds && (
                              <FormErrorMessage>{visibleErrors.restrictedHatIds}</FormErrorMessage>
                            )}
                          </Box>
                        </FormControl>
                      )}
                    </VStack>
                  </Box>
                )}
              </>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200" pt={4}>
          <HStack spacing={3} w="100%" justify="flex-end">
            {prevStep ? (
              <Button
                variant="ghost"
                onClick={goBack}
                color="gray.400"
                _hover={{ bg: "whiteAlpha.100", color: "white" }}
              >
                Back
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={onClose}
                color="gray.400"
                _hover={{ bg: "whiteAlpha.100", color: "white" }}
              >
                Cancel
              </Button>
            )}
            {/* No primary while the intent gallery is open — a grayed CTA next
                to "what do you want to do?" reads broken, not disabled. The
                tour is the exception: its disabled "Demo only" button is the
                affordance the create-vote-preview step points at. */}
            {(step !== STEP_INTENT || isTourStep) && !roleFormMidFlow && (
              <Tooltip
                label={isTourStep
                  ? "Demo only — finish the tour to create a real proposal"
                  : !typeAllowed
                    ? "Your roles can't submit this kind of vote. Ask an admin to grant you a vote-creator role."
                    : roleFormBlocked || firstError || ''}
                isDisabled={!isTourStep && typeAllowed && !firstError && !roleFormBlocked}
                hasArrow
                placement="top"
              >
                {/* span wrapper so the tooltip still shows on a disabled button */}
                <Box>
                  <Button
                    colorScheme="purple"
                    onClick={handleFooterPrimary}
                    isLoading={loadingSubmit}
                    loadingText="Creating..."
                    isDisabled={!canSubmit}
                  >
                    {primaryLabel}
                  </Button>
                </Box>
              </Tooltip>
            )}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CreateVoteModal;
