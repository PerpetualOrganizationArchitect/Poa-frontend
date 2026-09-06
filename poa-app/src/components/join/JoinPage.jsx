import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import useOnboardingColors from '@/components/shared/useOnboardingColors';
import SEOHead from "@/components/common/SEOHead";
import { JoinLayout, JoinAccountStart, JoinInvitationStart, JoinRoleDisclosure, JoinSignIn, JoinWalletOption } from "@/components/join/JoinPresentation";
import { useWeb3, useOrgStructure, useClaimRole, useVouches, useVouchFirstOnboarding } from "@/hooks";
import { useOrgName } from "@/hooks/useOrgName";
import useIpfsImage from '@/hooks/useIpfsImage';
import { usePOContext } from "@/context/POContext";
import { useUserContext } from "@/context/UserContext";
import { useUserActive } from "@/hooks/useUserActive";
import { findUsernameAcrossChains } from "@/util/crossChainUsername";
import { useRouter } from 'next/router';
import {
  VStack,
  Text,
  Button,
  Input,
  Box,
  Flex,
  Heading,
  Icon,
  useBreakpointValue,
  InputGroup,
  InputRightElement,
  Divider,
  HStack,
  useToast,
  IconButton,
  Alert,
  AlertIcon,
  useDisclosure,
} from "@chakra-ui/react";
import PulseLoader from "@/components/shared/PulseLoader";
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { useAccount } from 'wagmi';
import { useAuth } from '@/context/AuthContext';

import { FaUserPlus, FaUser, FaCheck, FaChevronRight, FaFingerprint, FaPaperPlane, FaCopy, FaHandshake, FaRedo } from 'react-icons/fa';
import PasskeyOnboardingModal from '@/components/passkey/PasskeyOnboardingModal';
import SignInModal from '@/components/passkey/SignInModal';
import { RoleApplicationForm, VouchLinkHandler, VouchProgressBar } from '@/components/orgStructure';
import EmailInviteCard from '@/components/zkEmail/EmailInviteCard';
import { useZkEmailInviteSummary } from '@/hooks/useZkEmailInviteSummary';
import { orgUrl } from '@/util/orgUrl';
import ConnectedAccountBadge from '@/components/common/ConnectedAccountBadge';
import AccountControl from '@/components/common/AccountControl';
import { VouchFirstPhase } from '@/hooks/useVouchFirstOnboarding';
import { getAllCredentials } from '@/services/web3/passkey/passkeyStorage';
import { useOrgGate } from "@/components/shared/OrgDeadEnd";

const User = () => {
  const { hasMemberRole, graphUsername, optimisticJoin } = useUserContext();
  const { address } = useAccount();
  const { isAuthenticated, isPasskeyUser, accountAddress } = useAuth();
  const { quickJoinContractAddress, roleHatIds, logoUrl } = usePOContext();
  const orgLogoSrc = useIpfsImage(logoUrl);
  const { organization, executeWithNotification, signer } = useWeb3();
  const router = useRouter();
  const { vouch: vouchAddress, hatId: vouchHatId } = router.query;
  const userDAO = useOrgName();
  // Invite-link wording: people reach /join from a shared link, so name the
  // thing that's actually broken rather than talking about "organizations".
  const orgGate = useOrgGate({
    notFoundTitle: (name) => `That invite points to an organization we can’t find`,
    notFoundBody:
      'Names are case-sensitive, and a brand-new org can take a minute to appear. Ask whoever shared the link to check it, or browse the organizations that are live now.',
  });
  const usernameInputRef = useRef(null);
  const toast = useToast();

  // Org structure for vouch detection
  const { roles, eligibilityModuleAddress, orgName: structureOrgName, loading: structureLoading, error: orgStructureError } = useOrgStructure();
  const orgStructureLoading = structureLoading || (!structureOrgName && !orgStructureError);
  const { applyForRole, isApplying, vouchFor, isVouching } = useClaimRole(eligibilityModuleAddress);

  // Vouch data (for vouch link handler and vouch-first progress)
  const rolesWithVouching = useMemo(() => {
    return (roles || []).filter(r => r.vouchingEnabled);
  }, [roles]);
  const { hasUserVouched, getVouchProgress, refetch: refetchVouches } = useVouches(eligibilityModuleAddress, rolesWithVouching);

  const hasVouchGatedRoles = useMemo(() => {
    if (!roles || roles.length === 0) return false;
    return roles.some(r => r.vouchingEnabled);
  }, [roles]);

  // Roles claimable via QuickJoin.quickJoinWithUser() — no vouching required.
  // Source: QuickJoin.memberHatIds() read in useOrgStructure.
  const quickJoinEligibleRoles = useMemo(() => {
    return (roles || []).filter(r => r.isQuickJoinEligible);
  }, [roles]);
  const hasQuickJoinRoles = quickJoinEligibleRoles.length > 0;
  // Hats the quick-join tx will mint, in BigInt form. Used to seed paymasterHatIds
  // on first-time joins so the org's gas budget for these hats sponsors the UserOp
  // — without this the smart account has no funds and the tx fails with AA21.
  const quickJoinPaymasterHatIds = useMemo(() => {
    return quickJoinEligibleRoles
      .map(r => { try { return BigInt(r.hatId); } catch { return null; } })
      .filter(Boolean);
  }, [quickJoinEligibleRoles]);
  // Email-invite fast path: which roles are instantly claimable via the org's ACTIVE allowlist.
  // Threaded into every RoleApplicationForm so picking a claimable role surfaces the shortcut inline.
  const inviteSummary = useZkEmailInviteSummary();
  const emailClaimProp = useMemo(() => ({
    infoFor: inviteSummary.claimableInfoFor,
    onClaim: () => router.push(orgUrl(userDAO, 'claim')),
  }), [inviteSummary.claimableInfoFor, router, userDAO]);
  // Org has both a quick-join path AND a vouch-gated path (e.g. Decentral Park:
  // Neighbor via quickJoin + Delegate via apply/vouch). Surface both in the UI.
  const hasBothPaths = hasQuickJoinRoles && hasVouchGatedRoles;
  const requiresInvitation = !hasQuickJoinRoles && !hasVouchGatedRoles;
  const canClaimWithEmail = inviteSummary.status === 'active' || inviteSummary.status === 'degraded';
  // Collapsible "Apply for an advanced role instead" disclosure on mixed orgs.
  const [showApplyPath, setShowApplyPath] = useState(false);
  const quickJoinPrimaryRoleName = quickJoinEligibleRoles.length === 1
    ? quickJoinEligibleRoles[0].name
    : 'a member';

  // Cross-chain username: check if user already has a username on any chain
  const [crossChainUsername, setCrossChainUsername] = useState(null);
  useEffect(() => {
    const addr = accountAddress || address;
    if (!addr) return;
    findUsernameAcrossChains(addr).then(({ username }) => {
      if (username) setCrossChainUsername(username);
    }).catch((err) => {
      console.warn('[UserPage] Cross-chain username lookup failed:', err);
    });
  }, [accountAddress, address]);

  const [newUsername, setNewUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const dispaly = true;
  const [isSSR, setIsSSR] = useState(true);

  // Modal state for create account / sign in
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();
  const { isOpen: isSignInOpen, onOpen: onSignInOpen, onClose: onSignInClose } = useDisclosure();

  // Role application state (for vouch-gated orgs)
  const [selectedHatId, setSelectedHatId] = useState(null);
  const [applicationNotes, setApplicationNotes] = useState('');

  // Tracks when authenticated user has submitted application and is waiting for vouches.
  // Persisted to sessionStorage so a page refresh doesn't lose the vouch link.
  const [pendingVouchApplication, setPendingVouchApplication] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(`pendingVouchApp:${userDAO}`);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  // Vouch-first passkey onboarding hook
  const vouchFirstHook = useVouchFirstOnboarding({
    orgName: userDAO,
    refetchVouches,
    eligibilityModuleAddress,
    existingUsername: crossChainUsername,
  });

  // Compute vouch progress for the pending credential (if any)
  const vouchFirstPendingProgress = useMemo(() => {
    if (!vouchFirstHook.pendingCredential) return null;
    return getVouchProgress(
      vouchFirstHook.pendingCredential.accountAddress,
      vouchFirstHook.pendingCredential.selectedHatId,
    );
  }, [vouchFirstHook.pendingCredential, getVouchProgress]);

  // Vouch link progress (for existing members viewing a vouch link)
  const vouchLinkProgress = useMemo(() => {
    if (!vouchAddress || !vouchHatId) return null;
    return getVouchProgress(vouchAddress, vouchHatId);
  }, [vouchAddress, vouchHatId, getVouchProgress]);

  const hasAlreadyVouched = useMemo(() => {
    if (!vouchAddress || !vouchHatId) return false;
    return hasUserVouched(vouchAddress, vouchHatId);
  }, [vouchAddress, vouchHatId, hasUserVouched]);

  // Check if the authenticated user has completed vouches for any role
  const authenticatedUserVouchProgress = useMemo(() => {
    if (!isAuthenticated || !accountAddress || !hasVouchGatedRoles || hasMemberRole) return null;
    for (const role of rolesWithVouching) {
      const progress = getVouchProgress(accountAddress, role.hatId);
      if (progress && progress.isComplete && progress.quorum > 0) {
        return { ...progress, hatId: role.hatId, roleName: role.name };
      }
    }
    return null;
  }, [isAuthenticated, accountAddress, hasVouchGatedRoles, hasMemberRole, rolesWithVouching, getVouchProgress]);

  // Track vouch progress for a pending application (applied but not yet vouched enough)
  const pendingApplicationProgress = useMemo(() => {
    if (!pendingVouchApplication || !accountAddress) return null;
    return getVouchProgress(accountAddress, pendingVouchApplication.hatId);
  }, [pendingVouchApplication, accountAddress, getVouchProgress]);

  const isMobile = useBreakpointValue({ base: true, md: false });
  const buttonHeight = '52px';
  const colors = useOnboardingColors();
  const primaryButtonBg = colors.primary;
  const primaryButtonColor = colors.primaryText;
  const formSpacing = 5;
  const textColor = colors.ink;
  const accentColor = colors.accent;
  const inputBg = colors.surface;
  const inputBorderColor = colors.line;
  const subtextColor = colors.muted;
  const hintColor = colors.muted;
  const footerColor = colors.muted;
  const infoBg = colors.soft;
  const infoBorderColor = colors.line;

  useEffect(() => {
    setIsSSR(false);
  }, [userDAO]);

  useEffect(() => {
    // Don't redirect members when they're here to vouch for someone.
    // TODO: existing members who want to upgrade to a vouch-gated role (e.g. a Neighbor
    // applying for Delegate) get redirected away from /join — there's no upgrade path
    // in the current UI. Tracked separately from the mixed-org bug fix.
    if (hasMemberRole && !vouchAddress) {
      router.push(`/profile/?org=${encodeURIComponent(userDAO)}`);
    }
  }, [hasMemberRole, address, vouchAddress]);

  // Redirect on vouch-first success — optimistically update UserContext and redirect
  // immediately. The subgraph data will replace the optimistic data on the next refetch.
  useEffect(() => {
    if (vouchFirstHook.phase !== VouchFirstPhase.SUCCESS) return;

    const addr = accountAddress || address;
    const hatId = vouchFirstHook.vouchedHatId;
    // Username: prefer cross-chain existing username, fall back to stored pending credential username, then input field, then subgraph
    const username = crossChainUsername || vouchFirstHook.pendingCredential?.username || newUsername?.trim() || graphUsername || '';

    // Optimistically mark the user as a member so profileHub renders correctly
    optimisticJoin({
      address: addr,
      hatIds: hatId ? [hatId] : [],
      username,
    });

    router.push(`/profile/?org=${encodeURIComponent(userDAO)}`);
  }, [vouchFirstHook.phase]);

  // Sync pendingVouchApplication to sessionStorage
  useEffect(() => {
    if (!userDAO) return;
    try {
      if (pendingVouchApplication) {
        sessionStorage.setItem(`pendingVouchApp:${userDAO}`, JSON.stringify(pendingVouchApplication));
      } else {
        sessionStorage.removeItem(`pendingVouchApp:${userDAO}`);
      }
    } catch { /* SSR or storage full */ }
  }, [pendingVouchApplication, userDAO]);

  const isActive = useUserActive();
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // Refetch vouches immediately when user returns from inactive state
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActiveRef.current && pendingVouchApplication && refetchVouches) {
      refetchVouches();
    }
    wasActiveRef.current = isActive;
  }, [isActive, pendingVouchApplication, refetchVouches]);

  // Poll for vouches while authenticated user has a pending application (pause during join).
  // Skips refetch when the tab is hidden or user is idle to reduce subgraph load.
  useEffect(() => {
    if (pendingVouchApplication && refetchVouches && !loading) {
      const interval = setInterval(() => {
        if (isActiveRef.current) refetchVouches();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [pendingVouchApplication, refetchVouches, loading]);

  // Auto-select when there's only one role
  useEffect(() => {
    if (hasVouchGatedRoles && rolesWithVouching.length === 1) {
      setSelectedHatId(rolesWithVouching[0].hatId);
    }
  }, [hasVouchGatedRoles, rolesWithVouching]);

  // Auto-select the hat that has completed vouches (for sign-in + complete flow)
  useEffect(() => {
    if (authenticatedUserVouchProgress?.hatId && !selectedHatId) {
      setSelectedHatId(authenticatedUserVouchProgress.hatId);
    }
  }, [authenticatedUserVouchProgress, selectedHatId]);

  const handleJoinWithUser = useCallback(async () => {
    if (!organization) return;

    setLoading(true);

    // Determine the hat to claim from vouch progress
    const vouchedHatId = authenticatedUserVouchProgress?.hatId
      || (pendingApplicationProgress?.isComplete ? pendingVouchApplication?.hatId : null)
      || null;

    let joinFn;
    if (vouchedHatId) {
      // Vouched flow: claim specific hat(s) via claimHatsWithUser
      const claimHatIds = [BigInt(vouchedHatId)];
      console.log('[Join] Vouched flow: claiming hat', vouchedHatId);
      joinFn = () => organization.claimHatsWithUser(quickJoinContractAddress, claimHatIds, {
        paymasterHatIds: claimHatIds,
      });
    } else {
      // Standard flow: quickJoinWithUser (mints memberHatIds).
      // paymasterHatIds = the memberHatIds we're about to claim — required because
      // the user has no hats on this org yet so useWeb3Services passes hatIds=[],
      // which would skip the paymaster entirely. See SmartAccountTransactionManager.
      joinFn = () => organization.quickJoinWithUser(quickJoinContractAddress, {
        paymasterHatIds: quickJoinPaymasterHatIds,
      });
    }

    const result = await executeWithNotification(
      joinFn,
      {
        pendingMessage: 'Joining organization...',
        successMessage: 'Successfully joined! Taking you to your profile…',
        refreshEvent: 'member:joined',
      }
    );

    if (result.success) {
      setPendingVouchApplication(null);
      const addr = accountAddress || address;
      optimisticJoin({
        address: addr,
        hatIds: vouchedHatId ? [vouchedHatId] : (roleHatIds?.[0] ? [roleHatIds[0]] : []),
        username: crossChainUsername || graphUsername || '',
      });
      router.push(`/profile/?org=${encodeURIComponent(userDAO)}`);
    }
    setLoading(false);
  }, [organization, executeWithNotification, quickJoinContractAddress, router, userDAO, authenticatedUserVouchProgress, pendingApplicationProgress, pendingVouchApplication, optimisticJoin, accountAddress, address, roleHatIds, crossChainUsername, graphUsername, quickJoinPaymasterHatIds]);

  const handleJoinNewUser = useCallback(async () => {
    if (!organization) return;

    if (!newUsername.trim()) {
      usernameInputRef.current.focus();
      toast({
        title: "Username required",
        description: "Please enter a username to continue",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    setLoading(true);

    // Determine the hat to claim from vouch progress
    const vouchedHatId = authenticatedUserVouchProgress?.hatId
      || (pendingApplicationProgress?.isComplete ? pendingVouchApplication?.hatId : null)
      || null;

    let joinFn;
    if (isPasskeyUser) {
      // Passkey: get credential
      const credential = accountAddress ? getAllCredentials()[accountAddress.toLowerCase()] : null;
      if (!credential) {
        toast({
          title: "Credential not found",
          description: "Could not find your passkey credential. Please sign in again.",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "top",
        });
        setLoading(false);
        return;
      }

      if (vouchedHatId) {
        // Vouched passkey: registerAndClaimHatsWithPasskey (register + claim specific hat)
        const claimHatIds = [BigInt(vouchedHatId)];
        console.log('[Join] Vouched passkey: register + claim hat', vouchedHatId);
        joinFn = () => organization.registerAndClaimHatsNewUser(quickJoinContractAddress, newUsername, credential, claimHatIds, {
          paymasterHatIds: claimHatIds,
        });
      } else {
        // Standard passkey: registerAndQuickJoinWithPasskey (register + mint memberHatIds).
        // paymasterHatIds seeds the paymaster with the hats we're about to be granted;
        // without it the brand-new smart account has no funds and the UserOp hits AA21.
        joinFn = () => organization.registerAndJoinNewUser(quickJoinContractAddress, newUsername, credential, {
          paymasterHatIds: quickJoinPaymasterHatIds,
        });
      }
    } else {
      // EOA path
      if (!signer) {
        toast({
          title: "Wallet not connected",
          description: "Please connect your wallet to continue.",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "top",
        });
        setLoading(false);
        return;
      }

      if (vouchedHatId) {
        // Vouched EOA: registerAndClaimHats (register + claim specific hat)
        const claimHatIds = [BigInt(vouchedHatId)];
        console.log('[Join] Vouched EOA: register + claim hat', vouchedHatId);
        joinFn = () => organization.registerAndClaimHatsEOA(quickJoinContractAddress, newUsername, claimHatIds, signer, {
          paymasterHatIds: claimHatIds,
        });
      } else {
        // Standard EOA: registerAndQuickJoin (register + mint memberHatIds).
        // Same paymaster bootstrap as the passkey path — EIP-7702 EOAs go through the
        // same SmartAccountTransactionManager paymaster-or-self-fund logic.
        joinFn = () => organization.registerAndJoinEOA(quickJoinContractAddress, newUsername, signer, {
          paymasterHatIds: quickJoinPaymasterHatIds,
        });
      }
    }

    const result = await executeWithNotification(
      joinFn,
      {
        pendingMessage: 'Registering username and joining organization...',
        successMessage: 'Account created! Taking you to your profile…',
        refreshEvent: 'user:created',
      }
    );

    if (result.success) {
      setPendingVouchApplication(null);
      const addr = accountAddress || address;
      optimisticJoin({
        address: addr,
        hatIds: vouchedHatId ? [vouchedHatId] : (roleHatIds?.[0] ? [roleHatIds[0]] : []),
        username: newUsername.trim(),
      });
      router.push(`/profile/?org=${encodeURIComponent(userDAO)}`);
    }
    setLoading(false);
  }, [organization, executeWithNotification, quickJoinContractAddress, newUsername, router, userDAO, toast, accountAddress, isPasskeyUser, signer, authenticatedUserVouchProgress, pendingApplicationProgress, pendingVouchApplication, optimisticJoin, roleHatIds, address, quickJoinPaymasterHatIds]);

  const handleApplyAndJoin = useCallback(async () => {
    if (!selectedHatId) {
      toast({
        title: "Role required",
        description: "Please select a role to apply for",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    if (!applicationNotes.trim()) {
      toast({
        title: "Application notes required",
        description: "Please explain why you want this role",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    setLoading(true);
    try {
      // For vouch-gated orgs: apply first, join later (after quorum met).
      // applyForRole() does not require membership — it just records the application on-chain.
      // Sponsor the gas via the quick-join hats (the applicant is eligible for those, so
      // the paymaster pays) — the vouch-gated hat itself can't sponsor it. See useClaimRole.
      const applyResult = await applyForRole(selectedHatId, {
        notes: applicationNotes.trim(),
        appliedAt: new Date().toISOString(),
      }, quickJoinPaymasterHatIds);

      if (!applyResult?.success) {
        toast({
          title: "Application failed",
          description: "Could not submit your application. Please try again.",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "top",
        });
        return;
      }

      // Generate vouch link for the user to share with existing members
      const userAddr = accountAddress || address;
      const vouchLink = `${window.location.origin}/join?org=${encodeURIComponent(userDAO)}&vouch=${userAddr}&hatId=${selectedHatId}`;

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(vouchLink);
        toast({
          title: "Application submitted!",
          description: "Vouch link copied to clipboard. Share it with existing members.",
          status: "success",
          duration: 5000,
          isClosable: true,
          position: "top",
        });
      } catch {
        toast({
          title: "Application submitted!",
          description: "Share the vouch link below with existing members.",
          status: "success",
          duration: 5000,
          isClosable: true,
          position: "top",
        });
      }

      // Transition to "waiting for vouches" UI
      const roleName = rolesWithVouching.find(r => r.hatId === selectedHatId)?.name || 'role';
      setPendingVouchApplication({ hatId: selectedHatId, vouchLink, roleName });
    } finally {
      setLoading(false);
    }
  }, [
    selectedHatId, applicationNotes,
    applyForRole, toast, accountAddress, address, userDAO, rolesWithVouching,
    quickJoinPaymasterHatIds,
  ]);

  const seoHead = (
    <SEOHead
      title="Join Organization"
      description="Join a community-owned organization."
      path="/join"
      noIndex
    />
  );

  if (isSSR) {
    return seoHead;
  }

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;
  return (
    <>
      {seoHead}
      <Navbar />
      <JoinLayout
        orgName={userDAO}
        orgLogoSrc={orgLogoSrc}
        isVouching={Boolean(isAuthenticated && hasMemberRole && vouchAddress && vouchHatId)}
        isAuthenticated={isAuthenticated}
        account={address && !isPasskeyUser ? <Box bg="gray.800" borderRadius="lg"><AccountControl label="Account" /></Box> : null}
        cardLabel={vouchFirstHook.pendingCredential || pendingVouchApplication ? 'Your application' : requiresInvitation ? 'Membership' : undefined}
        invite={!requiresInvitation && canClaimWithEmail && <EmailInviteCard variant="join" summary={inviteSummary} />}
      >
                  {/* ── Branch 1: Member + vouch link → VouchLinkHandler ── */}
                  {isAuthenticated && hasMemberRole && vouchAddress && vouchHatId ? (
                    <VouchLinkHandler
                      vouchAddress={vouchAddress}
                      hatId={vouchHatId}
                      userDAO={userDAO}
                      roles={roles}
                      vouchFor={vouchFor}
                      isVouching={isVouching}
                      hasAlreadyVouched={hasAlreadyVouched}
                      vouchProgress={vouchLinkProgress}
                    />

                  /* ── Branch 2: Pending vouch-first credential → waiting UI ── */
                  ) : vouchFirstHook.pendingCredential && vouchFirstHook.phase !== VouchFirstPhase.SUCCESS ? (
                    <VStack spacing={formSpacing} align="stretch">
                      <Box textAlign="left">
                        <Box display="inline-block" mb={4}>
                          <Icon as={FaHandshake} color={accentColor} boxSize={7} />
                        </Box>
                        <Heading as="h2" fontSize={{ base: "24px", md: "28px" }} letterSpacing="-0.035em" mb={2} color={textColor}>
                          Waiting for vouches
                        </Heading>
                        <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                          Share the link below with existing members to vouch for you.
                        </Text>
                      </Box>

                      {/* Pending account username badge */}
                      <Box
                        p={3}
                        borderRadius="lg"
                        bg={infoBg}
                        borderWidth="1px"
                        borderColor={infoBorderColor}
                      >
                        <Flex align="center" justify="center" direction="column" gap={1}>
                          <Flex align="center">
                            <Icon as={FaUser} color={accentColor} mr={2} />
                            <Text color={textColor} fontWeight="medium" fontSize="sm">
                              {vouchFirstHook.pendingCredential.username || vouchFirstHook.pendingCredential.accountAddress?.substring(0, 10) + '...' + vouchFirstHook.pendingCredential.accountAddress?.substring(vouchFirstHook.pendingCredential.accountAddress.length - 6)}
                            </Text>
                          </Flex>
                          <Text color={hintColor} fontSize="xs">
                            Your account is saved. Members can now vouch for you.
                          </Text>
                        </Flex>
                      </Box>

                      {/* Copy vouch link button */}
                      <Button
                        width="100%"
                        size="lg"
                        bg={primaryButtonBg}
                        color={primaryButtonColor}
                        _hover={{ bg: colors.hover }}
                        leftIcon={<FaCopy />}
                        borderRadius="xl"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(vouchFirstHook.vouchLink);
                            toast({ title: "Vouch link copied!", description: "Share it with existing members to vouch for you.", status: "success", duration: 3000, position: "top" });
                          } catch {
                            toast({ title: "Couldn't copy — please copy manually", status: "warning", duration: 3000, position: "top" });
                          }
                        }}
                      >
                        Copy vouch link
                      </Button>
                      <Box as="details" fontSize="xs" color={subtextColor}>
                        <Text as="summary" cursor="pointer">View vouch link</Text>
                        <Input
                          aria-label="Vouch link"
                          value={vouchFirstHook.vouchLink}
                          isReadOnly
                          onFocus={(event) => event.target.select()}
                          fontSize="xs"
                          mt={2}
                        />
                      </Box>

                      {/* Vouch progress */}
                      {vouchFirstPendingProgress?.quorum > 0 ? (
                        <Box px={2}>
                          <VouchProgressBar
                            current={vouchFirstPendingProgress.current}
                            quorum={vouchFirstPendingProgress.quorum}
                            size="lg"
                          />
                          {!vouchFirstPendingProgress.isComplete && (
                            <Text fontSize="xs" color={hintColor} textAlign="left" mt={2}>
                              Waiting for {vouchFirstPendingProgress.quorum - vouchFirstPendingProgress.current} more {vouchFirstPendingProgress.quorum - vouchFirstPendingProgress.current === 1 ? 'vouch' : 'vouches'}...
                            </Text>
                          )}
                        </Box>
                      ) : <Text fontSize="sm" color={hintColor} role="status">Checking member vouches…</Text>}

                      {/* Onboarding step progress (when completing) */}
                      {vouchFirstHook.phase === VouchFirstPhase.COMPLETING && vouchFirstHook.stepMessage && (
                        <HStack justify="center" spacing={2}>
                          <PulseLoader size="sm" color={accentColor} />
                          <Text fontSize="sm" color={textColor}>{vouchFirstHook.stepMessage}</Text>
                        </HStack>
                      )}

                      {/* Error display */}
                      {vouchFirstHook.error && (
                        <Alert status="error" borderRadius="md">
                          <AlertIcon />
                          <Text fontSize="sm">{vouchFirstHook.error.message}</Text>
                        </Alert>
                      )}

                      {/* Complete membership button — shown when quorum met AND quorum is actually known */}
                      {vouchFirstPendingProgress?.isComplete && vouchFirstPendingProgress.quorum > 0 ? (
                        <VStack spacing={3}>
                          {(crossChainUsername || vouchFirstHook.pendingCredential?.username) ? (
                            /* Username already set — show read-only */
                            <Text fontSize="sm" color={hintColor}>
                              Joining as <strong>{crossChainUsername || vouchFirstHook.pendingCredential.username}</strong>
                            </Text>
                          ) : (
                            /* Legacy pending credential without stored username — show input */
                            <InputGroup size={isMobile ? "md" : "lg"}>
                              <Input
                                aria-label="Username"
                                autoComplete="username"
                                placeholder="Choose a username"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                bg={inputBg}
                                borderColor={inputBorderColor}
                                _focus={{ borderColor: accentColor, boxShadow: colors.inputFocusRing }}
                                ref={usernameInputRef}
                              />
                              <InputRightElement width="4.5rem">
                                <Icon as={FaUser} color={newUsername ? "green.500" : "gray.300"} />
                              </InputRightElement>
                            </InputGroup>
                          )}
                          <Button
                            colorScheme="amethyst"
                            bg={primaryButtonBg}
                            color={primaryButtonColor}
                            size="lg"
                            width="100%"
                            height={buttonHeight}
                            isLoading={vouchFirstHook.phase === VouchFirstPhase.COMPLETING}
                            loadingText={vouchFirstHook.stepMessage || "Completing..."}
                            onClick={() => vouchFirstHook.completeOnboarding(crossChainUsername || vouchFirstHook.pendingCredential?.username || newUsername.trim())}
                            isDisabled={!crossChainUsername && !vouchFirstHook.pendingCredential?.username && !newUsername.trim()}
                            leftIcon={<FaCheck />}
                          >
                            Complete membership
                          </Button>
                        </VStack>
                      ) : null}

                      {/* Reset / start over */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={vouchFirstHook.reset}
                        leftIcon={<FaRedo />}
                        color={hintColor}
                      >
                        Start over
                      </Button>
                      {!isAuthenticated && <JoinSignIn onSignIn={onSignInOpen} />}
                    </VStack>

                  ) : !orgStructureLoading && requiresInvitation ? (
                    <VStack spacing={formSpacing} align="stretch">
                      {isAuthenticated && <ConnectedAccountBadge variant="join" username={graphUsername || crossChainUsername} />}
                      <JoinInvitationStart
                        orgName={userDAO}
                        status={inviteSummary.status}
                        hasError={Boolean(orgStructureError)}
                        onClaim={emailClaimProp.onClaim}
                        onRetry={orgStructureError ? () => router.reload() : inviteSummary.refresh}
                        isAuthenticated={isAuthenticated}
                        onSignIn={onSignInOpen}
                      >
                        <EmailInviteCard variant="join-details" summary={inviteSummary} />
                      </JoinInvitationStart>
                    </VStack>

                  ) : isAuthenticated ? (
                    orgStructureLoading ? (
                      <VStack spacing={6} align="center" py={12}>
                        <PulseLoader size="lg" color={accentColor} />
                        <Text color={subtextColor} fontSize="sm">
                          Loading membership options…
                        </Text>
                      </VStack>

                    /* ── Branch 3: Authenticated + vouch-gated ── */
                    ) : hasVouchGatedRoles ? (
                      pendingVouchApplication ? (
                        /* ── Branch 3a: Application submitted, waiting for vouches (persisted across refresh) ── */
                        <VStack spacing={formSpacing} align="stretch">
                          <ConnectedAccountBadge variant="join" username={graphUsername || crossChainUsername} />

                          <Box textAlign="left">
                            {pendingApplicationProgress?.isComplete ? (
                              <>
                                <Icon as={FaCheck} color="green.400" boxSize={7} mb={4} />
                                <Heading as="h2" fontSize={{ base: "24px", md: "28px" }} letterSpacing="-0.035em" mb={2} color={textColor}>
                                  Your vouches are complete
                                </Heading>
                                <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                                  You've been vouched for the <b>{pendingVouchApplication.roleName}</b> role.
                                  {dispaly && graphUsername ? '' : ' Enter a username to complete your membership.'}
                                </Text>
                              </>
                            ) : (
                              <>
                                <Box display="inline-block" mb={4}>
                                  <Icon as={FaHandshake} color={accentColor} boxSize={7} />
                                </Box>
                                <Heading as="h2" fontSize={{ base: "24px", md: "28px" }} letterSpacing="-0.035em" mb={2} color={textColor}>
                                  Application submitted
                                </Heading>
                                <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                                  Share this link with existing members of <b>{userDAO}</b> so they can vouch for you
                                  for the <b>{pendingVouchApplication.roleName}</b> role.
                                </Text>
                              </>
                            )}
                          </Box>

                          {/* Vouch link copy section */}
                          <Box
                            p={{ base: 3, md: 4 }}
                            borderRadius="lg"
                            bg={inputBg}
                            borderWidth="1px"
                            borderColor={inputBorderColor}
                          >
                            <Flex align="center" gap={2}>
                              <Text fontSize="xs" color={subtextColor} flex="1" isTruncated>
                                {pendingVouchApplication.vouchLink}
                              </Text>
                              <IconButton
                                icon={<FaCopy />}
                                size="sm"
                                colorScheme="amethyst"
                                variant="ghost"
                                onClick={() => {
                                  navigator.clipboard.writeText(pendingVouchApplication.vouchLink);
                                  toast({
                                    title: "Link copied!",
                                    status: "success",
                                    duration: 2000,
                                    position: "top",
                                  });
                                }}
                                aria-label="Copy vouch link"
                              />
                            </Flex>
                          </Box>

                          {/* Vouch progress */}
                          {pendingApplicationProgress && (
                            <Box px={2}>
                              <VouchProgressBar
                                current={pendingApplicationProgress.current}
                                quorum={pendingApplicationProgress.quorum}
                                size="md"
                              />
                            </Box>
                          )}

                          {/* When quorum met, show Complete membership */}
                          {pendingApplicationProgress?.isComplete ? (
                            <>
                              {dispaly && graphUsername ? (
                                <Text textAlign="left" fontSize={{ base: "sm", md: "md" }} color={hintColor}>
                                  Joining as: <b>{graphUsername}</b>
                                </Text>
                              ) : (
                                <InputGroup size={isMobile ? "md" : "lg"}>
                                  <Input
                                    aria-label="Username"
                                    autoComplete="username"
                                    placeholder="Choose a username"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    bg={inputBg}
                                    borderColor={inputBorderColor}
                                    _focus={{ borderColor: accentColor, boxShadow: colors.inputFocusRing }}
                                    ref={usernameInputRef}
                                  />
                                  <InputRightElement width="4.5rem">
                                    <Icon as={FaUser} color={newUsername ? "green.500" : "gray.300"} />
                                  </InputRightElement>
                                </InputGroup>
                              )}
                              <Button
                                colorScheme="amethyst"
                                bg={primaryButtonBg}
                                color={primaryButtonColor}
                                size="lg"
                                width="100%"
                                height={buttonHeight}
                                fontSize="sm"
                                isLoading={loading}
                                loadingText="Completing..."
                                onClick={dispaly && graphUsername ? handleJoinWithUser : handleJoinNewUser}
                                isDisabled={!graphUsername && !newUsername.trim()}
                                leftIcon={<FaCheck />}
                                _hover={{ bg: colors.hover }}
                              >
                                Complete membership
                              </Button>
                            </>
                          ) : (
                            <Text textAlign="left" fontSize="sm" color={hintColor}>
                              Waiting for members to vouch for you...
                            </Text>
                          )}

                          {/* Allow starting over */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingVouchApplication(null)}
                            leftIcon={<FaRedo />}
                            color={hintColor}
                          >
                            Start over
                          </Button>
                        </VStack>
                      ) : authenticatedUserVouchProgress ? (
                        /* ── Branch 3b: Vouches already complete (user returns after being vouched) ── */
                        <VStack spacing={formSpacing} align="stretch">
                          <ConnectedAccountBadge variant="join" username={graphUsername || crossChainUsername} />

                          <Box textAlign="left">
                            <Icon as={FaCheck} color="green.400" boxSize={7} mb={4} />
                            <Heading as="h2" fontSize={{ base: "24px", md: "28px" }} letterSpacing="-0.035em" mb={2} color={textColor}>
                              Your vouches are complete
                            </Heading>
                            <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                              Members have supported your application for the <b>{authenticatedUserVouchProgress.roleName}</b> role.
                              {dispaly && graphUsername ? ' You can now complete your membership.' : ' Choose a username to finish joining.'}
                            </Text>
                          </Box>

                          <Box px={2}>
                            <VouchProgressBar
                              current={authenticatedUserVouchProgress.current}
                              quorum={authenticatedUserVouchProgress.quorum}
                              size="md"
                            />
                          </Box>

                          {dispaly && graphUsername ? (
                            <Text textAlign="left" fontSize={{ base: "sm", md: "md" }} color={hintColor}>
                              Joining as: <b>{graphUsername}</b>
                            </Text>
                          ) : (
                            <InputGroup size={isMobile ? "md" : "lg"}>
                              <Input
                                aria-label="Username"
                                autoComplete="username"
                                placeholder="Choose a username"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                bg={inputBg}
                                borderColor={inputBorderColor}
                                _focus={{ borderColor: accentColor, boxShadow: colors.inputFocusRing }}
                                ref={usernameInputRef}
                              />
                              <InputRightElement width="4.5rem">
                                <Icon as={FaUser} color={newUsername ? "green.500" : "gray.300"} />
                              </InputRightElement>
                            </InputGroup>
                          )}

                          <Button
                            colorScheme="amethyst"
                            bg={primaryButtonBg}
                            color={primaryButtonColor}
                            size="lg"
                            width="100%"
                            height={buttonHeight}
                            fontSize="sm"
                            isLoading={loading}
                            loadingText="Completing..."
                            onClick={dispaly && graphUsername ? handleJoinWithUser : handleJoinNewUser}
                            isDisabled={!graphUsername && !newUsername.trim()}
                            leftIcon={<FaCheck />}
                            _hover={{ bg: colors.hover }}
                          >
                            Complete membership
                          </Button>
                        </VStack>
                      ) : hasQuickJoinRoles ? (
                        /* ── Branch 3-mixed: org has BOTH a quick-join role and a vouch-gated role ──
                           Primary CTA = quick-join (no vouches needed); collapsible disclosure reveals
                           the apply form for the vouch-gated role(s). */
                        <VStack spacing={formSpacing} align="stretch">
                          <ConnectedAccountBadge variant="join" username={graphUsername || crossChainUsername} />

                          <Box textAlign="left">
                            <Box display="inline-block" mb={4}>
                              <Icon as={FaUserPlus} color={accentColor} boxSize={7} />
                            </Box>
                            <Heading as="h2" fontSize={{ base: "24px", md: "28px" }} letterSpacing="-0.035em" mb={{ base: 2, md: 4 }} color={textColor}>
                              Join {userDAO}
                            </Heading>
                            <Text color={subtextColor} mb={{ base: 4, md: 6 }} fontSize={{ base: "sm", md: "md" }}>
                              Join as {quickJoinPrimaryRoleName}, or explore other roles.
                            </Text>
                          </Box>

                          {dispaly && graphUsername ? (
                            <VStack spacing={{ base: 4, md: 6 }}>
                              <Button
                                size={isMobile ? "md" : "lg"}
                                colorScheme="amethyst"
                                bg={primaryButtonBg}
                                color={primaryButtonColor}
                                width="100%"
                                height={buttonHeight}
                                fontSize="sm"
                                isLoading={loading}
                                loadingText="Joining..."
                                onClick={handleJoinWithUser}
                                leftIcon={<FaUser />}
                                _hover={{ bg: colors.hover }}
                              >
                                Join as {quickJoinPrimaryRoleName}
                              </Button>
                              <Text textAlign="left" fontSize={{ base: "xs", md: "sm" }} color={hintColor}>
                                Using your existing username: <b>{graphUsername}</b>
                              </Text>
                            </VStack>
                          ) : (
                            <VStack spacing={{ base: 4, md: 6 }}>
                              <InputGroup size={isMobile ? "md" : "lg"}>
                                <Input
                                  aria-label="Username"
                                  autoComplete="username"
                                  placeholder="Choose a username"
                                  value={newUsername}
                                  onChange={(e) => setNewUsername(e.target.value)}
                                  bg={inputBg}
                                  borderColor={inputBorderColor}
                                  _focus={{ borderColor: accentColor, boxShadow: colors.inputFocusRing }}
                                  ref={usernameInputRef}
                                />
                                <InputRightElement width="4.5rem">
                                  <Icon as={FaUser} color={newUsername ? "green.500" : "gray.300"} />
                                </InputRightElement>
                              </InputGroup>
                              <Button
                                colorScheme="amethyst"
                                bg={primaryButtonBg}
                                color={primaryButtonColor}
                                size={isMobile ? "md" : "lg"}
                                width="100%"
                                height={buttonHeight}
                                fontSize="sm"
                                isLoading={loading}
                                loadingText="Joining..."
                                onClick={handleJoinNewUser}
                                isDisabled={!newUsername.trim()}
                                leftIcon={<FaUser />}
                                _hover={{ bg: colors.hover }}
                              >
                                Join as {quickJoinPrimaryRoleName}
                              </Button>
                            </VStack>
                          )}

                          <JoinRoleDisclosure isOpen={showApplyPath} onToggle={() => setShowApplyPath(open => !open)}>
                            <VStack spacing={formSpacing} align="stretch">

                              <RoleApplicationForm variant="join"
                                roles={rolesWithVouching}
                                selectedHatId={selectedHatId}
                                onSelectRole={setSelectedHatId}
                                notes={applicationNotes}
                                onNotesChange={(e) => setApplicationNotes(e.target.value)}
                                emailClaim={emailClaimProp}
                              />

                              <Button
                                colorScheme="amethyst"
                                variant="outline"
                            color={accentColor}
                            borderColor={inputBorderColor}
                                size={isMobile ? "md" : "lg"}
                                width="100%"
                                height={buttonHeight}
                                fontSize="sm"
                                isLoading={loading || isApplying}
                                loadingText="Submitting Application..."
                                onClick={handleApplyAndJoin}
                                isDisabled={
                                  !selectedHatId ||
                                  !applicationNotes.trim() ||
                                  (!graphUsername && !newUsername.trim()) ||
                                  !eligibilityModuleAddress
                                }
                                leftIcon={<FaPaperPlane />}
                                _hover={{ bg: infoBg }}
                              >
                                Submit application
                              </Button>
                            </VStack>
                          </JoinRoleDisclosure>
                        </VStack>
                      ) : (
                        /* ── Branch 3c: No application yet → apply-to-join form ── */
                        <VStack spacing={formSpacing} align="stretch">
                          <ConnectedAccountBadge variant="join" username={graphUsername || crossChainUsername} />

                          <Box textAlign="left">
                            <Box display="inline-block" mb={4}>
                              <Icon as={FaPaperPlane} color={accentColor} boxSize={7} />
                            </Box>
                            <Heading as="h2" fontSize={{ base: "24px", md: "28px" }} letterSpacing="-0.035em" mb={{ base: 2, md: 4 }} color={textColor}>
                              Apply to join {userDAO}
                            </Heading>
                            <Text color={subtextColor} mb={{ base: 4, md: 6 }} fontSize={{ base: "sm", md: "md" }}>
                              Membership in {userDAO} is by application. Select a role and tell us about yourself.
                              Existing members will review and vouch for you.
                            </Text>
                          </Box>

                          {/* Username section */}
                          {dispaly && graphUsername ? (
                            <Text textAlign="left" fontSize={{ base: "sm", md: "md" }} color={hintColor}>
                              Applying as: <b>{graphUsername}</b>
                            </Text>
                          ) : (
                            <InputGroup size={isMobile ? "md" : "lg"}>
                              <Input
                                aria-label="Username"
                                autoComplete="username"
                                placeholder="Choose a username"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                bg={inputBg}
                                borderColor={inputBorderColor}
                                _focus={{
                                  borderColor: accentColor,
                                  boxShadow: colors.inputFocusRing,
                                }}
                                ref={usernameInputRef}
                              />
                              <InputRightElement width="4.5rem">
                                <Icon
                                  as={FaUser}
                                  color={newUsername ? "green.500" : "gray.300"}
                                />
                              </InputRightElement>
                            </InputGroup>
                          )}

                          {/* Role application form */}
                          <RoleApplicationForm variant="join"
                            roles={rolesWithVouching}
                            selectedHatId={selectedHatId}
                            onSelectRole={setSelectedHatId}
                            notes={applicationNotes}
                            onNotesChange={(e) => setApplicationNotes(e.target.value)}
                            emailClaim={emailClaimProp}
                          />

                          <Button
                            colorScheme="amethyst"
                            bg={primaryButtonBg}
                            color={primaryButtonColor}
                            size={isMobile ? "md" : "lg"}
                            width="100%"
                            height={buttonHeight}
                            fontSize="sm"
                            isLoading={loading || isApplying}
                            loadingText="Submitting Application..."
                            onClick={handleApplyAndJoin}
                            isDisabled={
                              !selectedHatId ||
                              !applicationNotes.trim() ||
                              (!graphUsername && !newUsername.trim()) ||
                              !eligibilityModuleAddress
                            }
                            leftIcon={<FaPaperPlane />}
                          >
                            Submit application
                          </Button>
                        </VStack>
                      )
                    ) : (
                      /* ── Default join flow (roles are freely claimable) ── */
                      <>
                        <VStack spacing={formSpacing} align="stretch">
                          <ConnectedAccountBadge variant="join" username={graphUsername || crossChainUsername} />

                          <Box textAlign="left">
                            <Box display="inline-block" mb={4}>
                              <Icon as={FaUserPlus} color={accentColor} boxSize={7} />
                            </Box>
                            <Heading as="h2" fontSize={{ base: "24px", md: "28px" }} letterSpacing="-0.035em" mb={{ base: 2, md: 4 }} color={textColor}>
                              Complete your membership
                            </Heading>
                            <Text color={subtextColor} mb={{ base: 4, md: 6 }} fontSize={{ base: "sm", md: "md" }}>
                              You're one step away from joining {userDAO}.
                              {dispaly && graphUsername ? " Use your existing account or create a new one." : " Create your new account."}
                            </Text>
                          </Box>

                          {dispaly && graphUsername ? (
                            <VStack spacing={{ base: 4, md: 6 }}>
                              <Button
                                size={isMobile ? "md" : "lg"}
                                colorScheme="amethyst"
                                bg={primaryButtonBg}
                                color={primaryButtonColor}
                                width="100%"
                                height={buttonHeight}
                                fontSize="sm"
                                isLoading={loading}
                                loadingText="Joining..."
                                onClick={handleJoinWithUser}
                                leftIcon={<FaUser />}
                              >
                                Join with this account
                              </Button>

                              <Text textAlign="left" fontSize={{ base: "xs", md: "sm" }} color={hintColor}>
                                Your existing username will be used: <b>{graphUsername}</b>
                              </Text>

                              <Divider />

                              <Text textAlign="left" fontSize={{ base: "xs", md: "sm" }} color={hintColor}>
                                Or create a new account instead
                              </Text>

                              <InputGroup size={isMobile ? "md" : "lg"}>
                                <Input
                                  aria-label="New username"
                                  autoComplete="username"
                                  placeholder="Choose a new username"
                                  value={newUsername}
                                  onChange={(e) => setNewUsername(e.target.value)}
                                  bg={inputBg}
                                  borderColor={inputBorderColor}
                                  _focus={{
                                    borderColor: accentColor,
                                    boxShadow: colors.inputFocusRing,
                                  }}
                                  ref={usernameInputRef}
                                />
                              </InputGroup>

                              <Button
                                colorScheme="blue"
                                size={isMobile ? "md" : "lg"}
                                width="100%"
                                isLoading={loading && newUsername}
                                loadingText="Creating Account..."
                                onClick={handleJoinNewUser}
                                isDisabled={!newUsername.trim()}
                                rightIcon={<FaChevronRight />}
                              >
                                Create a new account & join
                              </Button>
                            </VStack>
                          ) : (
                            <VStack spacing={{ base: 4, md: 6 }}>
                              <Text textAlign="left" fontSize={{ base: "sm", md: "md" }} color={textColor}>
                                Create your account to join {userDAO}
                              </Text>

                              <InputGroup size={isMobile ? "md" : "lg"}>
                                <Input
                                  aria-label="Username"
                                  autoComplete="username"
                                  placeholder="Choose a username"
                                  value={newUsername}
                                  onChange={(e) => setNewUsername(e.target.value)}
                                  bg={inputBg}
                                  borderColor={inputBorderColor}
                                  _focus={{
                                    borderColor: accentColor,
                                    boxShadow: colors.inputFocusRing,
                                  }}
                                  ref={usernameInputRef}
                                />
                                <InputRightElement width="4.5rem">
                                  <Icon
                                    as={FaUser}
                                    color={newUsername ? "green.500" : "gray.300"}
                                  />
                                </InputRightElement>
                              </InputGroup>

                              <Button
                                colorScheme="amethyst"
                                bg={primaryButtonBg}
                                color={primaryButtonColor}
                                size={isMobile ? "md" : "lg"}
                                width="100%"
                                height={buttonHeight}
                                fontSize="sm"
                                isLoading={loading}
                                loadingText="Creating Account..."
                                onClick={handleJoinNewUser}
                                isDisabled={!newUsername.trim()}
                              >
                                Create account & join {userDAO}
                              </Button>

                              <Text fontSize={{ base: "xs", md: "sm" }} color={footerColor} textAlign="left">
                                This creates your profile and membership.
                              </Text>
                            </VStack>
                          )}
                        </VStack>
                      </>
                    )
                  /* ── Branch 5: Not authenticated + vouch-gated → credential creation + vouch link ── */
                  ) : !isAuthenticated && orgStructureLoading ? (
                    <VStack spacing={6} align="center" py={12}>
                      <PulseLoader size="lg" color={accentColor} />
                      <Text color={subtextColor} fontSize="sm">
                        Loading membership options…
                      </Text>
                    </VStack>

                  /* ── Branch 5-mixed: Not authenticated, org has BOTH quick-join + vouch-gated roles.
                       Primary CTA = Create Account / Sign In / Connect Wallet (same as Branch 6 — after
                       creating an account the user lands in the authenticated mixed-org branch where they
                       can quick-join). Collapsible link reveals the apply-for-advanced-role form. */
                  ) : !isAuthenticated && hasBothPaths ? (
                    <VStack spacing={6} align="stretch">
                      <JoinAccountStart orgName={userDAO} roleName={quickJoinPrimaryRoleName} onCreate={onCreateOpen} onSignIn={onSignInOpen} />

                      <JoinRoleDisclosure isOpen={showApplyPath} onToggle={() => setShowApplyPath(open => !open)}>
                            <VStack spacing={formSpacing} align="stretch">

                          <Text fontSize="xs" color={subtextColor} textAlign="left">
                            Choose a role and create your account. Then share a link so existing members can vouch for you.
                          </Text>

                          <InputGroup size={isMobile ? "md" : "lg"}>
                            <Input
                              aria-label="Username"
                              autoComplete="username"
                              placeholder="Choose a username"
                              value={newUsername}
                              onChange={(e) => setNewUsername(e.target.value)}
                              bg={inputBg}
                              borderColor={inputBorderColor}
                              _focus={{ borderColor: accentColor, boxShadow: colors.inputFocusRing }}
                              ref={usernameInputRef}
                            />
                            <InputRightElement width="4.5rem">
                              <Icon as={FaUser} color={newUsername ? "green.500" : "gray.300"} />
                            </InputRightElement>
                          </InputGroup>

                          <RoleApplicationForm variant="join"
                            roles={rolesWithVouching}
                            selectedHatId={selectedHatId}
                            onSelectRole={setSelectedHatId}
                            notes={applicationNotes}
                            onNotesChange={(e) => setApplicationNotes(e.target.value)}
                            emailClaim={emailClaimProp}
                          />

                          {vouchFirstHook.error && (
                            <Alert status="error" borderRadius="md">
                              <AlertIcon />
                              <Text fontSize="sm">{vouchFirstHook.error.message}</Text>
                            </Alert>
                          )}

                          <Button
                            colorScheme="amethyst"
                            variant="outline"
                            color={accentColor}
                            borderColor={inputBorderColor}
                            size={isMobile ? "md" : "lg"}
                            width="100%"
                            height={buttonHeight}
                            fontSize="sm"
                            isLoading={vouchFirstHook.phase === VouchFirstPhase.CREATING_CREDENTIAL}
                            loadingText="Creating account..."
                            onClick={() => vouchFirstHook.createCredentialAndLink(newUsername.trim(), selectedHatId)}
                            isDisabled={!newUsername.trim() || !selectedHatId}
                            leftIcon={<FaPaperPlane />}
                            _hover={{ bg: infoBg }}
                          >
                            Get vouch link
                          </Button>
                        </VStack>
                      </JoinRoleDisclosure>
                    </VStack>

                  ) : !isAuthenticated && hasVouchGatedRoles ? (
                    <VStack spacing={formSpacing} align="stretch">
                      <Box textAlign="left">
                        <Heading as="h2" fontSize={{ base: "24px", md: "28px" }} letterSpacing="-0.035em" mb={2} color={textColor}>
                          Apply to join {userDAO}
                        </Heading>
                        <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                          Choose a role and create your account. Then share a link so existing members can vouch for you.
                        </Text>
                      </Box>

                      <JoinSignIn onSignIn={onSignInOpen} />

                      {/* Username input */}
                      <InputGroup size={isMobile ? "md" : "lg"}>
                        <Input
                          aria-label="Username"
                          autoComplete="username"
                          placeholder="Choose a username"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          bg={inputBg}
                          borderColor={inputBorderColor}
                          _focus={{ borderColor: accentColor, boxShadow: colors.inputFocusRing }}
                          ref={usernameInputRef}
                        />
                        <InputRightElement width="4.5rem">
                          <Icon as={FaUser} color={newUsername ? "green.500" : "gray.300"} />
                        </InputRightElement>
                      </InputGroup>

                      {/* Role selection + application form — only vouch-gated roles belong here.
                          Quick-join roles get a separate primary CTA when hasBothPaths is true. */}
                      <RoleApplicationForm variant="join"
                        roles={rolesWithVouching}
                        selectedHatId={selectedHatId}
                        onSelectRole={setSelectedHatId}
                        notes={applicationNotes}
                        onNotesChange={(e) => setApplicationNotes(e.target.value)}
                        emailClaim={emailClaimProp}
                      />

                      {/* Error display */}
                      {vouchFirstHook.error && (
                        <Alert status="error" borderRadius="md">
                          <AlertIcon />
                          <Text fontSize="sm">{vouchFirstHook.error.message}</Text>
                        </Alert>
                      )}

                      <Button
                        colorScheme="amethyst"
                        bg={primaryButtonBg}
                        color={primaryButtonColor}
                        size={isMobile ? "md" : "lg"}
                        width="100%"
                        height={buttonHeight}
                        fontSize="lg"
                        fontWeight="600"
                        isLoading={vouchFirstHook.phase === VouchFirstPhase.CREATING_CREDENTIAL}
                        loadingText="Creating account..."
                        onClick={() => vouchFirstHook.createCredentialAndLink(newUsername.trim(), selectedHatId)}
                        isDisabled={!newUsername.trim() || !selectedHatId}
                        leftIcon={<FaFingerprint />}
                        _hover={{ bg: colors.hover }}
                      >
                        Create account
                      </Button>

                      <Text fontSize="xs" color={hintColor} textAlign="left">
                        Use a passkey with your face, fingerprint, or device PIN.
                      </Text>

                      <JoinWalletOption />
                    </VStack>

                  /* ── Branch 6: Not authenticated + open org → Create Account / Sign In ── */
                  ) : (
                    <JoinAccountStart orgName={userDAO} roleName={quickJoinPrimaryRoleName} onCreate={onCreateOpen} onSignIn={onSignInOpen} />
                  )}
      </JoinLayout>

        <PasskeyOnboardingModal
          variant="join"
          isOpen={isCreateOpen}
          onClose={onCreateClose}
          paymasterHatId={quickJoinPaymasterHatIds[0]?.toString()}
          onSuccess={(result) => {
            if (!hasVouchGatedRoles) {
              optimisticJoin({
                address: result?.accountAddress,
                hatIds: roleHatIds?.[0] ? [roleHatIds[0]] : [],
                username: '',
              });
              router.push(`/dashboard/?org=${encodeURIComponent(userDAO)}`);
            }
            // For vouch-gated orgs: stay on page so user can apply for a role
          }}
          showWalletOption
        />
        <SignInModal
          variant="join"
          isOpen={isSignInOpen}
          onClose={onSignInClose}
          onSuccess={() => {
            if (hasQuickJoinRoles && !hasVouchGatedRoles) {
              router.push(`/dashboard/?org=${encodeURIComponent(userDAO)}`);
            }
            // For vouch-gated orgs: stay on page, re-render shows appropriate branch
          }}
          onCreateAccount={!vouchFirstHook.pendingCredential && (hasQuickJoinRoles || hasVouchGatedRoles || canClaimWithEmail) ? () => {
            onSignInClose();
            if (hasQuickJoinRoles) onCreateOpen();
            else if (hasVouchGatedRoles) usernameInputRef.current?.focus();
            else emailClaimProp.onClaim();
          } : undefined}
        />
    </>
  );
};

export default User;
