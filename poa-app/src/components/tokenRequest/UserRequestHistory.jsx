import React, { useRef, useState } from 'react';
import { Box, VStack, HStack, Text, Button, Badge } from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import PulseLoader from '@/components/shared/PulseLoader';
import { FETCH_USER_TOKEN_REQUESTS } from '@/util/queries';
import { useSubgraphClient } from '@/util/apolloClient';
import { useWeb3 } from '@/hooks/useWeb3Services';
import { useAuth } from '@/context/AuthContext';
import { usePOContext } from '@/context/POContext';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';
import { formatTokenAmount } from '@/util/formatToken';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatDate(timestamp) {
  if (!timestamp) return null;
  const date = new Date(Number(timestamp) * 1000);
  return Number.isFinite(date.getTime()) ? dateFormat.format(date) : null;
}

function LoadingHistory() {
  return (
    <HStack py={3} spacing={3} role="status">
      <PulseLoader size="sm" />
      <Text color="gray.400" fontSize="sm">Loading your requests…</Text>
    </HStack>
  );
}

function StatusBadge({ status }) {
  const color = {
    Pending: 'yellow.200',
    Approved: 'green.200',
    Cancelled: 'gray.400',
  }[status] || 'gray.300';

  return (
    <Badge
      color={color}
      bg="whiteAlpha.100"
      fontSize="xs"
      fontWeight="normal"
      textTransform="none"
      borderRadius="full"
      px={2}
      py={0.5}
      flexShrink={0}
    >
      {status === 'Pending' ? 'In review' : status}
    </Badge>
  );
}

function ScopedRequestHistory({ address, participationTokenAddress, subgraphUrl, tokenLabel }) {
  const { tokenRequest, executeWithNotification, isReady } = useWeb3();
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelledRequestIds, setCancelledRequestIds] = useState(() => new Set());
  const cancellationInFlight = useRef(false);
  const client = useSubgraphClient(subgraphUrl);

  // This component only mounts once the account and organization are resolved.
  // The query returns only requests owned by this account on this endpoint.
  const { data, loading, error, refetch } = useQuery(FETCH_USER_TOKEN_REQUESTS, {
    variables: {
      tokenAddress: participationTokenAddress,
      userAddress: address,
    },
    fetchPolicy: 'cache-first',
    client,
  });

  // The notification flow waits for indexing before emitting. Each mounted
  // history refetches its own account/token query; failures render below.
  useRefreshSubscription(
    [
      RefreshEvent.TOKEN_REQUEST_CREATED,
      RefreshEvent.TOKEN_REQUEST_APPROVED,
      RefreshEvent.TOKEN_REQUEST_CANCELLED,
    ],
    () => { refetch().catch(() => {}); },
    [refetch]
  );

  const userRequests = data?.tokenRequests || [];

  const handleCancel = async (request) => {
    if (!isReady || !tokenRequest || cancellationInFlight.current || request.status !== 'Pending'
      || cancelledRequestIds.has(request.requestId)) return;

    cancellationInFlight.current = true;
    setCancellingId(request.requestId);
    try {
      const result = await executeWithNotification(
        () => tokenRequest.cancelRequest(participationTokenAddress, request.requestId),
        {
          pendingMessage: 'Cancelling contribution request…',
          successMessage: 'Contribution request cancelled',
          errorMessage: 'Couldn’t cancel your request',
          refreshEvent: RefreshEvent.TOKEN_REQUEST_CANCELLED,
          refreshData: { requestId: request.requestId },
        }
      );
      // Confirmation precedes the indexing refresh. Keep the confirmed result
      // visible so stale pending data cannot offer a second cancellation.
      if (result.success) {
        setCancelledRequestIds((current) => new Set([...current, request.requestId]));
      }
    } finally {
      cancellationInFlight.current = false;
      setCancellingId(null);
    }
  };

  if (loading && !data) return <LoadingHistory />;

  if (error) {
    return (
      <VStack align="start" spacing={2} py={2}>
        <Text role="alert" color="gray.300" fontSize="sm">We couldn’t load your requests.</Text>
        <Button
          size="sm"
          variant="link"
          color="purple.200"
          onClick={() => { refetch().catch(() => {}); }}
        >
          Try again
        </Button>
      </VStack>
    );
  }

  if (userRequests.length === 0) {
    return (
      <Text color="gray.400" fontSize="sm" lineHeight="tall" py={2}>
        You haven’t made a contribution request yet.
      </Text>
    );
  }

  return (
    <VStack
      as="ul"
      listStyleType="none"
      m={0}
      p={0}
      spacing={0}
      align="stretch"
      aria-label="Your contribution requests"
      sx={{ '& > * + *': { borderTop: '1px solid', borderColor: 'whiteAlpha.100' } }}
    >
      {userRequests.map((request) => {
        const status = cancelledRequestIds.has(request.requestId) ? 'Cancelled' : request.status;
        const createdDate = formatDate(request.createdAt);
        const resolvedDate = formatDate(request.approvedAt || request.cancelledAt);
        const reason = request.metadata?.reason;

        return (
          <Box as="li" key={request.id} py={3}>
            <HStack justify="space-between" align="start" spacing={3}>
              <Text color="white" fontWeight="medium" fontSize="sm" minW={0} overflowWrap="anywhere">
                {formatTokenAmount(request.amount)} {tokenLabel}
              </Text>
              <StatusBadge status={status} />
            </HStack>
            {reason && (
              <Text color="gray.300" fontSize="sm" lineHeight="tall" mt={2} noOfLines={2} overflowWrap="anywhere">
                {reason}
              </Text>
            )}
            <HStack justify="space-between" align="center" spacing={3} mt={2}>
              <VStack align="start" spacing={0.5} minW={0}>
                <Text fontSize="xs" color="gray.400">
                  {createdDate ? `Requested ${createdDate}` : 'Request date unavailable'}
                </Text>
                {resolvedDate && (
                  <Text fontSize="xs" color="gray.400">
                    {status === 'Cancelled' ? 'Cancelled' : 'Reviewed'} {resolvedDate}
                  </Text>
                )}
              </VStack>
              {status === 'Pending' && (
                <Button
                  size="sm"
                  variant="ghost"
                  color="gray.300"
                  fontWeight="normal"
                  flexShrink={0}
                  _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
                  onClick={() => handleCancel(request)}
                  isLoading={cancellingId === request.requestId}
                  isDisabled={cancellingId !== null || !isReady}
                  aria-label={`Cancel request for ${formatTokenAmount(request.amount)} ${tokenLabel}`}
                >
                  Cancel
                </Button>
              )}
            </HStack>
          </Box>
        );
      })}
    </VStack>
  );
}

export default function UserRequestHistory() {
  const { accountAddress, isAuthenticated, isAuthHydrated } = useAuth();
  const { participationTokenAddress, subgraphUrl, tokenLabel = 'Shares' } = usePOContext();
  const address = accountAddress?.toLowerCase();

  if (!isAuthHydrated) return <LoadingHistory />;
  if (!isAuthenticated || !address) {
    return <Text color="gray.400" fontSize="sm" py={2}>Sign in to view your requests.</Text>;
  }
  if (!participationTokenAddress || !subgraphUrl) {
    return <Text color="gray.400" fontSize="sm" py={2}>Request history is unavailable.</Text>;
  }

  // Remount when the identity or organization changes so Apollo's previous
  // results and pending cancellation state cannot appear under another account.
  return (
    <ScopedRequestHistory
      key={`${subgraphUrl}:${participationTokenAddress.toLowerCase()}:${address}`}
      address={address}
      participationTokenAddress={participationTokenAddress}
      subgraphUrl={subgraphUrl}
      tokenLabel={tokenLabel}
    />
  );
}
