/**
 * IdentityStep - Streamlined organization identity for the new flow
 *
 * Collects essential organization information with a cleaner, more focused UI.
 * Advanced options (links, auto-upgrade, username) are hidden in Simple mode.
 */

import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Stack,
  FormControl,
  FormLabel,
  FormHelperText,
  Input,
  Textarea,
  Button,
  Badge,
  Checkbox,
  Collapse,
  Text,
  useColorModeValue,
  useToast,
  useDisclosure,
  Tooltip,
  Icon,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, InfoIcon } from '@chakra-ui/icons';
import { useDeployer, UI_MODES } from '../context/DeployerContext';
import { StepHeader, NavigationButtons, ValidationSummary } from '../components/common';
import { validateOrganizationStep } from '../validation/schemas';
import { useIPFScontext } from '@/context/ipfsContext';

// Import existing modals
import LinksModal from '@/components/Architect/LinksModal';
import LogoDropzoneModal from '@/components/Architect/LogoDropzoneModal';

export function IdentityStep() {
  const { state, actions, selectors } = useDeployer();
  const { addToIpfs } = useIPFScontext();
  const toast = useToast();

  const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [isUploading, setIsUploading] = useState(false);

  const { isOpen: isAdvancedOpen, onToggle: toggleAdvanced } = useDisclosure();

  const isSimpleMode = selectors.isSimpleMode();
  const selectedTemplate = selectors.getSelectedTemplate();

  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const helperColor = useColorModeValue('gray.500', 'gray.400');

  const { organization } = state;
  const hasLinks = organization.links && organization.links.length > 0;
  const hasLogo = !!organization.logoURL;

  const handleInputChange = (field, value) => {
    actions.updateOrganization({ [field]: value });
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleLinksChange = (links) => {
    actions.updateOrganization({ links });
    setIsLinksModalOpen(false);
  };

  const handleLogoChange = (logoURL) => {
    actions.setLogoURL(logoURL);
    setIsLogoModalOpen(false);
  };

  const uploadToIPFS = async () => {
    const jsonData = {
      description: organization.description,
      links: organization.links.map((link) => ({
        name: link.name,
        url: link.url,
      })),
      template: state.ui.selectedTemplate || 'default',
    };

    try {
      const result = await addToIpfs(JSON.stringify(jsonData));
      actions.setIPFSHash(result.path);
      return true;
    } catch (error) {
      console.error('Error uploading to IPFS:', error);
      toast({
        title: 'Upload Error',
        description: 'Failed to save organization data. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return false;
    }
  };

  const handleNext = async () => {
    const { isValid, errors } = validateOrganizationStep(organization);

    if (!isValid) {
      setValidationErrors(errors);
      toast({
        title: 'Please fill in required fields',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsUploading(true);
    const uploadSuccess = await uploadToIPFS();
    setIsUploading(false);

    if (uploadSuccess) {
      actions.nextStep();
    }
  };

  const handleBack = () => {
    actions.prevStep();
  };

  return (
    <>
      <StepHeader
        title="Name Your Organization"
        description={
          selectedTemplate
            ? `You're creating a ${selectedTemplate.name}. Give it an identity.`
            : 'Tell us about your organization.'
        }
      />

      <ValidationSummary errors={validationErrors} />

      <VStack spacing={6} align="stretch">
        {/* Main Card */}
        <Box
          bg={cardBg}
          p={6}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={borderColor}
        >
          <VStack spacing={5} align="stretch">
            {/* Organization Name */}
            <FormControl isRequired isInvalid={!!validationErrors.name}>
              <FormLabel fontWeight="medium">Organization Name</FormLabel>
              <Input
                size="lg"
                placeholder="e.g., Sunrise Cooperative, DevDAO, Creative Union"
                value={organization.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                autoFocus
              />
              <FormHelperText color={helperColor}>
                This will be your organization's public name
              </FormHelperText>
            </FormControl>

            {/* Description */}
            <FormControl isRequired isInvalid={!!validationErrors.description}>
              <FormLabel fontWeight="medium">Description</FormLabel>
              <Textarea
                placeholder="Describe your organization's mission and purpose..."
                value={organization.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={4}
                resize="vertical"
              />
              <FormHelperText color={helperColor}>
                Help future members understand what you're building together
              </FormHelperText>
            </FormControl>

            {/* Logo */}
            <FormControl>
              <FormLabel fontWeight="medium">Logo (Optional)</FormLabel>
              <HStack>
                <Button
                  variant="outline"
                  onClick={() => setIsLogoModalOpen(true)}
                >
                  {hasLogo ? 'Change Logo' : 'Upload Logo'}
                </Button>
                {hasLogo && (
                  <Badge colorScheme="green">Logo Added</Badge>
                )}
              </HStack>
            </FormControl>
          </VStack>
        </Box>

        {/* Advanced Options (collapsed in Simple mode) */}
        {isSimpleMode && (
          <Box>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={isAdvancedOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
              onClick={toggleAdvanced}
              color={helperColor}
            >
              {isAdvancedOpen ? 'Hide' : 'Show'} additional options
            </Button>

            <Collapse in={isAdvancedOpen} animateOpacity>
              <Box
                mt={4}
                p={5}
                bg={cardBg}
                borderRadius="lg"
                borderWidth="1px"
                borderColor={borderColor}
              >
                <VStack spacing={4} align="stretch">
                  {/* Links */}
                  <FormControl>
                    <FormLabel fontWeight="medium">Organization Links</FormLabel>
                    <HStack>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsLinksModalOpen(true)}
                      >
                        {hasLinks ? 'Edit Links' : 'Add Links'}
                      </Button>
                      {hasLinks && (
                        <Badge colorScheme="green">
                          {organization.links.length} Links
                        </Badge>
                      )}
                    </HStack>
                    <FormHelperText color={helperColor}>
                      Website, social media, or other relevant links
                    </FormHelperText>
                  </FormControl>

                  {/* Auto-Upgrade */}
                  <FormControl>
                    <HStack>
                      <Checkbox
                        isChecked={organization.autoUpgrade}
                        onChange={(e) =>
                          handleInputChange('autoUpgrade', e.target.checked)
                        }
                        colorScheme="blue"
                      >
                        Enable automatic upgrades
                      </Checkbox>
                      <Tooltip label="Your contracts will automatically update when new versions are released">
                        <InfoIcon color="gray.400" boxSize={3} />
                      </Tooltip>
                    </HStack>
                  </FormControl>

                  {/* Username */}
                  <FormControl>
                    <FormLabel fontWeight="medium">
                      Deployer Username (Optional)
                    </FormLabel>
                    <Input
                      size="sm"
                      placeholder="Your username"
                      value={organization.username || ''}
                      onChange={(e) => handleInputChange('username', e.target.value)}
                      maxLength={32}
                    />
                    <FormHelperText color={helperColor}>
                      Your username as the organization founder
                    </FormHelperText>
                  </FormControl>
                </VStack>
              </Box>
            </Collapse>
          </Box>
        )}

        {/* Show all options in Advanced mode */}
        {!isSimpleMode && (
          <Box
            bg={cardBg}
            p={6}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={borderColor}
          >
            <Text fontWeight="medium" mb={4}>
              Additional Settings
            </Text>
            <VStack spacing={4} align="stretch">
              <Stack direction={{ base: 'column', md: 'row' }} spacing={4}>
                <FormControl>
                  <FormLabel>Organization Links</FormLabel>
                  <HStack>
                    <Button
                      variant="outline"
                      onClick={() => setIsLinksModalOpen(true)}
                    >
                      {hasLinks ? 'Edit Links' : 'Add Links'}
                    </Button>
                    {hasLinks && (
                      <Badge colorScheme="green">
                        {organization.links.length} Links
                      </Badge>
                    )}
                  </HStack>
                </FormControl>

                <FormControl>
                  <FormLabel>Deployer Username</FormLabel>
                  <Input
                    placeholder="Your username (optional)"
                    value={organization.username || ''}
                    onChange={(e) => handleInputChange('username', e.target.value)}
                    maxLength={32}
                  />
                </FormControl>
              </Stack>

              <Checkbox
                isChecked={organization.autoUpgrade}
                onChange={(e) =>
                  handleInputChange('autoUpgrade', e.target.checked)
                }
                colorScheme="blue"
              >
                Enable automatic contract upgrades
              </Checkbox>
            </VStack>
          </Box>
        )}

        {/* Navigation */}
        <NavigationButtons
          onBack={handleBack}
          onNext={handleNext}
          isNextDisabled={!organization.name || !organization.description}
          isLoading={isUploading}
          nextLabel="Continue"
        />
      </VStack>

      {/* Modals */}
      <LinksModal
        isOpen={isLinksModalOpen}
        onSave={handleLinksChange}
        onClose={() => setIsLinksModalOpen(false)}
      />
      <LogoDropzoneModal
        isOpen={isLogoModalOpen}
        onSave={handleLogoChange}
        onClose={() => setIsLogoModalOpen(false)}
      />
    </>
  );
}

export default IdentityStep;
