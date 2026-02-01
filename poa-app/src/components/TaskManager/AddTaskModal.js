import React, { useState, useMemo } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  ModalFooter,
  VStack,
  HStack,
  Select,
  Textarea,
  useToast,
  InputGroup,
  InputRightAddon,
  Switch,
  Text,
  Box,
  Tooltip,
  Avatar,
  IconButton,
  SimpleGrid,
} from '@chakra-ui/react';
import { InfoIcon, CloseIcon } from '@chakra-ui/icons';
import { BOUNTY_TOKEN_OPTIONS, BOUNTY_TOKENS } from '../../util/tokens';
import { useUserContext } from '../../context/UserContext';
import { UserSearchInput } from '@/components/common';
import { calculatePayout, DIFFICULTY_CONFIG } from '@/util/taskUtils';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backdropFilter: 'blur(20px)',
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  boxShadow: 'inset 0 0 15px rgba(148, 115, 220, 0.15)',
  border: '1px solid rgba(148, 115, 220, 0.3)',
};

const inputStyles = {
  bg: 'whiteAlpha.50',
  border: '1px solid',
  borderColor: 'whiteAlpha.200',
  color: 'white',
  _placeholder: { color: 'gray.500' },
  _hover: { borderColor: 'whiteAlpha.300' },
  _focus: {
    borderColor: 'purple.400',
    boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)',
  },
};

const selectStyles = {
  ...inputStyles,
  sx: {
    '& option': {
      bg: 'gray.800',
      color: 'white',
    },
  },
};

const AddTaskModal = ({ isOpen, onClose, onAddTask }) => {
  const { hasExecRole } = useUserContext();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('easy');
  const [estHours, setEstHours] = useState(0.5);
  const [hasBounty, setHasBounty] = useState(false);
  const [bountyToken, setBountyToken] = useState(BOUNTY_TOKENS.BREAD.address);
  const [bountyAmount, setBountyAmount] = useState('');
  const [requiresApplication, setRequiresApplication] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const toast = useToast();

  const estimatedPayout = useMemo(() => {
    return calculatePayout(difficulty, estHours);
  }, [difficulty, estHours]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setDifficulty('easy');
    setEstHours(0.5);
    setHasBounty(false);
    setBountyAmount('');
    setRequiresApplication(false);
    setSelectedUser(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      const taskData = {
        name,
        description,
        difficulty,
        estHours,
        bountyToken: hasBounty ? bountyToken : BOUNTY_TOKENS.NONE.address,
        bountyAmount: hasBounty ? bountyAmount : '0',
        requiresApplication,
        assignTo: selectedUser?.address || null,
      };

      resetForm();
      onAddTask(taskData);
    } catch (error) {
      console.error('Error adding task:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add task',
        status: 'error',
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  const truncateAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl" isCentered>
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(10px)" />
      <ModalContent
        bg="transparent"
        borderRadius="xl"
        position="relative"
        boxShadow="dark-lg"
        mx={4}
      >
        <Box style={glassLayerStyle} />

        <ModalHeader color="white" fontSize="xl" fontWeight="bold" pb={2}>
          Create New Task
        </ModalHeader>
        <ModalCloseButton color="white" />

        <ModalBody pb={6}>
          <VStack spacing={6} align="stretch">
            {/* Task Details Section */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="bold"
                color="purple.300"
                mb={3}
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Task Details
              </Text>
              <VStack spacing={4} align="stretch">
                <FormControl id="task-name">
                  <FormLabel color="gray.300" fontSize="sm">
                    Task Name
                  </FormLabel>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter task name..."
                    {...inputStyles}
                  />
                </FormControl>
                <FormControl id="task-description">
                  <FormLabel color="gray.300" fontSize="sm">
                    Description
                  </FormLabel>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the task..."
                    minH="100px"
                    {...inputStyles}
                  />
                </FormControl>
              </VStack>
            </Box>

            {/* Effort & Payout Section */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="bold"
                color="purple.300"
                mb={3}
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Effort & Payout
              </Text>

              <SimpleGrid columns={2} spacing={4} mb={4}>
                <FormControl id="task-difficulty">
                  <FormLabel color="gray.300" fontSize="sm">
                    Difficulty
                  </FormLabel>
                  <Select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    {...selectStyles}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="veryHard">Very Hard</option>
                  </Select>
                </FormControl>

                <FormControl id="task-estimated-hours">
                  <FormLabel color="gray.300" fontSize="sm">
                    Estimated Hours
                  </FormLabel>
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={estHours}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setEstHours(isNaN(val) ? 0.5 : val);
                    }}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      setEstHours(val <= 0.5 ? 0.5 : Math.round(val * 2) / 2);
                    }}
                    {...inputStyles}
                  />
                </FormControl>
              </SimpleGrid>

              {/* Live Payout Preview */}
              <Box
                p={4}
                bg="rgba(0, 0, 0, 0.3)"
                borderRadius="lg"
                border="1px solid rgba(148, 115, 220, 0.3)"
              >
                <HStack justify="space-between" align="center">
                  <VStack align="start" spacing={0}>
                    <Text fontSize="sm" color="gray.400">
                      Estimated Payout
                    </Text>
                    <HStack spacing={2} align="baseline">
                      <Text fontSize="2xl" fontWeight="bold" color="white">
                        {estimatedPayout}
                      </Text>
                      <Text fontSize="md" color="purple.300">
                        PT
                      </Text>
                    </HStack>
                  </VStack>
                  <Tooltip
                    label={`Base: ${DIFFICULTY_CONFIG[difficulty]?.base || 0} + (${DIFFICULTY_CONFIG[difficulty]?.multiplier || 0} × ${estHours} hrs)`}
                    placement="left"
                    bg="gray.800"
                    color="white"
                    borderRadius="md"
                  >
                    <InfoIcon color="gray.500" boxSize={4} cursor="help" />
                  </Tooltip>
                </HStack>
              </Box>
            </Box>

            {/* Token Bounty Section */}
            <Box>
              <FormControl>
                <HStack justify="space-between" mb={hasBounty ? 3 : 0}>
                  <HStack>
                    <Text
                      fontSize="xs"
                      fontWeight="bold"
                      color="purple.300"
                      textTransform="uppercase"
                      letterSpacing="wide"
                    >
                      Token Bounty
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      (Optional)
                    </Text>
                  </HStack>
                  <Switch
                    isChecked={hasBounty}
                    onChange={(e) => setHasBounty(e.target.checked)}
                    colorScheme="purple"
                  />
                </HStack>
              </FormControl>

              {hasBounty && (
                <Box
                  p={4}
                  bg="rgba(0, 0, 0, 0.3)"
                  borderRadius="lg"
                  border="1px solid rgba(148, 115, 220, 0.2)"
                >
                  <SimpleGrid columns={2} spacing={3}>
                    <FormControl id="bounty-token">
                      <FormLabel color="gray.400" fontSize="xs">
                        Token
                      </FormLabel>
                      <Select
                        value={bountyToken}
                        onChange={(e) => setBountyToken(e.target.value)}
                        size="sm"
                        {...selectStyles}
                      >
                        {BOUNTY_TOKEN_OPTIONS.filter((t) => !t.isDefault).map(
                          (token) => (
                            <option key={token.symbol} value={token.address}>
                              {token.symbol}
                            </option>
                          )
                        )}
                      </Select>
                    </FormControl>
                    <FormControl id="bounty-amount">
                      <FormLabel color="gray.400" fontSize="xs">
                        Amount
                      </FormLabel>
                      <InputGroup size="sm">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={bountyAmount}
                          onChange={(e) => setBountyAmount(e.target.value)}
                          {...inputStyles}
                        />
                        <InputRightAddon
                          bg="whiteAlpha.100"
                          borderColor="whiteAlpha.200"
                          color="gray.400"
                        >
                          {BOUNTY_TOKEN_OPTIONS.find(
                            (t) => t.address === bountyToken
                          )?.symbol || 'TOKEN'}
                        </InputRightAddon>
                      </InputGroup>
                    </FormControl>
                  </SimpleGrid>
                  <Text fontSize="xs" color="gray.500" mt={3}>
                    This bounty will be paid in addition to participation tokens
                  </Text>
                </Box>
              )}
            </Box>

            {/* Assignment Section */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="bold"
                color="purple.300"
                mb={3}
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Assignment
              </Text>

              <VStack spacing={4} align="stretch">
                <FormControl>
                  <HStack justify="space-between">
                    <HStack spacing={1}>
                      <FormLabel mb={0} color="gray.300" fontSize="sm">
                        Require Application
                      </FormLabel>
                      <Tooltip
                        label="Members must apply and be approved before claiming this task"
                        placement="top"
                        bg="gray.800"
                        color="white"
                        borderRadius="md"
                      >
                        <InfoIcon color="gray.500" boxSize={3} />
                      </Tooltip>
                    </HStack>
                    <Switch
                      isChecked={requiresApplication}
                      onChange={(e) =>
                        setRequiresApplication(e.target.checked)
                      }
                      colorScheme="purple"
                    />
                  </HStack>
                </FormControl>

                {hasExecRole && (
                  <FormControl id="task-assign-to">
                    <HStack spacing={1} mb={2}>
                      <FormLabel mb={0} color="gray.300" fontSize="sm">
                        Assign To
                      </FormLabel>
                      <Text fontSize="xs" color="gray.500">
                        (Optional)
                      </Text>
                      <Tooltip
                        label="Directly assign this task to a specific user"
                        placement="top"
                        bg="gray.800"
                        color="white"
                        borderRadius="md"
                      >
                        <InfoIcon color="gray.500" boxSize={3} />
                      </Tooltip>
                    </HStack>

                    {!selectedUser && (
                      <UserSearchInput
                        onSelect={setSelectedUser}
                        placeholder="Search by username..."
                        disabled={loading}
                      />
                    )}

                    {selectedUser && (
                      <HStack
                        p={3}
                        bg="purple.900"
                        borderRadius="lg"
                        justify="space-between"
                        border="1px solid"
                        borderColor="purple.600"
                      >
                        <HStack spacing={3}>
                          <Avatar
                            size="sm"
                            name={
                              selectedUser.username || selectedUser.address
                            }
                            bg="purple.500"
                          />
                          <VStack align="start" spacing={0}>
                            <Text
                              color="white"
                              fontSize="sm"
                              fontWeight="medium"
                            >
                              {selectedUser.username || 'No username'}
                            </Text>
                            <Text
                              color="gray.400"
                              fontSize="xs"
                              fontFamily="mono"
                            >
                              {truncateAddress(selectedUser.address)}
                            </Text>
                          </VStack>
                        </HStack>
                        <IconButton
                          icon={<CloseIcon />}
                          size="sm"
                          variant="ghost"
                          colorScheme="whiteAlpha"
                          onClick={() => setSelectedUser(null)}
                          aria-label="Clear selection"
                          _hover={{ bg: 'whiteAlpha.200' }}
                        />
                      </HStack>
                    )}

                    <Text fontSize="xs" color="gray.500" mt={2}>
                      Leave empty for open claiming
                    </Text>
                  </FormControl>
                )}
              </VStack>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200" pt={4}>
          <HStack spacing={3} w="100%" justify="flex-end">
            <Button
              variant="ghost"
              onClick={handleClose}
              color="gray.400"
              _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
            >
              Cancel
            </Button>
            <Button
              colorScheme="purple"
              onClick={handleSubmit}
              isLoading={loading}
              loadingText="Creating..."
              isDisabled={!name.trim()}
            >
              Create Task
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default AddTaskModal;
