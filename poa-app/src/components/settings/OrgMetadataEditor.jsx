/**
 * OrgMetadataEditor - Component for editing organization metadata
 * Allows admins to update name, description, logo, and links
 */

import React, { useState, useCallback, useEffect } from 'react';
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
  Spinner,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Divider,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { CloseIcon, AddIcon } from '@chakra-ui/icons';
import { PiImage } from 'react-icons/pi';
import { useDropzone } from 'react-dropzone';
import { ethers } from 'ethers';
import { useQuery } from '@apollo/client';

import { useIPFScontext } from '@/context/ipfsContext';
import { useWeb3Services, useTransactionWithNotification } from '@/hooks';
import { ipfsCidToBytes32 } from '@/services/web3/utils/encoding';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@/util/queries';
import { RefreshEvent } from '@/context/RefreshContext';
import OrgRegistryABI from '@/abi/OrgRegistry.json';

// IPFS gateway - matches pattern used elsewhere in codebase
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

/**
 * Logo Upload Component
 */
function LogoUpload({ logoURL, onUpload, onRemove }) {
  const [isUploading, setIsUploading] = useState(false);
  const { addToIpfs } = useIPFScontext();
  const toast = useToast();

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await addToIpfs(file);
      if (result && result.path) {
        onUpload(result.path);
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
    }
  }, [addToIpfs, onUpload, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
    maxFiles: 1,
    disabled: isUploading,
  });

  return (
    <Box
      {...getRootProps()}
      border="2px dashed"
      borderColor={isDragActive ? 'blue.400' : 'gray.600'}
      borderRadius="lg"
      p={4}
      textAlign="center"
      cursor="pointer"
      transition="all 0.2s"
      _hover={{ borderColor: 'blue.400', bg: 'whiteAlpha.50' }}
    >
      <input {...getInputProps()} />
      {isUploading ? (
        <Spinner size="lg" color="blue.400" />
      ) : logoURL ? (
        <VStack spacing={2}>
          <Image
            src={`${IPFS_GATEWAY}${logoURL}`}
            alt="Logo"
            boxSize="80px"
            objectFit="cover"
            borderRadius="md"
          />
          <Button
            size="sm"
            variant="ghost"
            colorScheme="red"
            leftIcon={<CloseIcon />}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            Remove
          </Button>
        </VStack>
      ) : (
        <VStack spacing={2}>
          <Icon as={PiImage} boxSize={8} color="gray.400" />
          <Text color="gray.400" fontSize="sm">
            {isDragActive ? 'Drop logo here' : 'Click or drag to upload logo'}
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
            bg="whiteAlpha.100"
            borderColor="gray.600"
            flex={1}
          />
          <Input
            placeholder="URL"
            value={link.url}
            onChange={(e) => handleUpdateLink(index, 'url', e.target.value)}
            size="sm"
            bg="whiteAlpha.100"
            borderColor="gray.600"
            flex={2}
          />
          <IconButton
            icon={<CloseIcon />}
            size="sm"
            variant="ghost"
            colorScheme="red"
            onClick={() => handleRemoveLink(index)}
            aria-label="Remove link"
          />
        </HStack>
      ))}
      <Button
        leftIcon={<AddIcon />}
        size="sm"
        variant="outline"
        onClick={handleAddLink}
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
  currentName,
  currentDescription,
  currentLinks,
  currentLogoHash,
}) {
  const toast = useToast();
  const { addToIpfs } = useIPFScontext();
  const { factory, isReady } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();

  // Fetch infrastructure addresses from subgraph
  const { data: infraData, loading: infraLoading, error: infraError } = useQuery(
    FETCH_INFRASTRUCTURE_ADDRESSES,
    { fetchPolicy: 'cache-first' }
  );

  // Extract OrgRegistry address from infrastructure data
  const orgRegistryAddress = infraData?.poaManagerContracts?.[0]?.orgRegistryProxy || null;

  // Form state
  const [name, setName] = useState(currentName || '');
  const [description, setDescription] = useState(currentDescription || '');
  const [logoURL, setLogoURL] = useState(currentLogoHash || '');
  const [links, setLinks] = useState(
    Array.isArray(currentLinks)
      ? currentLinks
      : Object.entries(currentLinks || {}).map(([name, url]) => ({ name, url }))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update form when props change
  useEffect(() => {
    setName(currentName || '');
    setDescription(currentDescription || '');
    setLogoURL(currentLogoHash || '');
    setLinks(
      Array.isArray(currentLinks)
        ? currentLinks
        : Object.entries(currentLinks || {}).map(([name, url]) => ({ name, url }))
    );
  }, [currentName, currentDescription, currentLinks, currentLogoHash]);

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
        title: 'Wallet not connected',
        description: 'Please connect your wallet to save changes',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Prepare metadata JSON
      const metadata = {
        description: description.trim(),
        links: links.filter(l => l.name && l.url),
        template: 'default',
        logo: logoURL || null,
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
      const nameBytes = ethers.utils.toUtf8Bytes(name.trim());

      // 5. Validate OrgRegistry address from infrastructure query
      if (!orgRegistryAddress) {
        throw new Error('OrgRegistry address not found. Infrastructure may not be deployed.');
      }

      // 6. Call updateOrgMetaAsAdmin (hats address is stored in contract)
      const contract = factory.createWritable(orgRegistryAddress, OrgRegistryABI);

      const result = await executeWithNotification(
        () => contract.updateOrgMetaAsAdmin(orgId, nameBytes, metadataHash),
        {
          pendingMessage: 'Updating organization metadata...',
          successMessage: 'Organization metadata updated successfully!',
          errorMessage: 'Failed to update metadata',
          refreshEvent: RefreshEvent.METADATA_UPDATED,
        }
      );

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Organization metadata has been updated. Changes may take a moment to appear.',
          status: 'success',
          duration: 5000,
        });
      }
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
      <Card bg="gray.800" borderColor="gray.700">
        <CardBody>
          <VStack spacing={4} py={8}>
            <Spinner size="lg" color="blue.400" />
            <Text color="gray.400">Loading infrastructure...</Text>
          </VStack>
        </CardBody>
      </Card>
    );
  }

  // Show error if infrastructure fetch failed
  if (infraError) {
    return (
      <Card bg="gray.800" borderColor="gray.700">
        <CardBody>
          <Alert status="error" borderRadius="md">
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
      <Card bg="gray.800" borderColor="gray.700">
        <CardBody>
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <Text>OrgRegistry contract not found. Infrastructure may not be fully deployed.</Text>
          </Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card bg="gray.800" borderColor="gray.700">
      <CardHeader>
        <Heading size="md" color="white">Edit Organization Info</Heading>
      </CardHeader>
      <CardBody>
        <VStack spacing={6} align="stretch">
          {/* Name */}
          <FormControl isRequired>
            <FormLabel color="gray.300">Organization Name</FormLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter organization name"
              bg="whiteAlpha.100"
              borderColor="gray.600"
              maxLength={64}
            />
            <FormHelperText color="gray.500">
              {name.length}/64 characters
            </FormHelperText>
          </FormControl>

          {/* Description */}
          <FormControl>
            <FormLabel color="gray.300">Description</FormLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your organization..."
              bg="whiteAlpha.100"
              borderColor="gray.600"
              rows={4}
              maxLength={500}
            />
            <FormHelperText color="gray.500">
              {description.length}/500 characters
            </FormHelperText>
          </FormControl>

          {/* Logo */}
          <FormControl>
            <FormLabel color="gray.300">Logo</FormLabel>
            <LogoUpload
              logoURL={logoURL}
              onUpload={setLogoURL}
              onRemove={() => setLogoURL('')}
            />
          </FormControl>

          <Divider borderColor="gray.600" />

          {/* Links */}
          <FormControl>
            <FormLabel color="gray.300">Links</FormLabel>
            <LinksEditor links={links} onChange={setLinks} />
          </FormControl>

          <Divider borderColor="gray.600" />

          {/* Submit */}
          <Alert status="info" variant="subtle" borderRadius="md">
            <AlertIcon />
            <Text fontSize="sm">
              Changes will be submitted as a blockchain transaction and may take a moment to appear.
            </Text>
          </Alert>

          <Button
            colorScheme="blue"
            size="lg"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            loadingText="Saving..."
            isDisabled={!name.trim()}
          >
            Save Changes
          </Button>
        </VStack>
      </CardBody>
    </Card>
  );
}
