/**
 * usePollNavigation
 * Hook for managing poll selection, URL handling, and modal state
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useDisclosure } from '@chakra-ui/react';
import { useOrgName } from '@/hooks/useOrgName';

export function usePollNavigation({
  democracyVotingOngoing = [],
  democracyVotingCompleted = [],
  hybridVotingOngoing = [],
  hybridVotingCompleted = [],
  PTVoteType = 'Hybrid',
}) {
  const router = useRouter();
  const userDAO = useOrgName();

  // Keep the resolved org available in callbacks without adding it to deps.
  const userDAORef = useRef(userDAO);
  userDAORef.current = userDAO;

  // Ref-stabilize router so callbacks don't re-create on every route change
  const routerRef = useRef(router);
  routerRef.current = router;

  const [selectedPoll, setSelectedPoll] = useState(null);
  const [selectedOption, setSelectedOption] = useState("");
  const [isPollCompleted, setIsPollCompleted] = useState(false);

  // Poll id the user explicitly closed while its ?poll= param is still in the
  // URL. The URL effect below re-runs on every proposal-array refetch (poll
  // freshness polling / optimistic merges), which would otherwise re-open a
  // modal the user just dismissed. We suppress re-opening THIS id until the
  // `poll` query param changes to a DIFFERENT value. (audit data-findings #9)
  const userClosedPollRef = useRef(null);
  // Tab 0 = Hybrid/Participation Voting (Official governance)
  // Tab 1 = Direct Democracy (Informal polls)
  const [selectedTab, setSelectedTab] = useState(0);
  const [votingTypeSelected, setVotingTypeSelected] = useState(PTVoteType);

  // Wave-2: ONE detail surface (PollDetail) replaces the old ongoing/completed
  // modal split. A single disclosure drives it for both lifecycle states.
  const {
    isOpen: isDetailOpen,
    onOpen: onDetailOpen,
    onClose: onDetailCloseBase,
  } = useDisclosure();

  // Wrap the close handler to (1) remember which poll was closed so the
  // URL-based effect doesn't immediately re-open it while ?poll= lingers, and
  // (2) strip ?poll from the URL via router.replace while KEEPING userDAO
  // (replaces the old modals' org= push).
  const rememberClosed = useCallback(() => {
    const current = routerRef.current?.query?.poll;
    if (current) userClosedPollRef.current = current;
  }, []);

  const onDetailClose = useCallback(() => {
    rememberClosed();
    onDetailCloseBase();
    const r = routerRef.current;
    if (r?.query?.poll) {
      const dao = userDAORef.current;
      const query = dao ? { userDAO: dao } : {};
      r.replace({ pathname: r.pathname, query }, undefined, { shallow: true });
    }
  }, [rememberClosed, onDetailCloseBase]);

  // Handle tab changes
  // Tab 0 = Hybrid/Participation Voting, Tab 1 = Direct Democracy
  const handleTabChange = useCallback((index) => {
    setSelectedTab(index);
    const voteType = index === 0 ? PTVoteType : "Direct Democracy";
    setVotingTypeSelected(voteType);
  }, [PTVoteType]);

  // Handle poll click — uses routerRef to avoid re-creating on every route change
  const handlePollClick = useCallback((poll, isCompleted = false) => {
    // Explicit user intent to open — clear any prior "closed" suppression.
    userClosedPollRef.current = null;
    setSelectedPoll(poll);
    setIsPollCompleted(isCompleted);
    // Resolve the poll's voting type so the detail routes to the right contract.
    setVotingTypeSelected(poll?.type === 'Direct Democracy' ? 'Direct Democracy' : PTVoteType);
    // Write the canonical `userDAO` query param (useOrgName reads both
    // `userDAO` and legacy `org`, but we standardize on `userDAO` here).
    // Push onto the CURRENT route — hardcoding /voting here would unmount the
    // /votes archive (losing filters/scroll) just to open a modal it already has.
    const r = routerRef.current;
    r.push(
      { pathname: r.pathname, query: { poll: poll.id, userDAO: userDAORef.current } },
      undefined,
      { shallow: true }
    );
    onDetailOpen();
  }, [onDetailOpen, PTVoteType]);

  // Find poll by ID or title in proposals array
  const findPollInProposals = useCallback((proposals, pollId) => {
    if (!Array.isArray(proposals) || proposals.length === 0) return null;
    return proposals.find((p) => p.id === pollId || p.title === pollId);
  }, []);

  // Handle URL-based poll selection
  useEffect(() => {
    if (!router.query.poll) return;

    const pollId = router.query.poll;

    // The param changed to a different poll — clear the closed-suppression so
    // the new (or re-selected) poll can open.
    if (userClosedPollRef.current && userClosedPollRef.current !== pollId) {
      userClosedPollRef.current = null;
    }

    // User closed this exact poll while its ?poll= param still lingers — don't
    // re-open it on subsequent proposal-array refetches.
    if (userClosedPollRef.current === pollId) return;

    let pollFound = null;
    let pollType = "";
    let isCompleted = false;

    // Check ongoing proposals
    pollFound = findPollInProposals(democracyVotingOngoing, pollId);
    if (pollFound) pollType = "Direct Democracy";

    if (!pollFound) {
      pollFound = findPollInProposals(hybridVotingOngoing, pollId);
      if (pollFound) pollType = "Hybrid";
    }

    // Check completed proposals
    if (!pollFound) {
      pollFound = findPollInProposals(democracyVotingCompleted, pollId);
      if (pollFound) {
        pollType = "Direct Democracy";
        isCompleted = true;
      }
    }

    if (!pollFound) {
      pollFound = findPollInProposals(hybridVotingCompleted, pollId);
      if (pollFound) {
        pollType = "Hybrid";
        isCompleted = true;
      }
    }

    if (pollFound) {
      setSelectedPoll(pollFound);
      setVotingTypeSelected(pollType);
      // Tab 0 = Hybrid/Participation, Tab 1 = Direct Democracy
      setSelectedTab(pollType === "Direct Democracy" ? 1 : 0);
      setIsPollCompleted(isCompleted);
      // ONE detail surface for both ongoing and completed polls.
      onDetailOpen();
    }
  }, [
    router.query.poll,
    democracyVotingOngoing,
    democracyVotingCompleted,
    hybridVotingOngoing,
    hybridVotingCompleted,
    findPollInProposals,
    onDetailOpen,
  ]);

  // Get the correct contract address based on voting type
  const getContractAddressForVotingType = useCallback((ddAddress, hybridAddress) => {
    return votingTypeSelected === "Direct Democracy" ? ddAddress : hybridAddress;
  }, [votingTypeSelected]);

  return {
    selectedPoll,
    setSelectedPoll,
    selectedOption,
    setSelectedOption,
    isPollCompleted,
    selectedTab,
    votingTypeSelected,
    handleTabChange,
    handlePollClick,
    getContractAddressForVotingType,
    // Unified PollDetail surface (Wave 2)
    isDetailOpen,
    onDetailOpen,
    onDetailClose,
  };
}

export default usePollNavigation;
