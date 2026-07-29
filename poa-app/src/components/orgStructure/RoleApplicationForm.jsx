import React from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Select,
  Textarea,
  Text,
  Badge,
  HStack,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';

/**
 * Inline fast-path callout: shown when the currently-selected role can be claimed instantly via the
 * org's email allowlist (ZK Email invites) — sparing the applicant the whole apply-and-vouch wait.
 */
function EmailClaimCallout({ info, onClaim }) {
  const bg = useColorModeValue('teal.50', 'rgba(49, 151, 149, 0.15)');
  const border = useColorModeValue('teal.200', 'teal.600');
  const text = useColorModeValue('teal.800', 'teal.100');

  if (!info?.claimable) return null;
  return (
    <Box mt={2} p={3} borderWidth="1px" borderColor={border} bg={bg} borderRadius="md">
      <Text fontSize="sm" color={text} fontWeight="medium">
        ⚡ This role can be claimed instantly — no application or vouches needed.
      </Text>
      <Text fontSize="xs" color={text} mt={1}>
        {info.byDomain
          ? `Anyone with an email ${info.domains.map((d) => `@${d}`).join(', ')} qualifies.`
          : 'Specific email addresses were invited — if yours is one of them, you qualify.'}
      </Text>
      <Button size="xs" mt={2} colorScheme="teal" onClick={onClaim}>
        Claim with your email instead
      </Button>
    </Box>
  );
}

export function RoleApplicationForm({
  roles,
  selectedHatId,
  onSelectRole,
  notes,
  onNotesChange,
  emailClaim, // optional: { infoFor(hatId) -> {claimable,byDomain,byEmail,domains}, onClaim() }
}) {
  const textColor = useColorModeValue('gray.800', 'white');
  const inputBg = useColorModeValue('white', 'whiteAlpha.100');
  const borderColor = useColorModeValue('gray.300', 'whiteAlpha.300');
  const labelColor = useColorModeValue('gray.700', 'gray.200');
  const hintColor = useColorModeValue('gray.500', 'gray.400');
  const placeholderColor = useColorModeValue('gray.400', 'gray.500');

  const singleRole = roles.length === 1;
  const selectedRole = roles.find(r => String(r.hatId) === String(selectedHatId));
  const infoFor = emailClaim?.infoFor || (() => null);
  const selectedClaimInfo = selectedRole ? infoFor(selectedRole.hatId) : null;
  const singleClaimInfo = singleRole ? infoFor(roles[0].hatId) : null;

  return (
    <VStack spacing={4} align="stretch">
      {singleRole ? (
        <Box>
          <HStack>
            <Text fontSize="sm" color={labelColor}>Applying for:</Text>
            <Badge colorScheme="teal" fontSize="sm">{roles[0].name}</Badge>
            {roles[0].vouchingQuorum && (
              <Text fontSize="xs" color={hintColor}>
                ({roles[0].vouchingQuorum} {roles[0].vouchingQuorum === 1 ? 'vouch' : 'vouches'} required)
              </Text>
            )}
          </HStack>
          <EmailClaimCallout info={singleClaimInfo} onClaim={emailClaim?.onClaim} />
        </Box>
      ) : (
        <FormControl isRequired>
          <FormLabel color={labelColor} fontSize="sm">Select a Role</FormLabel>
          <Select
            placeholder="Choose a role to apply for"
            value={selectedHatId || ''}
            onChange={(e) => onSelectRole(e.target.value || null)}
            bg={inputBg}
            color={textColor}
            borderColor={borderColor}
            _focus={{ borderColor: 'teal.400', boxShadow: '0 0 0 1px teal.400' }}
          >
            {roles.map((role) => {
              const claimable = infoFor(role.hatId)?.claimable;
              return (
                <option key={role.hatId} value={role.hatId}>
                  {role.name} ({role.vouchingQuorum} {role.vouchingQuorum === 1 ? 'vouch' : 'vouches'} required)
                  {claimable ? ' — or instant email claim ⚡' : ''}
                </option>
              );
            })}
          </Select>
          {selectedRole && !selectedClaimInfo?.claimable && (
            <Text fontSize="xs" color={hintColor} mt={1}>
              Existing members will review your application and vouch for you.
            </Text>
          )}
          <EmailClaimCallout info={selectedClaimInfo} onClaim={emailClaim?.onClaim} />
        </FormControl>
      )}

      <FormControl isRequired>
        <FormLabel color={labelColor} fontSize="sm">Why do you want this role?</FormLabel>
        <Textarea
          placeholder="Explain your interest and what you'd contribute..."
          value={notes}
          onChange={onNotesChange}
          rows={3}
          bg={inputBg}
          color={textColor}
          borderColor={borderColor}
          _placeholder={{ color: placeholderColor }}
          _focus={{ borderColor: 'teal.400', boxShadow: '0 0 0 1px teal.400' }}
        />
      </FormControl>

    </VStack>
  );
}

export default RoleApplicationForm;
