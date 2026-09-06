import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { Alert, AlertIcon, Badge, Box, Button, Container, Heading, HStack, SimpleGrid, Text, VStack, useDisclosure, useToast } from '@chakra-ui/react';
import SEOHead from '@/components/common/SEOHead';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import AccountControl from '@/components/common/AccountControl';
import SignInModal from '@/components/passkey/SignInModal';
import SolidarityOnboardingModal from '@/components/passkey/SolidarityOnboardingModal';
import PasskeyOnboardingModal from '@/components/passkey/PasskeyOnboardingModal';
import { useWeb3 } from '@/hooks/useWeb3Services';
import { subjectHoldsPerm } from '@/lib/voting/createGate';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';
import SignupModal from '@/components/account/SignupModal';
import SubjectVouchPanel from '@/components/accessV2/SubjectVouchPanel';
import EmailInviteCard from '@/components/zkEmail/EmailInviteCard';
import PulseLoader from '@/components/shared/PulseLoader';
import { useOrgGate } from '@/components/shared/OrgDeadEnd';
import { lightCardStyle, lightSectionStyle } from '@/components/shared/glassStyles';
import { useAuth } from '@/context/AuthContext';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useAuthorityActions } from '@/hooks/accessV2';
import { useAuthorityJoinRoles } from '@/hooks/useAuthorityJoinRoles';
import { joinRoleState } from '@/lib/accessV2/joinRoles';
import { orgUrl } from '@/util/orgUrl';

export default function JoinPage() {
  const router = useRouter();
  const orgGate = useOrgGate();
  const { orgName, poDescription, quickJoinContractAddress } = usePOContext();
  const { isAuthenticated, accountAddress } = useAuth();
  const { graphUsername } = useUserContext();
  const { roles, authority, loading, error, states, refetch } = useAuthorityJoinRoles();
  const { claim, isBusy } = useAuthorityActions();
  const [claimError, setClaimError] = useState(null);
  const [joining, setJoining] = useState(false);
  const { organization, executeWithNotification } = useWeb3();
  const autoJoinRoles = roles.filter(role => subjectHoldsPerm(role, PERM_KEYS.QJ_AUTOJOIN));
  const canAutoJoin = autoJoinRoles.length > 0 && autoJoinRoles.every(role => joinRoleState(states[role.subjectId]).canClaim);
  const signIn = useDisclosure();
  const createAccount = useDisclosure();
  const username = useDisclosure();
  const toast = useToast();
  // Adopted role IDs keep old invite links useful; all writes go to the authority.
  const invitedSubject = String(router.query.subjectId || router.query.hatId || '');
  const inviteUser = typeof router.query.vouch === 'string' && /^0x[0-9a-f]{40}$/i.test(router.query.vouch)
    ? router.query.vouch : null;

  const join = async role => {
    setClaimError(null);
    const result = await claim(role.subjectId, role.name);
    if (result?.success) refetch();
    else if (result?.error) setClaimError(result.error.message);
  };
  const joinOrganization = async () => {
    if (!organization || !authority.enabled || authority.paused || !canAutoJoin) return;
    setJoining(true);
    try {
      const result = await executeWithNotification(() => organization.quickJoinWithUser(quickJoinContractAddress, {
        paymasterHatIds: autoJoinRoles.map(role => role.subjectId),
      }), { pendingMessage: 'Joining organization…', successMessage: 'You joined the organization.', refreshEvent: 'member:joined' });
      if (result?.success) refetch();
      else if (result?.error) setClaimError(result.error.message);
    } finally { setJoining(false); }
  };
  const share = async role => {
    const link = new URL(orgUrl(orgName, 'join'), window.location.origin);
    link.searchParams.set('subjectId', role.subjectId);
    link.searchParams.set('vouch', accountAddress);
    try {
      await navigator.clipboard.writeText(link.toString());
      toast({ title: 'Vouch link copied', description: 'Share it with a member who can vouch for this role.', status: 'success' });
    } catch {
      toast({ title: 'Could not copy the link', status: 'error' });
    }
  };

  if (orgGate) return orgGate;
  return (
    <>
      <SEOHead title={`Join ${orgName}`} description={poDescription} path="/join" />
      <Navbar />
      <Box minH="100vh" bg="warmGray.900" py={{ base: 6, md: 12 }}>
        <Container maxW="container.lg">
          <VStack align="stretch" spacing={6}>
            <Box {...lightSectionStyle} p={{ base: 5, md: 8 }}>
              <VStack align="stretch" spacing={4}>
                <Heading size="lg" color="warmGray.900">Join {orgName}</Heading>
                <Text color="warmGray.600">{poDescription}</Text>
                {isAuthenticated ? (
                  <HStack flexWrap="wrap" gap={3}>
                    <AccountControl />
                    {graphUsername && autoJoinRoles.length > 0 && <Button colorScheme="coral" isDisabled={!canAutoJoin || authority.paused} isLoading={joining} onClick={joinOrganization}>Join organization</Button>}
                    {!graphUsername && <Button variant="outline" onClick={username.onOpen}>Choose a username</Button>}
                    <Button variant="outline" onClick={() => router.push(orgUrl(orgName, 'profile'))}>View your profile</Button>
                  </HStack>
                ) : (
                  <>
                    <Text color="warmGray.600">Create an account or sign in, then choose a role below.</Text>
                    <HStack flexWrap="wrap" gap={3}>
                      <Button colorScheme="coral" onClick={createAccount.onOpen}>Create account</Button>
                      <Button variant="outline" onClick={signIn.onOpen}>Sign in</Button>
                    </HStack>
                  </>
                )}
              </VStack>
            </Box>
            {authority.paused && <Alert status="info" borderRadius="lg"><AlertIcon />Membership changes are paused. You can still view the roles.</Alert>}
            {(error || claimError) && <Alert status="error" borderRadius="lg"><AlertIcon />{claimError || 'Could not load roles. Please try again.'}</Alert>}
            <EmailInviteCard bg="white" textColor="warmGray.900" subtextColor="warmGray.600" />
            <Box {...lightSectionStyle} p={{ base: 5, md: 8 }}>
              <HStack justify="space-between" mb={5}>
                <Heading size="md" color="warmGray.900">Choose a role</Heading>
                {isAuthenticated && <Button size="sm" variant="outline" onClick={refetch}>Refresh eligibility</Button>}
              </HStack>
              {loading ? <PulseLoader /> : !roles.length ? <Text color="warmGray.600">No roles are available yet.</Text> : (
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  {roles.map(role => {
                    const state = joinRoleState(states[role.subjectId]);
                    const showVouches = role.vouchConfig?.quorum > 0;
                    const target = invitedSubject === role.subjectId && inviteUser ? inviteUser : accountAddress;
                    return (
                      <Box key={role.subjectId} {...lightCardStyle} p={5}>
                        <VStack align="stretch" spacing={3}>
                          <HStack justify="space-between">
                            <Text fontWeight="bold" color="warmGray.900">{role.name}</Text>
                            {state.isMember ? <Badge colorScheme="green">Member</Badge> : role.isOpen && <Badge colorScheme="green">Open</Badge>}
                          </HStack>
                          {isAuthenticated ? <>
                            <Text fontSize="sm" color="warmGray.600">{state.message}</Text>
                            {!state.isMember && <Button colorScheme="coral" isDisabled={!state.canClaim || authority.paused} isLoading={isBusy(`claim:${role.subjectId}`)} onClick={() => join(role)}>Join {role.name}</Button>}
                            {showVouches && <Button variant="outline" onClick={() => share(role)}>Copy your vouch link</Button>}
                          </> : <Text fontSize="sm" color="warmGray.600">Sign in to check whether you can join this role.</Text>}
                          {showVouches && target && <SubjectVouchPanel subjectId={role.subjectId} user={target} />}
                        </VStack>
                      </Box>
                    );
                  })}
                </SimpleGrid>
              )}
            </Box>
          </VStack>
        </Container>
      </Box>
      <SignInModal isOpen={signIn.isOpen} onClose={signIn.onClose} />
      {autoJoinRoles.length > 0 && quickJoinContractAddress ? (
        <PasskeyOnboardingModal isOpen={createAccount.isOpen} onClose={createAccount.onClose} paymasterHatId={autoJoinRoles[0].subjectId} onSuccess={() => { createAccount.onClose(); refetch(); }} />
      ) : (
        <SolidarityOnboardingModal isOpen={createAccount.isOpen} onClose={createAccount.onClose} onSuccess={() => { createAccount.onClose(); refetch(); }} />
      )}
      <SignupModal isOpen={username.isOpen} onClose={username.onClose} />
    </>
  );
}
