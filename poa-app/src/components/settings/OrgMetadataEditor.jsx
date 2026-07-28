/**
 * OrgMetadataEditor - Component for editing organization metadata
 * Allows admins to update name, description, logo, and links
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  FormHelperText,
  Input,
  Textarea,
  Button,
  Text,
  Image,
  IconButton,
  useToast,
  Icon,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Divider,
  Alert,
  AlertIcon,
  Switch,
} from '@chakra-ui/react';
import { CloseIcon, AddIcon } from '@chakra-ui/icons';
import { PiImage } from 'react-icons/pi';
import { useDropzone } from 'react-dropzone';
import PulseLoader from "@/components/shared/PulseLoader";
import { useQuery } from '@apollo/client';
import { getClient } from '@/util/apolloClient';

import { useAccount, useSwitchChain } from 'wagmi';
import { useIPFScontext } from '@/context/ipfsContext';
import { useAuth } from '@/context/AuthContext';
import { useWeb3Services, useTransactionWithNotification } from '@/hooks';
import { ipfsCidToBytes32, stringToBytes } from '@/services/web3/utils/encoding';
import {
  validateImageFile,
  MAX_LOGO_SIZE_BYTES,
  ACCEPTED_IMAGE_MIME,
} from '@/util/imageUpload';
import { normalizeHourlyRate, DEFAULT_HOURLY_RATE } from '@/util/taskUtils';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@/util/queries';
import { RefreshEvent } from '@/context/RefreshContext';
import { getSubgraphUrl, getNetworkByChainId } from '@/config/networks';
import OrgRegistryABI from '../../../abi/OrgRegistry.json';

// IPFS gateway - matches pattern used elsewhere in codebase
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

/**
 * Logo Upload Component
 */
function LogoUpload({ logoURL, localPreview, onUpload, onRemove, onUploadingChange }) {
  const [isUploading, setIsUploading] = useState(false);
  const { addToIpfs } = useIPFScontext();
  const toast = useToast();

  // Use local blob preview (instant) if available, otherwise IPFS gateway (may have propagation delay)
  const previewSrc = localPreview || (logoURL ? `${IPFS_GATEWAY}${logoURL}` : null);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const check = validateImageFile(file, MAX_LOGO_SIZE_BYTES);
    if (!check.valid) {
      toast({
        title: 'Upload rejected',
        description: check.error,
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    setIsUploading(true);
    onUploadingChange?.(true);
    try {
      const result = await addToIpfs(file);
      if (result && result.path) {
        const blobUrl = URL.createObjectURL(file);
        onUpload(result.path, blobUrl);
        toast({
          title: 'Logo uploaded',
          status: 'success',
          duration: 2000,
        });
      }
    } catch (error) {
      console.error('Logo upload error:', error);
      toast({
        title: 'Upload failed',
        description: error.message,
        status: 'error',
        duration: 3000,
      });
    } finally {
      setIsUploading(false);
      onUploadingChange?.(false);
    }
  }, [addToIpfs, onUpload, onUploadingChange, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_IMAGE_MIME,
    maxFiles: 1,
    disabled: isUploading,
  });

  return (
    <Box
      {...getRootProps()}
      border="2px dashed"
      borderColor={isDragActive ? 'coral.400' : 'warmGray.200'}
      borderRadius="xl"
      p={6}
      textAlign="center"
      cursor="pointer"
      bg={isDragActive ? 'coral.50' : 'warmGray.50'}
      transition="all 0.2s ease"
      _hover={{ borderColor: 'coral.300', bg: 'coral.50' }}
    >
      <input {...getInputProps()} />
      {isUploading ? (
        <PulseLoader size="lg" color="coral.500" />
      ) : previewSrc ? (
        <VStack spacing={3}>
          <Image
            src={previewSrc}
            alt="Logo"
            boxSize="80px"
            objectFit="cover"
            borderRadius="xl"
          />
          <Button
            size="sm"
            variant="ghost"
            colorScheme="red"
            leftIcon={<CloseIcon boxSize={2} />}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            fontWeight="400"
          >
            Remove
          </Button>
        </VStack>
      ) : (
        <VStack spacing={2}>
          <Icon as={PiImage} boxSize={8} color="warmGray.300" />
          <Text color="warmGray.400" fontSize="sm">
            {isDragActive ? 'Drop logo here' : 'Click or drag to upload logo'}
          </Text>
          <Text color="warmGray.400" fontSize="xs">
            PNG, JPG, GIF, WebP — up to 2MB
          </Text>
        </VStack>
      )}
    </Box>
  );
}

/**
 * Links Editor Component
 */
function LinksEditor({ links, onChange }) {
  const handleAddLink = () => {
    onChange([...links, { name: '', url: '' }]);
  };

  const handleRemoveLink = (index) => {
    onChange(links.filter((_, i) => i !== index));
  };

  const handleUpdateLink = (index, field, value) => {
    const updated = [...links];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <VStack spacing={3} align="stretch">
      {links.map((link, index) => (
        <HStack key={index} spacing={2}>
          <Input
            placeholder="Name (e.g., Twitter)"
            value={link.name}
            onChange={(e) => handleUpdateLink(index, 'name', e.target.value)}
            size="sm"
            bg="white"
            borderColor="warmGray.200"
            borderRadius="lg"
            color="warmGray.800"
            _placeholder={{ color: 'warmGray.400' }}
            _focus={{ borderColor: 'coral.400', boxShadow: '0 0 0 1px var(--chakra-colors-coral-400)' }}
            flex={1}
          />
          <Input
            placeholder="URL"
            value={link.url}
            onChange={(e) => handleUpdateLink(index, 'url', e.target.value)}
            size="sm"
            bg="white"
            borderColor="warmGray.200"
            borderRadius="lg"
            color="warmGray.800"
            _placeholder={{ color: 'warmGray.400' }}
            _focus={{ borderColor: 'coral.400', boxShadow: '0 0 0 1px var(--chakra-colors-coral-400)' }}
            flex={2}
          />
          <IconButton
            icon={<CloseIcon boxSize={2} />}
            size="sm"
            variant="ghost"
            color="warmGray.400"
            _hover={{ color: 'red.500', bg: 'red.50' }}
            onClick={() => handleRemoveLink(index)}
            aria-label="Remove link"
            borderRadius="lg"
          />
        </HStack>
      ))}
      <Button
        leftIcon={<AddIcon boxSize={3} />}
        size="sm"
        variant="ghost"
        color="coral.500"
        _hover={{ bg: 'coral.50' }}
        onClick={handleAddLink}
        fontWeight="500"
      >
        Add Link
      </Button>
    </VStack>
  );
}

/**
 * Main OrgMetadataEditor Component
 */
export default function OrgMetadataEditor({
  orgId,
  orgChainId,
  currentName,
  currentDescription,
  currentLinks,
  currentLogoHash,
  currentHideTreasury,
  currentBackgroundColor,
  currentUseTokenSymbol,
  currentTokenSymbol,
  currentTaskPayoutHoursOnly,
  currentTaskPayoutHourlyRate,
}) {
  const toast = useToast();
  const { addToIpfs } = useIPFScontext();
  const { factory, txManager, isReady } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  const { isPasskeyUser } = useAuth();
  const { chain: connectedChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  // Fetch infrastructure addresses from the ORG'S chain subgraph (not default/home chain).
  // Per-chain client prevents cache poisoning: each endpoint has its own InMemoryCache.
  const orgSubgraphUrl = orgChainId ? getSubgraphUrl(orgChainId) : null;
  const orgClient = useMemo(() => getClient(orgSubgraphUrl), [orgSubgraphUrl]);
  const { data: infraData, loading: infraLoading, error: infraError } = useQuery(
    FETCH_INFRASTRUCTURE_ADDRESSES,
    {
      client: orgClient,
      skip: !orgSubgraphUrl,
    }
  );

  // Extract OrgRegistry address from infrastructure data
  const orgRegistryAddress = infraData?.poaManagerContracts?.[0]?.orgRegistryProxy || null;

  // Form state
  const [name, setName] = useState(currentName || '');
  const [description, setDescription] = useState(currentDescription || '');
  const [logoURL, setLogoURL] = useState(currentLogoHash || '');
  const [logoPreview, setLogoPreview] = useState(null); // Local blob URL for instant preview
  const [logoUploading, setLogoUploading] = useState(false);
  const [links, setLinks] = useState(
    Array.isArray(currentLinks)
      ? currentLinks
      : Object.entries(currentLinks || {}).map(([name, url]) => ({ name, url }))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hideTreasury, setHideTreasury] = useState(currentHideTreasury || false);
  const [bgColor, setBgColor] = useState(currentBackgroundColor || '');
  const [useTokenSymbol, setUseTokenSymbol] = useState(currentUseTokenSymbol === true);
  const [taskPayoutHoursOnly, setTaskPayoutHoursOnly] = useState(currentTaskPayoutHoursOnly === true);
  const [taskPayoutHourlyRate, setTaskPayoutHourlyRate] = useState(
    String(currentTaskPayoutHourlyRate ?? DEFAULT_HOURLY_RATE)
  );

  // Update form when props change (e.g., after successful save + subgraph re-index).
  // Do NOT reset logoURL here — it's set by user actions (upload/remove) only.
  // Resetting it would clobber an in-progress upload with the old CID.
  useEffect(() => {
    setName(currentName || '');
    setDescription(currentDescription || '');
    setLinks(
      Array.isArray(currentLinks)
        ? currentLinks
        : Object.entries(currentLinks || {}).map(([name, url]) => ({ name, url }))
    );
    setHideTreasury(currentHideTreasury || false);
    setBgColor(currentBackgroundColor || '');
    setUseTokenSymbol(currentUseTokenSymbol === true);
    setTaskPayoutHoursOnly(currentTaskPayoutHoursOnly === true);
    setTaskPayoutHourlyRate(String(currentTaskPayoutHourlyRate ?? DEFAULT_HOURLY_RATE));
  }, [currentName, currentDescription, currentLinks, currentHideTreasury, currentBackgroundColor, currentUseTokenSymbol, currentTaskPayoutHoursOnly, currentTaskPayoutHourlyRate]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: 'Name is required',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    if (!isReady || !factory) {
      toast({
        title: 'Not ready yet',
        description: 'Still getting things ready — give it a moment, then try again. If this keeps happening, sign in again.',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Prepare metadata JSON
      const validLinks = links.filter(l => l.name && l.url);

      // Validate link URLs to prevent XSS
      const invalidLink = validLinks.find(l => !/^https?:\/\//i.test(l.url));
      if (invalidLink) {
        toast({
          title: 'Invalid URL',
          description: `"${invalidLink.name}" has an invalid URL. Links must start with http:// or https://`,
          status: 'error',
          duration: 4000,
        });
        return;
      }

      const metadata = {
        description: description.trim(),
        links: validLinks,
        template: 'default',
        logo: logoURL || null,
        backgroundColor: bgColor.trim() || null,
        hideTreasury,
        useTokenSymbol,
        taskPayoutHoursOnly,
        taskPayoutHourlyRate: normalizeHourlyRate(taskPayoutHourlyRate),
      };

      // 2. Upload metadata to IPFS
      const metadataJson = JSON.stringify(metadata);
      const ipfsResult = await addToIpfs(metadataJson);

      if (!ipfsResult || !ipfsResult.path) {
        throw new Error('Failed to upload metadata to IPFS');
      }

      // 3. Convert IPFS CID to bytes32
      const metadataHash = ipfsCidToBytes32(ipfsResult.path);

      // 4. Encode name as bytes
      const nameBytes = stringToBytes(name.trim());

      // 5. Validate OrgRegistry address from infrastructure query
      if (!orgRegistryAddress) {
        throw new Error('OrgRegistry address not found. Infrastructure may not be deployed.');
      }

      // 5b. Switch EOA wallet to org's chain if needed
      if (!isPasskeyUser && orgChainId && connectedChain?.id !== orgChainId) {
        const networkName = getNetworkByChainId(orgChainId)?.name || 'the correct network';
        toast({
          title: 'Switching network',
          description: `Switching to ${networkName}...`,
          status: 'info',
          duration: 3000,
        });
        await switchChainAsync({ chainId: orgChainId });
      }

      // 6. Call updateOrgMetaAsAdmin via txManager for proper result handling
      const contract = factory.createWritable(orgRegistryAddress, OrgRegistryABI);

      const result = await executeWithNotification(
        () => txManager.execute(contract, 'updateOrgMetaAsAdmin', [orgId, nameBytes, metadataHash]),
        {
          pendingMessage: 'Updating organization metadata...',
          successMessage: 'Organization metadata updated successfully!',
          errorMessage: 'Failed to update metadata',
          refreshEvent: RefreshEvent.METADATA_UPDATED,
        }
      );
    } catch (error) {
      console.error('Error updating metadata:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update metadata',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state while fetching infrastructure
  if (infraLoading) {
    return (
      <Card variant="elevated" borderRadius="2xl">
        <CardBody>
          <VStack spacing={4} py={8}>
            <PulseLoader size="lg" color="coral.500" />
            <Text color="warmGray.500">Loading infrastructure...</Text>
          </VStack>
        </CardBody>
      </Card>
    );
  }

  // Show error if infrastructure fetch failed
  if (infraError) {
    return (
      <Card variant="elevated" borderRadius="2xl">
        <CardBody>
          <Alert status="error" borderRadius="xl" bg="red.50">
            <AlertIcon />
            <Text>Failed to load infrastructure addresses: {infraError.message}</Text>
          </Alert>
        </CardBody>
      </Card>
    );
  }

  // Show warning if OrgRegistry not found
  if (!orgRegistryAddress) {
    return (
      <Card variant="elevated" borderRadius="2xl">
        <CardBody>
          <Alert status="warning" borderRadius="xl" bg="orange.50">
            <AlertIcon />
            <Text>OrgRegistry contract not found. Infrastructure may not be fully deployed.</Text>
          </Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card variant="elevated" borderRadius="2xl" overflow="hidden">
      <CardBody px={{ base: 5, md: 8 }} py={8}>
        <VStack spacing={7} align="stretch">
          {/* Name */}
          <FormControl isRequired>
            <FormLabel color="warmGray.600" fontSize="sm" fontWeight="500" mb={2}>
              Organization Name
            </FormLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter organization name"
              bg="white"
              borderColor="warmGray.200"
              borderRadius="xl"
              color="warmGray.800"
              _placeholder={{ color: 'warmGray.400' }}
              _focus={{ borderColor: 'coral.400', boxShadow: '0 0 0 1px var(--chakra-colors-coral-400)' }}
              maxLength={64}
              size="lg"
            />
            <FormHelperText color="warmGray.400" fontSize="xs">
              {name.length}/64 characters
            </FormHelperText>
          </FormControl>

          {/* Description */}
          <FormControl>
            <FormLabel color="warmGray.600" fontSize="sm" fontWeight="500" mb={2}>
              Description
            </FormLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your organization..."
              bg="white"
              borderColor="warmGray.200"
              borderRadius="xl"
              color="warmGray.800"
              _placeholder={{ color: 'warmGray.400' }}
              _focus={{ borderColor: 'coral.400', boxShadow: '0 0 0 1px var(--chakra-colors-coral-400)' }}
              rows={4}
              maxLength={500}
            />
            <FormHelperText color="warmGray.400" fontSize="xs">
              {description.length}/500 characters
            </FormHelperText>
          </FormControl>

          {/* Logo */}
          <FormControl>
            <FormLabel color="warmGray.600" fontSize="sm" fontWeight="500" mb={2}>
              Logo
            </FormLabel>
            <LogoUpload
              logoURL={logoURL}
              localPreview={logoPreview}
              onUpload={(cid, blobUrl) => {
                setLogoURL(cid);
                setLogoPreview(blobUrl);
              }}
              onRemove={() => {
                setLogoURL('');
                setLogoPreview(null);
              }}
              onUploadingChange={setLogoUploading}
            />
          </FormControl>

          {/* Background Color */}
          <FormControl>
            <FormLabel color="warmGray.600" fontSize="sm" fontWeight="500" mb={2}>
              Background Color
            </FormLabel>
            <HStack spacing={3}>
              <Input
                type="color"
                value={bgColor && bgColor.startsWith('#') ? bgColor : '#1a1a2e'}
                onChange={(e) => setBgColor(e.target.value)}
                w="60px"
                h="40px"
                p={1}
                cursor="pointer"
                borderColor="warmGray.200"
              />
              <Input
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                placeholder="#1a1a2e or linear-gradient(...)"
                bg="white"
                borderColor="warmGray.200"
                flex={1}
              />
              {bgColor && (
                <IconButton
                  icon={<CloseIcon />}
                  size="sm"
                  variant="ghost"
                  colorScheme="red"
                  onClick={() => setBgColor('')}
                  aria-label="Clear background color"
                />
              )}
            </HStack>
            <FormHelperText color="warmGray.400" fontSize="xs">
              CSS color (hex, rgba) or gradient. Leave empty for default.
            </FormHelperText>
            {bgColor && (
              <Box
                mt={2}
                h="40px"
                borderRadius="md"
                background={bgColor}
                border="1px solid"
                borderColor="warmGray.200"
              />
            )}
          </FormControl>

          <Divider borderColor="warmGray.100" />

          {/* Links */}
          <FormControl>
            <FormLabel color="warmGray.600" fontSize="sm" fontWeight="500" mb={2}>
              Links
            </FormLabel>
            <LinksEditor links={links} onChange={setLinks} />
          </FormControl>

          <Divider borderColor="warmGray.100" />

          {/* Hide Treasury Toggle */}
          <FormControl display="flex" alignItems="center" justifyContent="space-between">
            <FormLabel color="warmGray.600" fontSize="sm" fontWeight="500" mb={0} htmlFor="hide-treasury">
              Hide Treasury
            </FormLabel>
            <Switch
              id="hide-treasury"
              isChecked={hideTreasury}
              onChange={(e) => setHideTreasury(e.target.checked)}
              colorScheme="coral"
            />
          </FormControl>

          {/* Use Token Symbol Toggle */}
          <FormControl>
            <HStack justifyContent="space-between" alignItems="center">
              <Box>
                <FormLabel color="warmGray.600" fontSize="sm" fontWeight="500" mb={0} htmlFor="use-token-symbol">
                  Show token symbol instead of &quot;Shares&quot;
                </FormLabel>
                <FormHelperText color="warmGray.400" fontSize="xs" mt={1}>
                  {currentTokenSymbol
                    ? `When on, the UI shows "${currentTokenSymbol}" wherever it currently says "Shares".`
                    : 'When on, the UI shows your participation token symbol wherever it currently says "Shares".'}
                </FormHelperText>
              </Box>
              <Switch
                id="use-token-symbol"
                isChecked={useTokenSymbol}
                onChange={(e) => setUseTokenSymbol(e.target.checked)}
                colorScheme="coral"
              />
            </HStack>
          </FormControl>

          {/* Pay by Hours Only Toggle */}
          <Box>
            <FormControl>
              <HStack justifyContent="space-between" alignItems="center">
                <Box>
                  <FormLabel color="warmGray.600" fontSize="sm" fontWeight="500" mb={0} htmlFor="task-payout-hours-only">
                    Pay by hours only (ignore difficulty)
                  </FormLabel>
                  <FormHelperText color="warmGray.400" fontSize="xs" mt={1}>
                    When on, task payout is rate × estimated hours — difficulty no longer affects the amount.
                  </FormHelperText>
                </Box>
                <Switch
                  id="task-payout-hours-only"
                  isChecked={taskPayoutHoursOnly}
                  onChange={(e) => setTaskPayoutHoursOnly(e.target.checked)}
                  colorScheme="coral"
                />
              </HStack>
            </FormControl>
            {taskPayoutHoursOnly && (
              <FormControl mt={4}>
                <FormLabel color="warmGray.600" fontSize="sm" fontWeight="500" mb={2} htmlFor="task-payout-hourly-rate">
                  Tokens per hour
                </FormLabel>
                <Input
                  id="task-payout-hourly-rate"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={taskPayoutHourlyRate}
                  onChange={(e) => setTaskPayoutHourlyRate(e.target.value)}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    setTaskPayoutHourlyRate(String(val > 0 ? val : DEFAULT_HOURLY_RATE));
                  }}
                  bg="white"
                  borderColor="warmGray.200"
                  borderRadius="xl"
                  color="warmGray.800"
                  _focus={{ borderColor: 'coral.400', boxShadow: '0 0 0 1px var(--chakra-colors-coral-400)' }}
                  maxW="160px"
                  size="lg"
                />
                <FormHelperText color="warmGray.400" fontSize="xs">
                  e.g. 10 → a 2-hour task pays 20.
                </FormHelperText>
              </FormControl>
            )}
          </Box>

          <Divider borderColor="warmGray.100" />

          {/* Submit */}
          <Box
            bg="amethyst.50"
            borderRadius="xl"
            px={4}
            py={3}
            border="1px solid"
            borderColor="amethyst.100"
          >
            <Text fontSize="sm" color="amethyst.700">
              Changes will be submitted as a blockchain transaction and may take a moment to appear.
            </Text>
          </Box>

          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            loadingText="Saving..."
            isDisabled={!name.trim() || logoUploading}
            borderRadius="xl"
            h="52px"
            fontSize="md"
          >
            Save Changes
          </Button>
        </VStack>
      </CardBody>
    </Card>
  );
}
