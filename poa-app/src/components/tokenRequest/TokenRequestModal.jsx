import React, { useRef, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputRightAddon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { useAuth } from '@/context/AuthContext';
import { useWeb3 } from '@/hooks/useWeb3Services';
import { usePOContext } from '@/context/POContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { RefreshEvent } from '@/context/RefreshContext';
import EstTimePicker from '@/components/TaskManager/EstTimePicker';
import { inputStyles } from '@/components/shared/glassStyles';
import { formatEstTime } from '@/util/taskUtils';
import { buildContributionReason, getContributionQuote, MAX_REASON_LENGTH } from '@/lib/profile/contributionRequest';

const numberFormat = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 21 });
const fieldStyles = { ...inputStyles, borderRadius: 'lg', minH: 11 };

// Unmount the draft on close, organization change, or account change. Time and
// amounts from one organization's rules must not follow someone into another.
const TokenRequestModal = ({ isOpen, onClose }) => {
  const { accountAddress } = useAuth();
  const { participationTokenAddress } = usePOContext();
  if (!isOpen) return null;
  return <ContributionRequestForm key={`${participationTokenAddress}:${accountAddress}`} onClose={onClose} />;
};

function ContributionRequestForm({ onClose }) {
  const { tokenRequest, executeWithNotification, isReady } = useWeb3();
  const {
    participationTokenAddress,
    tokenLabel = 'Shares',
    taskPayoutHoursOnly,
    taskPayoutHourlyRate,
    loading: orgLoading,
  } = usePOContext();
  const { addToIpfs } = useIPFScontext();
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [hours, setHours] = useState(0);
  const [reason, setReason] = useState('');
  const submitting = useRef(false);
  const descriptionRef = useRef(null);
  const hoursOnly = taskPayoutHoursOnly === true;
  const quote = getContributionQuote({ hoursOnly, hourlyRate: taskPayoutHourlyRate, hours, amount });
  const errors = {
    timeRequired: 'Add the time you contributed.',
    timeIncrement: 'Use 15-minute increments.',
    amountRequired: 'Enter an amount greater than zero.',
    amountWhole: `Enter a whole number of ${tokenLabel}.`,
    amountTooLarge: 'This amount is too large for one request.',
    roundsToZero: `This duration rounds to 0 ${tokenLabel}. Add more time to make a request.`,
  };
  const showQuoteError = !!quote.error && (hoursOnly ? hours > 0 : amount !== '');
  const ready = !quote.error && !!reason.trim() && reason.length <= MAX_REASON_LENGTH
    && !!participationTokenAddress && !orgLoading && isReady && !!tokenRequest;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!ready || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    try {
      const result = await executeWithNotification(
        () => tokenRequest.requestTokens(
          participationTokenAddress,
          quote.amount,
          { reason: buildContributionReason(reason, quote, tokenLabel) },
          { ipfsService: { addToIpfs } }
        ),
        {
          pendingMessage: 'Sending your contribution for review…',
          successMessage: 'Contribution sent for review',
          errorMessage: 'Your request couldn’t be sent. Please try again.',
          refreshEvent: RefreshEvent.TOKEN_REQUEST_CREATED,
          refreshData: { amount: quote.amount },
        }
      );
      if (result.success) onClose();
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!submitting.current) onClose();
  };

  return (
    <Modal isOpen onClose={handleClose} size="lg" isCentered scrollBehavior="inside" initialFocusRef={descriptionRef} closeOnEsc={!loading} closeOnOverlayClick={!loading}>
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent as="form" onSubmit={handleSubmit} bg="gray.900" color="white" borderRadius="2xl" border="1px solid" borderColor="whiteAlpha.200" boxShadow="2xl" mx={4} my={6} maxH="calc(100dvh - 48px)">
        <ModalHeader px={{ base: 5, md: 6 }} pt={6} pb={4} pr={14}>
          <Text as="h2" fontSize="xl" fontWeight="600" letterSpacing="-0.025em">Record a contribution</Text>
          <Text fontSize="sm" color="gray.400" fontWeight="normal" lineHeight="tall" mt={2}>
            For work not already covered by tasks or lessons.
          </Text>
        </ModalHeader>
        <ModalCloseButton top={5} right={4} isDisabled={loading} color="gray.400" _hover={{ bg: 'whiteAlpha.100', color: 'white' }} />
        <ModalBody px={{ base: 5, md: 6 }} pb={5}>
          <VStack spacing={5} align="stretch">
            <FormControl isRequired isDisabled={loading}>
              <FormLabel fontSize="sm" color="gray.200">What did you contribute?</FormLabel>
              <Textarea
                ref={descriptionRef}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="What did you do, and how did it help?"
                rows={3}
                maxLength={MAX_REASON_LENGTH}
                resize="vertical"
                fontSize="sm"
                {...fieldStyles}
              />
              <HStack justify="space-between" align="baseline" spacing={2} mt={2}>
                <FormHelperText m={0} color="gray.400" fontSize="xs">Add links if helpful.</FormHelperText>
                <Text color="gray.400" fontSize="xs" flexShrink={0}>{reason.length}/{MAX_REASON_LENGTH}</Text>
              </HStack>
            </FormControl>

            {hoursOnly ? (
              <FormControl as="fieldset" isRequired isDisabled={loading} isInvalid={showQuoteError}>
                <FormLabel as="legend" fontSize="sm" color="gray.200">Time contributed</FormLabel>
                <EstTimePicker
                  value={hours}
                  onChange={setHours}
                  inputStyles={{ ...fieldStyles, 'aria-label': 'Hours contributed', isDisabled: loading }}
                  selectStyles={{ ...fieldStyles, 'aria-label': 'Minutes contributed', isDisabled: loading, sx: { option: { bg: 'gray.900', color: 'white' } } }}
                />
                <FormErrorMessage fontSize="xs">{errors[quote.error]}</FormErrorMessage>
              </FormControl>
            ) : (
              <FormControl isRequired isDisabled={loading} isInvalid={showQuoteError}>
                <FormLabel fontSize="sm" color="gray.200">Amount to request</FormLabel>
                <InputGroup>
                  <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" placeholder="e.g. 20" {...fieldStyles} borderRightRadius={0} />
                  <InputRightAddon minH={11} maxW="45%" height="auto" bg="whiteAlpha.100" borderColor="whiteAlpha.300" color="gray.300" fontSize="sm" borderRightRadius="lg" overflowWrap="anywhere">{tokenLabel}</InputRightAddon>
                </InputGroup>
                <FormErrorMessage fontSize="xs">{errors[quote.error]}</FormErrorMessage>
              </FormControl>
            )}

            {hoursOnly && (
              <Box p={4} borderRadius="xl" bg="whiteAlpha.50" border="1px solid" borderColor="whiteAlpha.200" aria-live="polite" aria-atomic="true">
                <HStack justify="space-between" align="baseline" spacing={3} flexWrap="wrap">
                  <Text color="gray.300" fontSize="sm">Request amount</Text>
                  <HStack spacing={2} align="baseline" flexWrap="wrap">
                    <Text fontSize="2xl" lineHeight="short" fontWeight="600" letterSpacing="-0.03em" data-testid="contribution-request-amount">{quote.amount ? numberFormat.format(Number(quote.amount)) : '—'}</Text>
                    <Text fontSize="sm" color="purple.200" overflowWrap="anywhere">{tokenLabel}</Text>
                  </HStack>
                </HStack>
                <Text fontSize="xs" color="gray.400" mt={2}>
                  {quote.amount ? `${formatEstTime(quote.hours)} at ` : 'Organization rate: '}{numberFormat.format(quote.hourlyRate)} {tokenLabel} per hour
                </Text>
                {quote.rounded && !quote.error && <Text fontSize="xs" color="gray.400" mt={1}>Rounded to whole {tokenLabel}, just like task rewards.</Text>}
              </Box>
            )}
            {!participationTokenAddress && <Text role="status" color="gray.300" fontSize="sm">Contribution requests aren’t available for this organization yet.</Text>}
          </VStack>
        </ModalBody>
        <ModalFooter px={{ base: 5, md: 6 }} py={5} borderTop="1px solid" borderColor="whiteAlpha.100">
          <VStack w="100%" align="stretch" spacing={4}>
            <Text color="gray.400" fontSize="xs">{!isReady || !tokenRequest ? 'Preparing your account…' : 'Added to your balance after your organization approves.'}</Text>
            <HStack justify="flex-end" spacing={3}>
              <Button type="button" variant="ghost" color="gray.300" minH={11} onClick={handleClose} isDisabled={loading} _hover={{ bg: 'whiteAlpha.100', color: 'white' }}>Cancel</Button>
              <Button type="submit" colorScheme="purple" minH={11} isLoading={loading} loadingText="Sending…" isDisabled={!ready || loading}>Send for review</Button>
            </HStack>
          </VStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default TokenRequestModal;
