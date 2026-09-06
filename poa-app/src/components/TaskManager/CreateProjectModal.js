import React, { useState, useEffect, useMemo } from 'react';
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
  Textarea,
  Text,
  Box,
  Divider,
  Tooltip,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  IconButton,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Switch,
  Checkbox,
  Collapse,
  useToast,
  Image,
} from '@chakra-ui/react';
import { AddIcon, InfoIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { ethers } from 'ethers';
import { resolveUsernames } from '@/features/deployer/utils/usernameResolver';
import { getBountyTokenOptions } from '../../util/tokens';
import { usePOContext } from '../../context/POContext';
import { useProjectContext } from '../../context/ProjectContext';
import { createChainClients } from '@/services/web3/utils/chainClients';
import { formatTokenAmount } from '@/util/formatToken';

/**
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {Function} props.onCreateProject
 * @param {string[]} props.roleHatIds - All org role hat IDs
 * @param {Object} props.roleNames - Map of hatId -> role name
 * @param {string[]} props.creatorHatIds - Hat IDs that can create projects
 */
const BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
];

// Org-wide TaskPerm grants, surfaced read-only in Advanced Settings so a project
// creator can see what's already granted across the whole org before overriding it
// per-project. Order + labels mirror the org-structure permissions matrix.
const GLOBAL_PERMISSION_ROWS = [
  { flag: 'canCreate', label: 'Create Tasks' },
  { flag: 'canClaim', label: 'Claim Tasks' },
  { flag: 'canReview', label: 'Review Tasks' },
  { flag: 'canAssign', label: 'Assign Tasks' },
  { flag: 'canSelfReview', label: 'Self-Review' },
  { flag: 'canBudget', label: 'Edit Budgets' },
  { flag: 'canEditMeta', label: 'Edit Task Metadata' },
  { flag: 'canEditFull', label: 'Edit Tasks (Full)' },
];

const CreateProjectModal = ({ isOpen, onClose, onCreateProject, roleHatIds = [], roleNames = {}, creatorHatIds = [], defaultName = '', defaultDescription = '' }) => {
  const toast = useToast();
  const { orgChainId, taskManagerContractAddress, tokenLabel } = usePOContext();
  // Org-wide TaskPerm grants for the read-only baseline shown in Advanced Settings.
  const { globalRolePermissions = [] } = useProjectContext() || {};
  const [loading, setLoading] = useState(false);
  // Org-wide defaults render as a compact, collapsed reference so they don't crowd
  // the editable per-project Role Permissions section.
  const [showGlobalDefaults, setShowGlobalDefaults] = useState(false);

  // Basic fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Pre-fill defaults when modal opens with tour defaults
  // The existing handleClose/resetForm clears fields on close, so
  // name/description will be '' when the modal re-opens
  useEffect(() => {
    if (isOpen && defaultName) {
      setName(defaultName);
    }
    if (isOpen && defaultDescription) {
      setDescription(defaultDescription);
    }
  }, [isOpen, defaultName, defaultDescription]);

  // Token cap (0 = unlimited)
  const [hasCap, setHasCap] = useState(false);
  const [cap, setCap] = useState('');

  // Bounty budgets: array of { token, cap, isUnlimited } objects
  const [bountyBudgets, setBountyBudgets] = useState([]);
  const availableTokens = useMemo(() => getBountyTokenOptions(orgChainId), [orgChainId]);

  // TaskManager token balances for bounty budget warnings
  const [taskManagerBalances, setTaskManagerBalances] = useState({}); // { tokenAddress: balanceString }
  useEffect(() => {
    if (!taskManagerContractAddress || !orgChainId || bountyBudgets.length === 0) return;
    let cancelled = false;
    const fetchBalances = async () => {
      const clients = createChainClients(orgChainId);
      const client = clients?.publicClient;
      if (!client) return;
      const enabledTokens = bountyBudgets.map(b => b.token);
      const results = {};
      await Promise.all(enabledTokens.map(async (addr) => {
        try {
          const bal = await client.readContract({
            address: addr, abi: BALANCE_ABI, functionName: 'balanceOf', args: [taskManagerContractAddress],
          });
          results[addr] = bal.toString();
        } catch { results[addr] = '0'; }
      }));
      if (!cancelled) setTaskManagerBalances(results);
    };
    fetchBalances();
    return () => { cancelled = true; };
  }, [bountyBudgets.length, taskManagerContractAddress, orgChainId]);

  // Additional managers - stores { address, displayName } objects
  const [managers, setManagers] = useState([]);
  const [newManager, setNewManager] = useState('');
  const [isAddingManager, setIsAddingManager] = useState(false);

  const getRoleName = (hatId) => {
    return roleNames[hatId] || roleNames[String(hatId)] || `Role ${hatId.toString().slice(-6)}`;
  };

  // For each TaskPerm, the org-wide roles that already hold it (deduped role names).
  // Read-only — purely informational so creators see the baseline before overriding below.
  const globalPermissionSummary = useMemo(() => (
    GLOBAL_PERMISSION_ROWS.map(({ flag, label }) => {
      const names = (globalRolePermissions || [])
        .filter((g) => g && g[flag])
        .map((g) => getRoleName(g.hatId));
      return { label, roles: Array.from(new Set(names)) };
    })
    // getRoleName derives purely from roleNames; recompute when grants or names change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [globalRolePermissions, roleNames]);

  // Only permissions that actually have an org-wide grant — keeps the reference compact.
  const grantedPermissionRows = useMemo(
    () => globalPermissionSummary.filter((row) => row.roles.length > 0),
    [globalPermissionSummary],
  );



  // Supports both usernames and addresses
  const handleAddManager = async () => {
    const input = newManager.trim();
    if (!input) return;

    setIsAddingManager(true);

    try {
      let address, displayName;

      // Check if input is already a valid address
      if (ethers.utils.isAddress(input)) {
        address = input;
        displayName = `${input.slice(0, 6)}...${input.slice(-4)}`;
      } else {
        // Try to resolve as username
        const { resolved, notFound } = await resolveUsernames([input]);

        if (notFound.length > 0 || !resolved.has(input.toLowerCase())) {
          toast({
            title: 'User Not Found',
            description: `No user found with username "${input}". Please check the spelling or use a wallet address.`,
            status: 'error',
            duration: 4000,
          });
          setIsAddingManager(false);
          return;
        }

        address = resolved.get(input.toLowerCase());
        displayName = input; // Keep username as display name
      }

      // Check for duplicates
      if (managers.some(m => m.address.toLowerCase() === address.toLowerCase())) {
        toast({
          title: 'Duplicate',
          description: 'This user is already added as a manager',
          status: 'warning',
          duration: 3000,
        });
        setIsAddingManager(false);
        return;
      }

      setManagers([...managers, { address, displayName }]);
      setNewManager('');
    } catch (error) {
      console.error('Error adding manager:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add manager',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setIsAddingManager(false);
    }
  };

  const handleRemoveManager = (address) => {
    setManagers(managers.filter(m => m.address !== address));
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setHasCap(false);
    setCap('');
    setBountyBudgets([]);
    setManagers([]);
    setNewManager('');
    // Permission sets are re-populated by useEffect on next open
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter a project name',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    // Validate bounty budgets: each enabled token must have a cap or be unlimited
    for (const b of bountyBudgets) {
      const tokenInfo = availableTokens.find(t => t.address === b.token);
      if (!b.isUnlimited && (!b.cap || Number(b.cap) <= 0)) {
        toast({
          title: 'Bounty Cap Required',
          description: `Please set a spending cap for ${tokenInfo?.symbol || 'token'} or mark it as unlimited.`,
          status: 'error',
          duration: 3000,
        });
        return;
      }
      // Contract enforces MAX_PAYOUT = 1e24 wei (1M tokens at 18 decimals)
      if (!b.isUnlimited) {
        const decimals = tokenInfo?.decimals || 18;
        const capWei = ethers.utils.parseUnits(b.cap.toString(), decimals);
        const MAX_PAYOUT = ethers.BigNumber.from('1000000000000000000000000'); // 1e24
        if (capWei.gt(MAX_PAYOUT)) {
          toast({
            title: 'Cap Too Large',
            description: `${tokenInfo?.symbol || 'Token'} cap exceeds the maximum of ${(1e24 / Math.pow(10, decimals)).toLocaleString()} ${tokenInfo?.symbol || 'tokens'}. Use unlimited for no cap.`,
            status: 'error',
            duration: 5000,
          });
          return;
        }
      }
    }

    setLoading(true);

    try {
      // Convert cap to wei if set
      let capWei = 0;
      if (hasCap && cap) {
        capWei = ethers.utils.parseUnits(cap.toString(), 18);
      }

      // Build bounty token arrays from configured budgets
      // UNLIMITED = type(uint128).max = 2^128 - 1
      const UNLIMITED = ethers.BigNumber.from('340282366920938463463374607431768211455');
      const bountyTokenAddrs = bountyBudgets.map(b => b.token);
      const bountyCapsWei = bountyBudgets.map(b => {
        if (b.isUnlimited) return UNLIMITED;
        const tokenInfo = availableTokens.find(t => t.address === b.token);
        const decimals = tokenInfo?.decimals || 18;
        return ethers.utils.parseUnits(b.cap.toString(), decimals);
      });

      await onCreateProject({
        name: name.trim(),
        description: description.trim(),
        cap: capWei,
        managers: managers.map(m => m.address),
        createHats: [],
        claimHats: [],
        reviewHats: [],
        assignHats: [],
        bountyTokens: bountyTokenAddrs,
        bountyCaps: bountyCapsWei,
      });

      handleClose();
    } catch (error) {
      console.error('Error creating project:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create project',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };



  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Create Project</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Basic Info */}
            <FormControl isRequired>
              <FormLabel>Project Name</FormLabel>
              <Input
                placeholder="Enter project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Description (Optional)</FormLabel>
              <Textarea
                placeholder="Describe the project..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </FormControl>

            <Divider />

            {/* Token Cap */}
            <FormControl>
              <HStack justify="space-between">
                <HStack spacing={1}>
                  <FormLabel mb={0}>Share Budget Cap</FormLabel>
                  <Tooltip label={`Set a maximum amount of ${tokenLabel.toLowerCase()} this project can allocate to tasks. Leave unchecked for unlimited.`} placement="top">
                    <InfoIcon color="gray.400" boxSize={3} />
                  </Tooltip>
                </HStack>
                <Switch
                  isChecked={hasCap}
                  onChange={(e) => setHasCap(e.target.checked)}
                  colorScheme="purple"
                />
              </HStack>
            </FormControl>

            {hasCap && (
              <Box w="100%" p={3} bg="gray.50" borderRadius="md">
                <FormControl>
                  <FormLabel fontSize="sm">Maximum Share Budget</FormLabel>
                  <NumberInput
                    value={cap}
                    onChange={(value) => setCap(value)}
                    min={0}
                  >
                    <NumberInputField placeholder="e.g., 10000" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Total {tokenLabel.toLowerCase()} that can be allocated to tasks in this project
                  </Text>
                </FormControl>
              </Box>
            )}

            <Divider />

            {/* Bounty Token Budgets */}
            {availableTokens.length > 0 && (
              <>
                <FormControl>
                  <HStack spacing={1} mb={2}>
                    <FormLabel mb={0}>Bounty Token Budgets</FormLabel>
                    <Tooltip label="Enable ERC-20 tokens for bounty payments on tasks in this project. Each token needs a spending cap." placement="top">
                      <InfoIcon color="gray.400" boxSize={3} />
                    </Tooltip>
                  </HStack>
                  <Text fontSize="xs" color="gray.500" mb={3}>
                    Tasks can only use bounty tokens that are enabled here.
                  </Text>

                  <VStack spacing={2} align="stretch">
                    {availableTokens.map((token) => {
                      const budget = bountyBudgets.find(b => b.token === token.address);
                      const isEnabled = !!budget;

                      return (
                        <Box key={token.address} p={3} bg="gray.50" borderRadius="md">
                          <HStack justify="space-between" mb={isEnabled ? 2 : 0}>
                            <HStack spacing={2}>
                              {token.logo && (
                                <Image src={token.logo} alt={token.symbol} boxSize="20px" borderRadius="full" fallback={<></>} />
                              )}
                              <Text fontSize="sm" fontWeight="600">{token.symbol}</Text>
                              <Text fontSize="xs" color="gray.500">{token.name}</Text>
                            </HStack>
                            <Switch
                              isChecked={isEnabled}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setBountyBudgets(prev => [...prev, { token: token.address, cap: '', isUnlimited: false }]);
                                } else {
                                  setBountyBudgets(prev => prev.filter(b => b.token !== token.address));
                                }
                              }}
                              colorScheme="teal"
                              size="sm"
                            />
                          </HStack>

                          {isEnabled && (
                            <VStack spacing={2} align="stretch">
                              <HStack spacing={3}>
                                <Checkbox
                                  size="sm"
                                  isChecked={budget.isUnlimited}
                                  onChange={(e) => {
                                    setBountyBudgets(prev => prev.map(b =>
                                      b.token === token.address ? { ...b, isUnlimited: e.target.checked } : b
                                    ));
                                  }}
                                  colorScheme="teal"
                                >
                                  <Text fontSize="xs">Unlimited</Text>
                                </Checkbox>
                                {!budget.isUnlimited && (
                                  <NumberInput
                                    size="sm"
                                    value={budget.cap}
                                    onChange={(value) => {
                                      setBountyBudgets(prev => prev.map(b =>
                                        b.token === token.address ? { ...b, cap: value } : b
                                      ));
                                    }}
                                    min={0}
                                    flex={1}
                                  >
                                    <NumberInputField placeholder={`Max ${token.symbol}`} />
                                  </NumberInput>
                                )}
                              </HStack>
                              {/* Show TaskManager balance and warn if insufficient */}
                              {(() => {
                                const tmBalance = taskManagerBalances[token.address] || '0';
                                const formatted = formatTokenAmount(tmBalance, token.decimals, 4);
                                let insufficient = false;
                                if (!budget.isUnlimited && budget.cap && Number(budget.cap) > 0) {
                                  try {
                                    const capWei = ethers.utils.parseUnits(budget.cap.toString(), token.decimals);
                                    insufficient = capWei.gt(ethers.BigNumber.from(tmBalance));
                                  } catch { /* invalid input, skip warning */ }
                                }
                                return (
                                  <>
                                    <Text fontSize="xs" color="gray.500">
                                      Available in bounty fund: {formatted} {token.symbol}
                                    </Text>
                                    {insufficient && (
                                      <Text fontSize="xs" color="orange.400">
                                        ⚠ Insufficient — deposit more {token.symbol} via Treasury → Fund Bounties
                                      </Text>
                                    )}
                                  </>
                                );
                              })()}
                            </VStack>
                          )}
                        </Box>
                      );
                    })}
                  </VStack>
                </FormControl>

                <Divider />
              </>
            )}

            {/* Advanced Settings */}
            <Accordion allowToggle>
              <AccordionItem border="none">
                <AccordionButton px={0}>
                  <Box flex="1" textAlign="left" fontWeight="medium">
                    Advanced Settings
                  </Box>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb={4} px={0}>
                  <VStack spacing={4} align="stretch">
                    {/* Additional Managers */}
                    <FormControl>
                      <HStack spacing={1} mb={2}>
                        <FormLabel mb={0}>Additional Managers</FormLabel>
                        <Tooltip label="Add other users that can manage this project. Managers can manage tasks. Budget edits still require budget permission." placement="top">
                          <InfoIcon color="gray.400" boxSize={3} />
                        </Tooltip>
                      </HStack>
                      <HStack>
                        <Input
                          placeholder="Username or 0x... address"
                          value={newManager}
                          onChange={(e) => setNewManager(e.target.value)}
                          size="sm"
                          onKeyPress={(e) => e.key === 'Enter' && !isAddingManager && handleAddManager()}
                        />
                        <IconButton
                          aria-label="Add manager"
                          icon={<AddIcon />}
                          size="sm"
                          colorScheme="purple"
                          onClick={handleAddManager}
                          isLoading={isAddingManager}
                        />
                      </HStack>
                      {managers.length > 0 && (
                        <Wrap mt={2}>
                          {managers.map((manager) => (
                            <WrapItem key={manager.address}>
                              <Tooltip label={manager.address} placement="top">
                                <Tag size="sm" colorScheme="purple" borderRadius="full">
                                  <TagLabel>{manager.displayName}</TagLabel>
                                  <TagCloseButton onClick={() => handleRemoveManager(manager.address)} />
                                </Tag>
                              </Tooltip>
                            </WrapItem>
                          ))}
                        </Wrap>
                      )}
                    </FormControl>

                    <Divider />

                    <Text fontSize="sm" color="gray.600">
                      This project starts with your organization’s current task permissions.
                      Change a role’s project permissions through a governance proposal after creating it.
                      Project managers can manage tasks; editing budgets requires budget permission.
                    </Text>
                    <Divider />

                    {/* Organization-wide defaults — compact, collapsed reference so it
                        doesn't crowd the editable per-project settings above. */}
                    <Box>
                      <HStack
                        as="button"
                        type="button"
                        onClick={() => setShowGlobalDefaults((v) => !v)}
                        spacing={1.5}
                        color="gray.500"
                        _hover={{ color: 'gray.700' }}
                        aria-expanded={showGlobalDefaults}
                      >
                        <ChevronRightIcon
                          boxSize={4}
                          transform={showGlobalDefaults ? 'rotate(90deg)' : undefined}
                          transition="transform 0.15s"
                        />
                        <Text fontSize="xs" fontWeight="medium">Organization-wide defaults</Text>
                        <Tooltip label="Current task permissions inherited from your organization. Project overrides are managed through governance." placement="top">
                          <InfoIcon boxSize={3} />
                        </Tooltip>
                      </HStack>
                      <Collapse in={showGlobalDefaults} animateOpacity>
                        <Box pt={2} pl={5}>
                          {grantedPermissionRows.length > 0 ? (
                            <VStack spacing={1.5} align="stretch">
                              {grantedPermissionRows.map(({ label, roles }) => (
                                <HStack key={label} align="start" justify="space-between" spacing={3}>
                                  <Text fontSize="xs" color="gray.600" flexShrink={0}>{label}</Text>
                                  <Wrap justify="flex-end" flex={1} spacing={1}>
                                    {roles.map((roleName) => (
                                      <WrapItem key={roleName}>
                                        <Tag size="sm" colorScheme="purple" variant="subtle" borderRadius="full">
                                          <TagLabel>{roleName}</TagLabel>
                                        </Tag>
                                      </WrapItem>
                                    ))}
                                  </Wrap>
                                </HStack>
                              ))}
                            </VStack>
                          ) : (
                            <Text fontSize="xs" color="gray.500">
                              No organization-wide task permissions are configured. Project managers can manage tasks; a proposal can grant roles additional permissions.
                            </Text>
                          )}
                        </Box>
                      </Collapse>
                    </Box>
                  </VStack>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={handleClose}>
            Cancel
          </Button>
          <Button
            colorScheme="purple"
            onClick={handleSubmit}
            isLoading={loading}
            loadingText="Creating..."
          >
            Create Project
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CreateProjectModal;
