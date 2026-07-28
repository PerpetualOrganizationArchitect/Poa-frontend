/**
 * useProposalForm
 * Hook for managing proposal form state and submission
 */

import { useState, useCallback, useMemo } from 'react';
import { useToast } from '@chakra-ui/react';
import { utils, constants as ethersConstants, providers as ethersProviders } from 'ethers';
import {
  SETTER_TEMPLATES,
  RAW_FUNCTIONS,
  CONTRACT_MAP,
  getTemplateById,
} from '@/config/setterDefinitions';
import { usePOContext } from '@/context/POContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { getNetworkByChainId } from '../config/networks';
import { getInfrastructureAddress, CONTRACT_NAMES } from '@/config/contracts';
import { createHatsService } from '@/services/web3/domain/HatsService';
import { ipfsCidToBytes32 } from '@/services/web3/utils/encoding';
import {
  TITLE_PREFIX as ELECTION_TITLE_PREFIX,
  DESCRIPTION_PREFIX as ELECTION_DESCRIPTION_PREFIX,
} from '@/components/voting/ElectionConfigurator';
import {
  TITLE_PREFIX as CREATE_ROLE_TITLE_PREFIX,
  DESCRIPTION_PREFIX as CREATE_ROLE_DESCRIPTION_PREFIX,
  defaultRoleConfig,
} from '@/components/voting/RoleConfigurator';

const defaultProposal = {
  name: "",
  description: "",
  execution: "",
  time: 72,
  options: ["", ""],
  type: "normal",
  transferAddress: "",
  transferAmount: "",
  // Election fields
  electionCandidates: [],           // Array of { name, address }
  electionRoleId: "",               // Hat ID for the role being elected
  electionCurrentHolders: [],       // Array of { name, address } - all holders of the elected hat
  electionSelectedIncumbents: [],   // Array of { name, address } - holders whose hat is at stake
  electionFallbackRoleId: "",       // Hat ID for fallback role given to losers (optional)
  electionFallbackHolders: [],      // Addresses already holding fallback hat (pre-computed)
  electionIncludeNoOneOption: false, // If true, append a "No One" option (empty batch) to the ballot
  // Voting restriction fields
  isRestricted: false,    // Whether to restrict who can vote
  restrictedHatIds: [],   // Hat IDs that can vote (if restricted)
  // Setter fields (for contract settings changes)
  setterMode: "template", // "template" or "advanced"
  setterTemplate: "",     // Template ID if using template mode
  setterContract: "",     // Contract key (e.g., "hybridVoting")
  setterFunction: "",     // Function name (e.g., "setConfig")
  setterValues: {},       // Template input values
  setterParams: [],       // Raw function parameters (for advanced mode)
  // Create-role fields — bundle that builds a multi-call batch:
  //   1. EligibilityModule.createHatWithEligibility(...)
  //   2. EligibilityModule.configureVouching(predictedHatId, ...)       (if vouching)
  //   3. HybridVoting.setCreatorHatAllowed(predictedHatId, true)        (if canVote)
  //   4. TaskManager.setProjectRolePerm(pid, predictedHatId, mask)      (per project)
  //   5. TaskManager.setConfig(ROLE_PERM/CREATOR_HAT/ORGANIZER_HAT, …)  (global perms)
  //   6. EligibilityModule.updateHatMetadata(predictedHatId, name, cid) (if description)
  // Hat ID is pre-computed via Hats.getNextId at submit time.
  roleConfig: { ...defaultRoleConfig },
  id: 0,
};

export function useProposalForm({ onSubmit }) {
  const toast = useToast();
  const { orgChainId } = usePOContext();
  const { addToIpfs } = useIPFScontext();
  const orgNetwork = getNetworkByChainId(orgChainId);
  const nativeCurrencySymbol = orgNetwork?.nativeCurrency?.symbol || 'ETH';
  const [proposal, setProposal] = useState(defaultProposal);
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setProposal(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleOptionChange = useCallback((index, value) => {
    setProposal(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => (i === index ? value : opt)),
    }));
  }, []);

  const addOption = useCallback(() => {
    setProposal(prev => ({ ...prev, options: [...prev.options, ""] }));
  }, []);

  const removeOption = useCallback((index) => {
    setProposal(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  }, []);

  const handleProposalTypeChange = useCallback((e) => {
    const newType = e.target.value;
    // election + setter + createRole all use hybrid voting, which doesn't
    // support hat-restricted voting. Clear restriction state on switch in
    // so a stale toggle doesn't leak into submit.
    const isHybrid = newType === 'election' || newType === 'setter' || newType === 'createRole';
    setProposal(prev => {
      // When switching away from election/createRole, drop auto-generated
      // title/description (matches the sentinel-prefix convention each
      // configurator owns). Preserve anything the user typed themselves.
      const leavingElection = prev.type === 'election' && newType !== 'election';
      const leavingCreateRole = prev.type === 'createRole' && newType !== 'createRole';
      let clearedName = prev.name;
      let clearedDescription = prev.description;
      if (leavingElection && clearedName?.startsWith(ELECTION_TITLE_PREFIX)) clearedName = '';
      if (leavingElection && clearedDescription?.startsWith(ELECTION_DESCRIPTION_PREFIX)) clearedDescription = '';
      if (leavingCreateRole && clearedName?.startsWith(CREATE_ROLE_TITLE_PREFIX)) clearedName = '';
      if (leavingCreateRole && clearedDescription?.startsWith(CREATE_ROLE_DESCRIPTION_PREFIX)) clearedDescription = '';

      return {
        ...prev,
        type: newType,
        name: clearedName,
        description: clearedDescription,
        options: newType === 'normal' ? ["", ""] : [],
        ...(isHybrid ? {
          isRestricted: false,
          restrictedHatIds: [],
        } : {}),
        ...(newType !== 'election' ? {
          electionRoleId: '',
          electionCandidates: [],
          electionCurrentHolders: [],
          electionSelectedIncumbents: [],
          electionFallbackRoleId: '',
          electionFallbackHolders: [],
          electionIncludeNoOneOption: false,
        } : {}),
        ...(newType !== 'createRole' ? {
          roleConfig: { ...defaultRoleConfig },
        } : {}),
      };
    });
  }, []);

  // Direct setter for the intent-gallery card entry. The card UI has no
  // synthetic <select> event, so we synthesize the { target: { value } } shape
  // handleProposalTypeChange expects — keeping ONE code path for type changes so
  // the state transitions (clearing restrictions, election/role fields, etc.)
  // stay byte-identical to the old dropdown flow.
  const setProposalType = useCallback((newType) => {
    handleProposalTypeChange({ target: { value: newType } });
  }, [handleProposalTypeChange]);

  const handleTransferAddressChange = useCallback((e) => {
    setProposal(prev => ({ ...prev, transferAddress: e.target.value }));
  }, []);

  const handleTransferAmountChange = useCallback((e) => {
    setProposal(prev => ({ ...prev, transferAmount: e.target.value }));
  }, []);

  const handleElectionRoleChange = useCallback((roleId) => {
    setProposal(prev => ({ ...prev, electionRoleId: roleId }));
  }, []);

  const handleCandidatesChange = useCallback((candidates) => {
    setProposal(prev => ({ ...prev, electionCandidates: candidates }));
  }, []);

  const addCandidate = useCallback((name, address) => {
    setProposal(prev => ({
      ...prev,
      electionCandidates: [...prev.electionCandidates, { name, address }]
    }));
  }, []);

  const removeCandidate = useCallback((index) => {
    setProposal(prev => ({
      ...prev,
      electionCandidates: prev.electionCandidates.filter((_, i) => i !== index)
    }));
  }, []);

  const handleRestrictedToggle = useCallback((isRestricted) => {
    setProposal(prev => ({
      ...prev,
      isRestricted,
      restrictedHatIds: isRestricted ? prev.restrictedHatIds : [],
    }));
  }, []);

  const handleRestrictedRolesChange = useCallback((hatIds) => {
    setProposal(prev => ({ ...prev, restrictedHatIds: hatIds }));
  }, []);

  const toggleRestrictedRole = useCallback((hatId) => {
    setProposal(prev => {
      const current = prev.restrictedHatIds || [];
      const isSelected = current.includes(hatId);
      return {
        ...prev,
        restrictedHatIds: isSelected
          ? current.filter(id => id !== hatId)
          : [...current, hatId],
      };
    });
  }, []);

  // Setter-related handlers
  const handleSetterChange = useCallback((updates) => {
    setProposal(prev => ({
      ...prev,
      ...updates,
    }));
  }, []);

  const resetForm = useCallback(() => {
    setProposal(defaultProposal);
  }, []);

  // Hydrate the whole form from a persisted draft (useVoteDraft). Merged over
  // defaultProposal so a draft written by an older schema can't leave required
  // keys undefined. Only ever called with the user's own localStorage payload.
  const restoreProposal = useCallback((draft) => {
    if (!draft || typeof draft !== 'object') return;
    setProposal(prev => ({ ...defaultProposal, ...draft }));
  }, []);

  const validateTransferProposal = useCallback(() => {
    if (!proposal.transferAddress || !utils.isAddress(proposal.transferAddress)) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid recipient address.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    const amount = parseFloat(proposal.transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid transfer amount.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    return true;
  }, [proposal.transferAddress, proposal.transferAmount, toast]);

  const validateElectionProposal = useCallback(() => {
    if (!proposal.electionRoleId) {
      toast({
        title: "No Role Selected",
        description: "Please select a role for this election.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    const minCandidates = proposal.electionIncludeNoOneOption ? 1 : 2;
    if (proposal.electionCandidates.length < minCandidates) {
      toast({
        title: "Not Enough Candidates",
        description: proposal.electionIncludeNoOneOption
          ? "An election with the 'No One' option needs at least 1 candidate."
          : "An election needs at least 2 candidates.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    // Validate all candidate addresses
    for (const candidate of proposal.electionCandidates) {
      if (!candidate.address || !utils.isAddress(candidate.address)) {
        toast({
          title: "Invalid Candidate Address",
          description: `"${candidate.name || 'Unnamed'}" has an invalid address.`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }
      if (candidate.address === ethersConstants.AddressZero) {
        toast({
          title: "Invalid Candidate Address",
          description: `"${candidate.name || 'Unnamed'}" uses the zero address. Use the "Allow voters to reject all candidates" option instead.`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }
      if (!candidate.name || candidate.name.trim() === '') {
        toast({
          title: "Missing Candidate Name",
          description: "All candidates must have a name.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }
    }

    return true;
  }, [proposal.electionRoleId, proposal.electionCandidates, proposal.electionIncludeNoOneOption, toast]);

  const validateNormalProposal = useCallback(() => {
    const nonEmpty = (proposal.options || []).filter(opt => opt.trim() !== '');
    if (nonEmpty.length < 2) {
      toast({
        title: "Not Enough Options",
        description: "Please provide at least 2 voting options.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }
    return true;
  }, [proposal.options, toast]);

  const validateCreateRoleProposal = useCallback(() => {
    const rc = proposal.roleConfig || {};
    const fail = (title, description) => {
      toast({ title, description, status: 'error', duration: 5000, isClosable: true });
      return false;
    };

    if (!rc.parentHatId || String(rc.parentHatId).trim() === '') {
      return fail('No Parent Role Selected', 'Pick which role this new role should sit under.');
    }
    if (!rc.name || rc.name.trim() === '') {
      return fail('Missing Role Name', 'Give the new role a name.');
    }
    const maxSupply = Number(rc.maxSupply);
    if (!Number.isFinite(maxSupply) || maxSupply < 1 || maxSupply > 4294967295) {
      return fail('Invalid Max Supply', 'Max supply must be between 1 and 4,294,967,295.');
    }

    if (rc.vouching?.enabled) {
      const quorum = Number(rc.vouching.quorum);
      if (!Number.isFinite(quorum) || quorum < 1) {
        return fail('Invalid Vouching Quorum', 'Vouching quorum must be at least 1.');
      }
      if (!rc.vouching.selfVouch && (!rc.vouching.voucherHatId || String(rc.vouching.voucherHatId).trim() === '')) {
        return fail('Missing Voucher Role', 'Pick the role whose members can vouch, or toggle on self-vouching.');
      }
    }

    const wearers = rc.initialWearers || [];
    const seen = new Set();
    for (const w of wearers) {
      if (!w.address || !utils.isAddress(w.address)) {
        return fail('Invalid Wearer Address', `"${w.name || 'Unnamed'}" has an invalid address.`);
      }
      const key = w.address.toLowerCase();
      if (seen.has(key)) {
        return fail('Duplicate Wearer', `Address ${w.address.slice(0, 6)}…${w.address.slice(-4)} is listed twice.`);
      }
      seen.add(key);
    }

    const projectPerms = rc.projectPerms || [];
    const seenProjects = new Set();
    for (const p of projectPerms) {
      if (!p.projectId) {
        return fail('Missing Project', 'Pick a project for each project-permission row, or remove the row.');
      }
      if (seenProjects.has(p.projectId)) {
        return fail('Duplicate Project Permission', 'Each project can only appear once in the permissions list.');
      }
      seenProjects.add(p.projectId);
    }

    const globalPerms = Number(rc.globalPerms) || 0;
    if (globalPerms < 0 || globalPerms > 255) {
      return fail('Invalid Permissions', 'Global task permission mask must be between 0 and 255.');
    }

    return true;
  }, [proposal.roleConfig, toast]);

  const validateSetterProposal = useCallback(() => {
    if (proposal.setterMode === 'template') {
      if (!proposal.setterTemplate) {
        toast({
          title: "No Action Selected",
          description: "Please select an action from the templates.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }

      const template = getTemplateById(proposal.setterTemplate);
      if (!template) {
        toast({
          title: "Invalid Template",
          description: "The selected template is not valid.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }

      // Validate required inputs have values
      for (const input of template.inputs || []) {
        const value = proposal.setterValues?.[input.name];

        // Special validation for voting class weights
        if (input.type === 'votingClassWeights') {
          if (!Array.isArray(value) || value.length === 0) {
            toast({
              title: "No Voting Classes",
              description: "At least one voting class is required.",
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            return false;
          }
          const totalPct = value.reduce((sum, cls) => sum + Number(cls.slicePct), 0);
          if (totalPct !== 100) {
            toast({
              title: "Invalid Weights",
              description: `Voting class weights must sum to 100% (currently ${totalPct}%).`,
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            return false;
          }
          continue;
        }

        if (!input.optional && (value === undefined || value === '' || value === null)) {
          toast({
            title: "Missing Value",
            description: `Please provide a value for "${input.label || input.name}".`,
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          return false;
        }

        // Skip further validation for optional empty inputs
        if (input.optional && (value === undefined || value === '' || value === null)) {
          continue;
        }

        // Validate number ranges
        if (input.type === 'number') {
          const numValue = Number(value);
          if (input.min !== undefined && numValue < input.min) {
            toast({
              title: "Invalid Value",
              description: `${input.label} must be at least ${input.min}.`,
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            return false;
          }
          if (input.max !== undefined && numValue > input.max) {
            toast({
              title: "Invalid Value",
              description: `${input.label} must be at most ${input.max}.`,
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            return false;
          }
        }
      }

      // For templates where all inputs are optional, ensure at least one has a value
      const allOptional = (template.inputs || []).every(input => input.optional);
      if (allOptional && template.inputs?.length > 0) {
        const hasAnyValue = (template.inputs || []).some(input => {
          const val = proposal.setterValues?.[input.name];
          if (typeof val === 'string') return val.trim() !== '';
          return val !== undefined && val !== '' && val !== null;
        });
        if (!hasAnyValue) {
          toast({
            title: "No Changes",
            description: "Please provide at least one value to change.",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          return false;
        }
      }
    } else {
      // Advanced mode validation
      if (!proposal.setterContract) {
        toast({
          title: "No Contract Selected",
          description: "Please select a target contract.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }

      if (!proposal.setterFunction) {
        toast({
          title: "No Function Selected",
          description: "Please select a function to call.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }

      const funcDef = RAW_FUNCTIONS[proposal.setterContract]?.find(
        f => f.name === proposal.setterFunction
      );
      if (!funcDef) {
        toast({
          title: "Invalid Function",
          description: "The selected function is not recognized.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return false;
      }

      // Check all parameters have values
      for (let i = 0; i < funcDef.params.length; i++) {
        const param = funcDef.params[i];
        const value = proposal.setterParams?.[i];
        if (value === undefined || value === '' || value === null) {
          toast({
            title: "Missing Parameter",
            description: `Please provide a value for "${param.label || param.name}".`,
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          return false;
        }
      }
    }

    return true;
  }, [proposal.setterMode, proposal.setterTemplate, proposal.setterContract, proposal.setterFunction, proposal.setterValues, proposal.setterParams, toast]);

  // Human-readable preview lines for the confirm step AND the forward-compatible
  // actionSummaries metadata (task 9). These mirror the exact strings the create
  // flow already computes (setter preview, transfer sentence, election / role
  // summaries). Purely descriptive — never touches on-chain params.
  // NOTE: declared before handleSubmit so its dependency reference is out of the
  // temporal dead zone when the useCallback deps array evaluates.
  const buildActionSummaries = useCallback(() => {
    const summaries = [];
    if (proposal.type === 'transferFunds') {
      const amt = proposal.transferAmount || '?';
      const addr = proposal.transferAddress || '';
      const short = addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
      summaries.push(`If "Yes" wins, send ${amt} ${nativeCurrencySymbol} from the treasury to ${short}.`);
    } else if (proposal.type === 'setter') {
      if (proposal.setterMode === 'template' && proposal.setterTemplate) {
        const tmpl = getTemplateById(proposal.setterTemplate);
        if (tmpl?.preview) {
          try {
            const line = tmpl.preview(proposal.setterValues || {});
            if (line) summaries.push(line);
          } catch { /* preview is best-effort */ }
        }
      } else if (proposal.setterContract && proposal.setterFunction) {
        summaries.push(`Call ${proposal.setterFunction} on ${proposal.setterContract}.`);
      }
    } else if (proposal.type === 'election') {
      const roleLabel = proposal.electionRoleId ? `role ${proposal.electionRoleId}` : 'the selected role';
      const names = (proposal.electionCandidates || []).map(c => c.name).filter(Boolean);
      if (names.length) {
        summaries.push(`Elect one of: ${names.join(', ')} to ${roleLabel}. The winner receives it automatically.`);
      }
    } else if (proposal.type === 'createRole') {
      const rc = proposal.roleConfig || {};
      if (rc.name) {
        const wearerCount = (rc.initialWearers || []).length;
        summaries.push(
          `Create the role "${rc.name}"${wearerCount ? ` and grant it to ${wearerCount} member(s)` : ''}.`
        );
      }
    }
    return summaries;
  }, [proposal, nativeCurrencySymbol]);

  const buildProposalData = useCallback((eligibilityModuleAddress, contractAddresses, freshHoldersOverride = null, hatsProtocolAddress = null, predictedRoleHatId = null, metadataCIDBytes32 = null) => {
    let numOptions;
    let batches = [];
    let optionNames = [];

    if (proposal.type === "transferFunds") {
      const transferCall = {
        target: proposal.transferAddress,
        value: utils.parseEther(proposal.transferAmount).toString(),
        data: "0x",
      };

      batches = [
        [transferCall], // Yes wins: execute transfer
        [],             // No wins: do nothing
      ];
      numOptions = 2;
      optionNames = ["Yes", "No"];
    } else if (proposal.type === "election") {
      // Election proposal - each candidate is an option
      // When they win: revoke hat from current holders who lost, mint to winner
      numOptions = proposal.electionCandidates.length;
      optionNames = proposal.electionCandidates.map(c => c.name);

      const iface = new utils.Interface([
        "function mintHatToAddress(uint256 hatId, address wearer)",
        "function setWearerEligibility(address wearer, uint256 hatId, bool eligible, bool standing)",
        // EligibilityModule v2: surgically zero a single wearer's vouch state
        // for one hat. Combined with the eligibility revoke, this fully blocks
        // an election loser from re-claiming via claimVouchedHat — without
        // affecting any other wearer or the org's vouching config.
        "function clearWearerVouches(address wearer, uint256 hatId)"
      ]);
      // Hats Protocol — used for the 1-incumbent transfer optimization. When
      // exactly one incumbent is being replaced by a candidate who doesn't
      // already hold the role, we use Hats.transferHat to atomically move the
      // slot. transferHat does NOT decrement supply (just moves the balance)
      // so it works for capped-supply hats (e.g. KUBI's Executive at 10/10)
      // AND it bypasses the eligibility module's getWearerStatus check on the
      // FROM side — vouching can't keep an incumbent in their seat. Verified
      // on a Gnosis fork against KUBI's actual contracts.
      const hatsIface = new utils.Interface([
        "function transferHat(uint256 hatId, address from, address to)"
      ]);

      // Only revoke from the specific incumbents the user selected — not all holders
      const selectedIncumbents = proposal.electionSelectedIncumbents || [];
      // All holders is used to check if candidate already holds the hat.
      // Prefer the fresh on-chain snapshot from handleSubmit when available;
      // form state can be stale (subgraph lag) and that produced AlreadyWearingHat
      // reverts in past KUBI elections.
      const allHolders = freshHoldersOverride
        ? freshHoldersOverride.allHolders
        : (proposal.electionCurrentHolders || []);
      // Fallback role: losers get downgraded to this hat instead of being fully removed
      const fallbackRoleId = proposal.electionFallbackRoleId;
      const fallbackHolders = freshHoldersOverride
        ? freshHoldersOverride.fallbackHolders
        : (proposal.electionFallbackHolders || []);

      batches = proposal.electionCandidates.map(candidate => {
        const batch = [];
        const candidateLower = candidate.address.toLowerCase();
        const otherIncumbents = selectedIncumbents.filter(
          i => i.address.toLowerCase() !== candidateLower
        );
        const candidateAlreadyHolds = allHolders.some(
          h => h.address.toLowerCase() === candidateLower
        );

        // 1-incumbent transfer optimization: when exactly one incumbent is
        // being replaced by a candidate who doesn't already hold the role,
        // use Hats.transferHat. Atomic, supply-preserving, and works through
        // vouching gates. For 0 or 2+ incumbents, fall back to the legacy
        // setEligibility(revoke) + mint flow (best-effort for vouching-gated
        // hats — KUBI's Executive transfer requires this 1-incumbent path).
        const useTransferHat =
          Boolean(hatsProtocolAddress) &&
          otherIncumbents.length === 1 &&
          !candidateAlreadyHolds;
        const transferSourceLower = useTransferHat
          ? otherIncumbents[0].address.toLowerCase()
          : null;

        selectedIncumbents.forEach(incumbent => {
          const incumbentLower = incumbent.address.toLowerCase();
          if (incumbentLower === candidateLower) return; // skip self

          // Revoke the elected hat from the incumbent.
          // Even when we're going to transferHat from this incumbent, the
          // explicit revoke is still required: transferHat moves the token
          // but leaves wearerRules untouched, so the loser could call
          // claimVouchedHat or otherwise re-acquire if a slot opens up.
          batch.push({
            target: eligibilityModuleAddress,
            value: "0",
            data: iface.encodeFunctionData("setWearerEligibility", [
              incumbent.address,
              proposal.electionRoleId,
              false,
              false,
            ]),
          });

          // Surgical vouch clear (EligibilityModule v2). Without this, a
          // vouched-in incumbent can still pass getWearerStatus's vouch path
          // and re-claim if supply opens up (combineWithHierarchy=true ORs
          // hierarchy with vouching). Calling clearWearerVouches sets the
          // incumbent's wearerVouchEpoch to a sentinel that won't match the
          // config epoch — their effective vouch count for THIS hat becomes 0.
          // No effect on other wearers; org-wide vouching stays enabled.
          //
          // Wrapped in try/catch at execute-time semantics by the EligibilityModule's
          // ABI: if the deployed impl is pre-v2 (no clearWearerVouches), the
          // call would revert and bubble up via Executor.CallFailed. Frontend
          // assumes v2 has shipped (per the EligibilityModule upgrade PR);
          // gate by version-detect if needed for staged rollout.
          batch.push({
            target: eligibilityModuleAddress,
            value: "0",
            data: iface.encodeFunctionData("clearWearerVouches", [
              incumbent.address,
              proposal.electionRoleId,
            ]),
          });

          // Fallback role handling (independent of transfer optimization).
          if (fallbackRoleId) {
            batch.push({
              target: eligibilityModuleAddress,
              value: "0",
              data: iface.encodeFunctionData("setWearerEligibility", [
                incumbent.address,
                fallbackRoleId,
                true,
                true,
              ]),
            });
            const alreadyHoldsFallback = fallbackHolders.some(
              addr => addr.toLowerCase() === incumbentLower
            );
            if (!alreadyHoldsFallback) {
              batch.push({
                target: eligibilityModuleAddress,
                value: "0",
                data: iface.encodeFunctionData("mintHatToAddress", [
                  fallbackRoleId,
                  incumbent.address,
                ]),
              });
            }
          }
        });

        // Grant the candidate eligibility on the elected hat. Required by
        // both transferHat's isEligible(to) check and mintHatToAddress's
        // EligibilityModule check. Idempotent — safe if already eligible.
        batch.push({
          target: eligibilityModuleAddress,
          value: "0",
          data: iface.encodeFunctionData("setWearerEligibility", [
            candidate.address,
            proposal.electionRoleId,
            true,
            true,
          ]),
        });

        // Final move: transferHat (1-incumbent case) or mint.
        if (useTransferHat) {
          batch.push({
            target: hatsProtocolAddress,
            value: "0",
            data: hatsIface.encodeFunctionData("transferHat", [
              proposal.electionRoleId,
              otherIncumbents[0].address,
              candidate.address,
            ]),
          });
        } else if (!candidateAlreadyHolds) {
          batch.push({
            target: eligibilityModuleAddress,
            value: "0",
            data: iface.encodeFunctionData("mintHatToAddress", [
              proposal.electionRoleId,
              candidate.address,
            ]),
          });
        }

        return batch;
      });

      // First-class "No One" option — appended last so existing batch indices stay aligned.
      // Empty batch = no on-chain effect when this option wins.
      if (proposal.electionIncludeNoOneOption) {
        optionNames.push("No One");
        batches.push([]);
        numOptions = optionNames.length;
      }
    } else if (proposal.type === "createRole") {
      // Create-role proposal — a single winning batch that calls:
      //   1. EligibilityModule.createHatWithEligibility(params)
      //   2. EligibilityModule.configureVouching(predictedHatId, ...)        (optional)
      //   3. HybridVoting.setCreatorHatAllowed(predictedHatId, true)         (optional)
      //   4. TaskManager.setProjectRolePerm(pid, predictedHatId, mask)       (per project)
      //   5. TaskManager.setConfig(ROLE_PERM/CREATOR_HAT/ORGANIZER_HAT, ...) (org-wide)
      //   6. EligibilityModule.updateHatMetadata(predictedHatId, name, cid)  (if description)
      //
      // predictedRoleHatId is pre-computed in handleSubmit via Hats.getNextId.
      // Race condition: a sibling hat created under the same parent between
      // submit and execution shifts the real id; ALL downstream calls (2-6)
      // then point at the wrong hat. The configurator surfaces a warning when
      // another active createRole proposal targets the same parent.
      const rc = proposal.roleConfig || {};
      const wearers = rc.initialWearers || [];
      const projectPerms = rc.projectPerms || [];

      const hatParams = [
        rc.parentHatId,
        rc.name || '',
        Number(rc.maxSupply) || 1,
        Boolean(rc.mutable),
        rc.imageURI || '',
        Boolean(rc.defaultEligible),
        Boolean(rc.defaultStanding),
        wearers.map(w => w.address),
        wearers.map(w => Boolean(w.eligible ?? rc.defaultEligible)),
        wearers.map(w => Boolean(w.standing ?? rc.defaultStanding)),
      ];

      const elIface = new utils.Interface([
        {
          type: 'function',
          name: 'createHatWithEligibility',
          stateMutability: 'nonpayable',
          inputs: [{
            name: 'params',
            type: 'tuple',
            components: [
              { name: 'parentHatId', type: 'uint256' },
              { name: 'details', type: 'string' },
              { name: 'maxSupply', type: 'uint32' },
              { name: '_mutable', type: 'bool' },
              { name: 'imageURI', type: 'string' },
              { name: 'defaultEligible', type: 'bool' },
              { name: 'defaultStanding', type: 'bool' },
              { name: 'mintToAddresses', type: 'address[]' },
              { name: 'wearerEligibleFlags', type: 'bool[]' },
              { name: 'wearerStandingFlags', type: 'bool[]' },
            ],
          }],
          outputs: [{ name: 'newHatId', type: 'uint256' }],
        },
        'function configureVouching(uint256 hatId, uint32 quorum, uint256 membershipHatId, bool combineWithHierarchy)',
        'function updateHatMetadata(uint256 hatId, string name, bytes32 metadataCID)',
      ]);

      const hvIface = new utils.Interface([
        'function setCreatorHatAllowed(uint256 h, bool ok)',
      ]);

      const tmIface = new utils.Interface([
        'function setProjectRolePerm(bytes32 pid, uint256 hatId, uint8 mask)',
        'function setConfig(uint8 key, bytes value)',
      ]);

      const batch = [];

      // 1. Create the hat
      batch.push({
        target: eligibilityModuleAddress,
        value: '0',
        data: elIface.encodeFunctionData('createHatWithEligibility', [hatParams]),
      });

      // 2. Vouching config (downstream calls need the predicted hatId)
      if (rc.vouching?.enabled && predictedRoleHatId) {
        const voucherHatId = rc.vouching.selfVouch ? predictedRoleHatId : rc.vouching.voucherHatId;
        batch.push({
          target: eligibilityModuleAddress,
          value: '0',
          data: elIface.encodeFunctionData('configureVouching', [
            predictedRoleHatId,
            Number(rc.vouching.quorum) || 1,
            voucherHatId,
            Boolean(rc.vouching.combineWithHierarchy),
          ]),
        });
      }

      // 3. Proposal-creator permission on HybridVoting
      if (rc.canVote && predictedRoleHatId) {
        const hybridAddr = contractAddresses?.votingContractAddress
          || contractAddresses?.hybridVotingContractAddress;
        if (hybridAddr) {
          batch.push({
            target: hybridAddr,
            value: '0',
            data: hvIface.encodeFunctionData('setCreatorHatAllowed', [predictedRoleHatId, true]),
          });
        }
      }

      const taskManagerAddr = contractAddresses?.taskManagerContractAddress;

      // 4. Per-project permission overrides
      if (projectPerms.length > 0 && predictedRoleHatId && taskManagerAddr) {
        for (const p of projectPerms) {
          batch.push({
            target: taskManagerAddr,
            value: '0',
            data: tmIface.encodeFunctionData('setProjectRolePerm', [
              p.projectId,
              predictedRoleHatId,
              Number(p.mask) || 0,
            ]),
          });
        }
      }

      // 5. Org-wide task-system grants via TaskManager.setConfig.
      //    Mirrors setterDefinitions.js: ROLE_PERM (global mask), CREATOR_HAT_ALLOWED
      //    (create projects/tasks), ORGANIZER_HAT_ALLOWED (reorganize folder tree).
      if (taskManagerAddr && predictedRoleHatId) {
        const ROLE_PERM_KEY = 2;       // TaskManager ConfigKey.ROLE_PERM
        const CREATOR_HAT_KEY = 1;     // TaskManager ConfigKey.CREATOR_HAT_ALLOWED
        const ORGANIZER_HAT_KEY = 7;   // TaskManager ConfigKey.ORGANIZER_HAT_ALLOWED

        const globalPerms = Number(rc.globalPerms) || 0;
        if (globalPerms > 0) {
          batch.push({
            target: taskManagerAddr,
            value: '0',
            data: tmIface.encodeFunctionData('setConfig', [
              ROLE_PERM_KEY,
              utils.defaultAbiCoder.encode(['uint256', 'uint8'], [predictedRoleHatId, globalPerms]),
            ]),
          });
        }
        if (rc.canCreateTasks) {
          batch.push({
            target: taskManagerAddr,
            value: '0',
            data: tmIface.encodeFunctionData('setConfig', [
              CREATOR_HAT_KEY,
              utils.defaultAbiCoder.encode(['uint256', 'bool'], [predictedRoleHatId, true]),
            ]),
          });
        }
        if (rc.canOrganizeFolders) {
          batch.push({
            target: taskManagerAddr,
            value: '0',
            data: tmIface.encodeFunctionData('setConfig', [
              ORGANIZER_HAT_KEY,
              utils.defaultAbiCoder.encode(['uint256', 'bool'], [predictedRoleHatId, true]),
            ]),
          });
        }
      }

      // 6. Role metadata — set name + description on-chain via Hats metadata.
      //    updateHatMetadata stores the IPFS CID in the hat details (requires a
      //    mutable hat) and emits HatMetadataUpdated, which the subgraph indexes
      //    into hat.name + hat.metadata.description. No contract changes needed.
      //    metadataCIDBytes32 is computed in handleSubmit (IPFS upload).
      if (metadataCIDBytes32 && predictedRoleHatId) {
        batch.push({
          target: eligibilityModuleAddress,
          value: '0',
          data: elIface.encodeFunctionData('updateHatMetadata', [
            predictedRoleHatId,
            rc.name || '',
            metadataCIDBytes32,
          ]),
        });
      }

      batches = [batch, []];   // Yes wins: create + configure. No wins: nothing.
      numOptions = 2;
      optionNames = ['Create role', 'Reject'];
    } else if (proposal.type === "setter") {
      // Setter proposal - call contract setter function(s)
      let setterCalls = [];

      if (proposal.setterMode === 'template' && proposal.setterTemplate) {
        // Template mode
        const template = getTemplateById(proposal.setterTemplate);
        if (template) {
          const contractKey = template.contract;
          const contextKey = CONTRACT_MAP[contractKey]?.contextKey;
          const contractAddress = contractAddresses?.[contextKey];

          if (contractAddress) {
            if (template.buildCalls) {
              // Multi-call template (e.g. token name + symbol in one proposal)
              setterCalls = template.buildCalls(proposal.setterValues, contractAddress);
            } else {
              // Single-call template: use functionName + encode
              const funcDef = RAW_FUNCTIONS[contractKey]?.find(f => f.name === template.functionName);
              if (funcDef) {
                const iface = new utils.Interface([funcDef.signature]);
                const encodedArgs = template.encode(proposal.setterValues);

                setterCalls = [{
                  target: contractAddress,
                  value: "0",
                  data: iface.encodeFunctionData(template.functionName, encodedArgs),
                }];
              }
            }
          }
        }
      } else {
        // Advanced mode: raw function call
        const funcDef = RAW_FUNCTIONS[proposal.setterContract]?.find(
          f => f.name === proposal.setterFunction
        );
        const contextKey = CONTRACT_MAP[proposal.setterContract]?.contextKey;
        const contractAddress = contractAddresses?.[contextKey];

        if (funcDef && contractAddress) {
          const iface = new utils.Interface([funcDef.signature]);

          setterCalls = [{
            target: contractAddress,
            value: "0",
            data: iface.encodeFunctionData(proposal.setterFunction, proposal.setterParams),
          }];
        }
      }

      if (setterCalls.length > 0) {
        batches = [
          setterCalls, // Yes wins: execute setter(s)
          [],          // No wins: do nothing
        ];
      } else {
        batches = [[], []];
      }

      numOptions = 2;
      optionNames = ["Apply Changes", "Reject"];
    } else {
      const filteredOptions = (proposal.options || []).filter(opt => opt.trim() !== '');
      numOptions = filteredOptions.length || 2;
      optionNames = filteredOptions;
      batches = [];
    }

    return { numOptions, batches, optionNames };
  }, [proposal]);

  const validateBasicFields = useCallback(() => {
    // Setter proposals can be submitted without a manually-entered title:
    // we auto-fill from the template's preview() at submission time below.
    // Skip the empty-title gate when a setter template is selected.
    const setterProvidesTitle =
      proposal.type === 'setter'
      && proposal.setterMode === 'template'
      && proposal.setterTemplate;

    if (!setterProvidesTitle && (!proposal.name || proposal.name.trim() === '')) {
      toast({
        title: "Missing Title",
        description: "Please enter a title for your proposal.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    const durationHours = Number(proposal.time);
    if (isNaN(durationHours) || durationHours <= 0) {
      toast({
        title: "Invalid Duration",
        description: "Please enter a valid duration in hours (must be greater than 0).",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    // Restricted voting with an empty allowlist would submit hatIds: [] and
    // silently fall back to "everyone can vote" — the opposite of the user's
    // intent. Block it here (backstop for the inline validation in the modal).
    if (proposal.isRestricted && (proposal.restrictedHatIds?.length ?? 0) === 0) {
      toast({
        title: "No Roles Selected",
        description: "You restricted who can vote but didn't pick any roles. Select at least one, or turn restriction off.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }

    return true;
  }, [
    proposal.name,
    proposal.time,
    proposal.type,
    proposal.setterMode,
    proposal.setterTemplate,
    proposal.isRestricted,
    proposal.restrictedHatIds,
    toast,
  ]);

  const handleSubmit = useCallback(async (eligibilityModuleAddress, contractAddresses = {}) => {
    setLoadingSubmit(true);

    try {
      // Basic field validation
      if (!validateBasicFields()) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "transferFunds" && !validateTransferProposal()) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "election" && !validateElectionProposal()) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "setter" && !validateSetterProposal()) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "createRole" && !validateCreateRoleProposal()) {
        setLoadingSubmit(false);
        return;
      }

      if (proposal.type === "normal" && !validateNormalProposal()) {
        setLoadingSubmit(false);
        return;
      }

      // For elections, re-read hat wearership on-chain right before building
      // batches. Stale form state previously caused AlreadyWearingHat reverts
      // (mint calls were emitted for wearers who already held the hat).
      //
      // We construct a JsonRpcProvider scoped to the ORG chain rather than
      // using the wallet's provider — for cross-chain users (passkey, or an
      // EOA whose wallet is on a different chain) the wallet provider would
      // read the wrong chain's state. Mirrors the read pattern in
      // pages/create/index.js:355.
      let freshHoldersOverride = null;
      if (proposal.type === "election") {
        const hatsAddr = getInfrastructureAddress(CONTRACT_NAMES.HATS_PROTOCOL, orgChainId);
        if (hatsAddr && orgNetwork?.rpcUrl && orgChainId) {
          try {
            const readProvider = new ethersProviders.JsonRpcProvider(
              orgNetwork.rpcUrl,
              { chainId: orgChainId, name: orgNetwork.name || `chain-${orgChainId}` }
            );
            const hats = createHatsService(readProvider);
            const candidateAddrs = proposal.electionCandidates.map(c => c.address);
            const incumbentAddrs = (proposal.electionSelectedIncumbents || []).map(i => i.address);

            const candidateMap = await hats.getHolderStatuses(
              hatsAddr,
              proposal.electionRoleId,
              candidateAddrs,
            );
            const fallbackMap = proposal.electionFallbackRoleId
              ? await hats.getHolderStatuses(
                  hatsAddr,
                  proposal.electionFallbackRoleId,
                  incumbentAddrs,
                )
              : new Map();

            freshHoldersOverride = {
              allHolders: candidateAddrs
                .filter(a => candidateMap.get(a.toLowerCase()) === true)
                .map(a => ({ address: a, name: '' })),
              fallbackHolders: incumbentAddrs.filter(
                a => fallbackMap.get(a.toLowerCase()) === true,
              ),
            };
          } catch (err) {
            console.error('[useProposalForm] Hats holder refresh failed:', err);
            toast({
              title: "Cannot verify current role holders",
              description: "Could not read the Hats contract. Please try again.",
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            setLoadingSubmit(false);
            return;
          }
        } else {
          // No Hats address / RPC configured for this chain — defensive fall-through
          // to cached form state. Not expected on Gnosis/Arbitrum/Sepolia.
          console.warn('[useProposalForm] No HATS_PROTOCOL or RPC for chain', orgChainId);
        }
      }

      const hatsProtocolAddress = getInfrastructureAddress(CONTRACT_NAMES.HATS_PROTOCOL, orgChainId) || null;

      // Pre-compute the new role's hat ID via Hats.getNextId(parent). This
      // lets the same batch chain configureVouching / setCreatorHatAllowed /
      // setProjectRolePerm against the new role. The id is deterministic
      // (parent || childIndex bit-packing), so as long as no sibling hat is
      // created under the same parent between submit and execution, the
      // prediction is accurate. The configurator warns when a concurrent
      // createRole proposal targets the same parent.
      let predictedRoleHatId = null;
      if (proposal.type === 'createRole') {
        const parentHatId = proposal.roleConfig?.parentHatId;
        if (hatsProtocolAddress && orgNetwork?.rpcUrl && orgChainId && parentHatId) {
          try {
            const readProvider = new ethersProviders.JsonRpcProvider(
              orgNetwork.rpcUrl,
              { chainId: orgChainId, name: orgNetwork.name || `chain-${orgChainId}` }
            );
            const hats = createHatsService(readProvider);
            const nextId = await hats.getNextId(hatsProtocolAddress, parentHatId);
            predictedRoleHatId = nextId.toString();
          } catch (err) {
            console.error('[useProposalForm] Hats.getNextId failed:', err);
            toast({
              title: "Cannot predict new role's hat ID",
              description: "Could not read Hats Protocol to pre-compute the new role's ID. Please try again.",
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            setLoadingSubmit(false);
            return;
          }
        } else {
          toast({
            title: "Missing infrastructure config",
            description: "Hats Protocol address or RPC is not configured for this chain.",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          setLoadingSubmit(false);
          return;
        }
      }

      // Create-role only: persist the role's name + description on-chain via the
      // Hats metadata pattern. Upload { name, description } to IPFS, encode the CID
      // to bytes32, and let buildProposalData append an updateHatMetadata call (the
      // subgraph indexes it into hat.name + hat.metadata.description).
      // Gated on description only: the hat image is already stored via
      // createHatWithEligibility's imageURI, and the subgraph metadata parser reads
      // name + description only — so an image would add on-chain cost for no effect.
      // updateHatMetadata calls changeHatDetails, which requires a mutable hat — so
      // only attempt it when the role is mutable.
      let metadataCIDBytes32 = null;
      if (proposal.type === 'createRole') {
        const rc = proposal.roleConfig || {};
        if (rc.description?.trim() && rc.mutable) {
          try {
            const result = await addToIpfs(JSON.stringify({
              name: rc.name || '',
              description: rc.description || '',
            }));
            if (result?.path) {
              metadataCIDBytes32 = ipfsCidToBytes32(result.path);
            }
          } catch (err) {
            console.error('[useProposalForm] role metadata IPFS upload failed:', err);
            toast({
              title: 'Could not save role description',
              description: 'Failed to upload role metadata to IPFS. Please try again.',
              status: 'error',
              duration: 5000,
              isClosable: true,
            });
            setLoadingSubmit(false);
            return;
          }
        }
      }

      const { numOptions, batches, optionNames } = buildProposalData(
        eligibilityModuleAddress,
        contractAddresses,
        freshHoldersOverride,
        hatsProtocolAddress,
        predictedRoleHatId,
        metadataCIDBytes32,
      );

      // Form collects hours; contract ABI expects minutes (uint32 minutesDuration).
      // Math.round avoids FP slop (e.g., 0.5 * 60 = 30, not 29.999...).
      const durationHours = Number(proposal.time);
      const durationMinutes = Math.max(1, Math.round(durationHours * 60));

      // Auto-fill title/description from setter template preview when the
      // user left them blank. User-entered text always wins. This is what
      // voters see in the proposal list and modal — without it, a "Change
      // token name to FOO" setter proposal would render with a blank title
      // and meaningless description.
      let finalName = (proposal.name || '').trim();
      let finalDescription = (proposal.description || '').trim();
      if (
        proposal.type === 'setter'
        && proposal.setterMode === 'template'
        && proposal.setterTemplate
      ) {
        const tmpl = getTemplateById(proposal.setterTemplate);
        if (tmpl?.preview) {
          let previewText = '';
          try {
            previewText = tmpl.preview(proposal.setterValues || {});
          } catch (e) {
            console.warn('[useProposalForm] template.preview() threw:', e);
          }
          if (previewText) {
            if (!finalName) finalName = previewText;
            if (!finalDescription) finalDescription = `If this vote passes: ${previewText}`;
          }
        }
      }

      // Forward-compatible: human-readable action previews for the uploaded
      // metadata JSON. Additive only — does NOT alter numOptions/batches/
      // optionNames or any on-chain param. Safe for VotingService to thread
      // into _uploadProposalMetadata; ignored by callers that don't forward it.
      const actionSummaries = buildActionSummaries();

      await onSubmit({
        name: finalName,
        description: finalDescription,
        time: durationMinutes,
        numOptions,
        batches,
        optionNames,
        actionSummaries,
        type: proposal.type,
        transferAddress: proposal.transferAddress,
        transferAmount: proposal.transferAmount,
        electionRoleId: proposal.electionRoleId,
        electionCandidates: proposal.electionCandidates,
        electionIncludeNoOneOption: proposal.electionIncludeNoOneOption,
        // Setter proposal fields
        setterContract: proposal.setterContract,
        setterTemplate: proposal.setterTemplate,
        // Create-role proposal fields
        roleConfig: proposal.roleConfig,
        predictedRoleHatId,
        // Voting restrictions
        hatIds: proposal.isRestricted ? proposal.restrictedHatIds : [],
      });

      setLoadingSubmit(false);
      resetForm();

      let successDescription;
      if (proposal.type === "transferFunds") {
        successDescription = `Transfer proposal created. If "Yes" wins, ${proposal.transferAmount} ${nativeCurrencySymbol} will be sent to ${proposal.transferAddress.slice(0, 6)}...${proposal.transferAddress.slice(-4)}`;
      } else if (proposal.type === "election") {
        successDescription = `Election created with ${proposal.electionCandidates.length} candidates. The winner will receive the role automatically.`;
      } else if (proposal.type === "setter") {
        const template = getTemplateById(proposal.setterTemplate);
        const actionName = template?.name || proposal.setterFunction || 'settings change';
        successDescription = `Settings change proposal created. If approved, "${actionName}" will be executed automatically.`;
      } else if (proposal.type === "createRole") {
        const wearerCount = (proposal.roleConfig?.initialWearers || []).length;
        successDescription = `Create-role proposal submitted for "${proposal.roleConfig?.name || 'new role'}". If approved, the role will be created${wearerCount ? ` and minted to ${wearerCount} member(s)` : ''}.`;
      } else {
        successDescription = "Your proposal has been created successfully.";
      }

      toast({
        title: "Proposal Created",
        description: successDescription,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      return true;
    } catch (error) {
      console.error("Error creating poll:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create proposal.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      setLoadingSubmit(false);
      return false;
    }
  }, [proposal, validateBasicFields, validateTransferProposal, validateElectionProposal, validateNormalProposal, validateSetterProposal, validateCreateRoleProposal, buildProposalData, buildActionSummaries, onSubmit, resetForm, toast, orgChainId, orgNetwork, nativeCurrencySymbol, addToIpfs]);

  // ---------------------------------------------------------------------------
  // Inline field-level validation (non-blocking; the submit-time toast
  // validators above stay as the authoritative backstop). This drives the
  // FormControl isInvalid / FormErrorMessage UI and the disabled-with-reason
  // Create button. Keys are stable field names the modal maps to controls.
  // ---------------------------------------------------------------------------
  const fieldErrors = useMemo(() => {
    const errors = {};

    // Title — required except when a setter template auto-fills it.
    const setterProvidesTitle =
      proposal.type === 'setter'
      && proposal.setterMode === 'template'
      && proposal.setterTemplate;
    if (!setterProvidesTitle && (!proposal.name || proposal.name.trim() === '')) {
      errors.name = 'Give your vote a title.';
    }

    // Duration — must be at least 1 hour.
    const durationHours = Number(proposal.time);
    if (isNaN(durationHours) || durationHours < 1) {
      errors.time = 'Voting must run for at least 1 hour.';
    }

    // Normal — at least 2 non-empty options.
    if (proposal.type === 'normal') {
      const nonEmpty = (proposal.options || []).filter(o => o.trim() !== '');
      if (nonEmpty.length < 2) {
        errors.options = 'Add at least 2 options.';
      }
    }

    // Transfer funds — valid recipient + positive amount.
    if (proposal.type === 'transferFunds') {
      if (!proposal.transferAddress || !utils.isAddress(proposal.transferAddress)) {
        errors.transferAddress = 'Enter a valid recipient address (0x…).';
      }
      const amt = parseFloat(proposal.transferAmount);
      if (isNaN(amt) || amt <= 0) {
        errors.transferAmount = 'Enter an amount greater than 0.';
      }
    }

    // Restricted voting with an empty allowlist.
    if (proposal.isRestricted && (proposal.restrictedHatIds?.length ?? 0) === 0) {
      errors.restrictedHatIds = 'Pick at least one role, or turn restriction off.';
    }

    return errors;
  }, [
    proposal.type,
    proposal.name,
    proposal.time,
    proposal.options,
    proposal.transferAddress,
    proposal.transferAmount,
    proposal.isRestricted,
    proposal.restrictedHatIds,
    proposal.setterMode,
    proposal.setterTemplate,
  ]);

  const isValid = Object.keys(fieldErrors).length === 0;

  return {
    proposal,
    loadingSubmit,
    fieldErrors,
    isValid,
    setProposalType,
    buildActionSummaries,
    restoreProposal,
    handleInputChange,
    handleOptionChange,
    addOption,
    removeOption,
    handleProposalTypeChange,
    handleTransferAddressChange,
    handleTransferAmountChange,
    handleElectionRoleChange,
    handleCandidatesChange,
    addCandidate,
    removeCandidate,
    handleRestrictedToggle,
    handleRestrictedRolesChange,
    toggleRestrictedRole,
    handleSetterChange,
    handleSubmit,
    resetForm,
  };
}

export default useProposalForm;
