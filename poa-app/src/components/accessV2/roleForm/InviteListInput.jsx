import React, { useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, FormControl, FormLabel, HStack, Input,
  Tag, TagCloseButton, TagLabel, Text, VStack, Wrap, WrapItem,
} from '@chakra-ui/react';
import { FiPlus } from 'react-icons/fi';
import { mergeInviteTokens, EMAIL_PRIVACY_NOTE } from '@/lib/accessV2/joinConfig';
import { tokensFor } from '@/components/accessV2/roleForm/formTokens';

/** Domain and specific-email inputs share the exact normalisation used to build proof leaves. */
export default function InviteListInput({ kind, value = [], onChange, openRole, config, variant }) {
  const t = tokensFor(variant);
  const domain = kind === 'domain';
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState(null);
  const add = () => {
    const result = mergeInviteTokens(value, draft, kind);
    onChange(result.list);
    setDraft(result.invalid.join(', '));
    setFeedback(result.invalid.length
      ? `Check ${result.invalid.join(', ')} — enter ${domain ? 'a domain such as example.org' : 'a full email address'}.`
      : result.duplicate.length ? 'Already on the list. Each entry is included once.' : null);
  };
  const readiness = !config?.ready
    ? 'Checking this org’s email verification. You can prepare the list while it loads.'
    : config.error || (!config.enabled
      ? 'Email verification is not enabled for this org. Enable it before submitting a role with email access.'
      : config.authorityMatches === false
        ? 'Email verification is connected to a different membership authority. Update the org’s email settings before submitting.'
        : null);

  return (
    <VStack align="stretch" spacing={3} data-testid={`role-form-${kind}-list`}>
      <Box>
        <Text fontSize="sm" fontWeight="medium" color={t.label}>
          {domain ? 'Join with an email domain' : 'Invite by email'}
        </Text>
        <Text fontSize="xs" color={t.help} mt={1}>
          {domain
            ? 'Anyone who proves they own an email at one of these domains can claim this role. Each domain is a separate way to qualify; vouches are not also required.'
            : 'List specific people who can claim this role after verifying their email. No wallet address is needed, and no invitation email is sent.'}
        </Text>
      </Box>
      {openRole && (
        <Alert status="info" borderRadius="md" fontSize="sm">
          <AlertIcon />
          Turn off Open to claim in Joining to use email domains or email invitations.
        </Alert>
      )}
      <FormControl isDisabled={openRole}>
        <FormLabel color={t.help} fontSize="xs" htmlFor={`role-form-${kind}-input`}>
          {domain ? 'Email domains' : 'Email addresses'}
        </FormLabel>
        <HStack align="start">
          <Input
            id={`role-form-${kind}-input`}
            data-testid={`role-form-${kind}-input`}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setFeedback(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) add(); }
            }}
            placeholder={domain ? 'example.org' : 'person@example.org'}
            autoCapitalize="none"
            autoCorrect="off"
            size="sm"
            {...t.input}
          />
          <Button
            size="sm"
            colorScheme={t.accent}
            variant="outline"
            leftIcon={<FiPlus />}
            onClick={add}
            isDisabled={openRole || !draft.trim()}
            data-testid={`role-form-${kind}-add`}
          >
            Add
          </Button>
        </HStack>
        <Text fontSize="xs" color={t.help} mt={1}>Paste several entries separated by commas or spaces.</Text>
      </FormControl>
      {feedback && <Text role="status" fontSize="xs" color={t.text}>{feedback}</Text>}
      {draft.trim() && <Text fontSize="xs" color={t.help}>Select Add to include these entries in the proposal.</Text>}
      {value.length > 0 && (
        <Wrap spacing={2}>
          {value.map((item) => (
            <WrapItem key={item} maxW="100%">
              <Tag colorScheme={t.accent} size="md" maxW="100%" py={1}>
                <TagLabel whiteSpace="normal" overflowWrap="anywhere">{item}</TagLabel>
                <TagCloseButton aria-label={`Remove ${item}`} onClick={() => onChange(value.filter((v) => v !== item))} />
              </Tag>
            </WrapItem>
          ))}
        </Wrap>
      )}
      {readiness && (
        <Text role="status" fontSize="xs" color={t.help}>{readiness}</Text>
      )}
      {!domain && <Text fontSize="xs" color={t.help}>{EMAIL_PRIVACY_NOTE}</Text>}
    </VStack>
  );
}
