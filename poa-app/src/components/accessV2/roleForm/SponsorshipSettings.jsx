import React, { useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Checkbox, FormControl, FormLabel, HStack, Input, SimpleGrid,
  Switch, Text, VStack,
} from '@chakra-ui/react';
import { tokensFor } from '@/components/accessV2/roleForm/formTokens';

export default function SponsorshipSettings({ value, onChange, config, onRetry, kind = 'role', emailJoining = false, variant }) {
  const t = tokensFor(variant);
  const sponsorship = { enabled: true, capNative: '0.25', epochDays: 30, supportPasskeys: true, ...value };
  const symbol = config?.nativeSymbol || 'native token';
  const canConfigure = config?.ready && config?.canConfigure;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);
  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try { await onRetry?.(); }
    catch (error) { setRetryError(error?.message || 'Unable to reload gas sponsorship.'); }
    finally { setRetrying(false); }
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color={t.label} fontWeight="medium">Gas sponsorship</Text>
        <Text fontSize="xs" color={t.help} mt={1}>
          Cover eligible passkey transactions from the org’s funded gas balance. A new spending limit
          is shared by everyone holding this {kind}.
        </Text>
      </Box>
      {config?.paused && (
        <Alert status="warning" borderRadius="md" fontSize="sm">
          <AlertIcon />
          Gas sponsorship is currently paused. This budget will be available once sponsorship resumes and the org has funds.
        </Alert>
      )}
      {!canConfigure ? (
        <VStack align="stretch" spacing={3}>
        <Alert status="info" borderRadius="md" fontSize="sm" alignItems="flex-start">
          <AlertIcon />
          {!config?.ready
            ? 'Checking whether this org’s governance can configure gas sponsorship…'
            : config.error || 'This org’s governance is not authorized to set sponsorship budgets. An org operator must configure the budget in the paymaster.'}
        </Alert>
        {sponsorship.enabled ? (
          <Button
            size="sm"
            variant="outline"
            colorScheme={t.accent}
            whiteSpace="normal"
            height="auto"
            py={2}
            onClick={() => onChange({ ...sponsorship, enabled: false })}
            data-testid="role-form-sponsorship-skip"
          >
            Continue with existing org sponsorship
          </Button>
        ) : (
          <Text fontSize="xs" color={t.help}>This proposal will keep existing org sponsorship without adding a new budget.</Text>
        )}
        {onRetry && (
          <Button size="sm" variant="ghost" colorScheme={t.accent} onClick={retry} isLoading={retrying}>
            Recheck sponsorship
          </Button>
        )}
        {retryError && <Text fontSize="xs" color={t.help}>{retryError}</Text>}
        </VStack>
      ) : (
        <>
          <HStack justify="space-between" align="start">
            <Box pr={3}>
              <Text fontSize="sm" color={t.label}>Set a sponsored gas budget</Text>
              <Text fontSize="xs" color={t.help}>
                Starts at {sponsorship.capNative} {symbol} every {sponsorship.epochDays} days.
              </Text>
            </Box>
            <Switch
              aria-label="Set a sponsored gas budget"
              isChecked={sponsorship.enabled}
              onChange={(e) => onChange({ ...sponsorship, enabled: e.target.checked })}
              colorScheme={t.accent}
              data-testid="role-form-sponsorship-enabled"
            />
          </HStack>
          {sponsorship.enabled && (
            <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
              <FormControl>
                <FormLabel color={t.label} fontSize="xs">Shared gas limit ({symbol})</FormLabel>
                <Input
                  value={sponsorship.capNative}
                  onChange={(e) => onChange({ ...sponsorship, capNative: e.target.value })}
                  inputMode="decimal"
                  size="sm"
                  data-testid="role-form-sponsorship-cap"
                  {...t.input}
                />
              </FormControl>
              <FormControl>
                <FormLabel color={t.label} fontSize="xs">Budget resets every (days)</FormLabel>
                <Input
                  value={sponsorship.epochDays}
                  onChange={(e) => onChange({ ...sponsorship, epochDays: e.target.value })}
                  inputMode="decimal"
                  size="sm"
                  data-testid="role-form-sponsorship-epoch"
                  {...t.input}
                />
              </FormControl>
            </SimpleGrid>
          )}
          {sponsorship.enabled && (
            <Checkbox
              isChecked={sponsorship.supportPasskeys}
              onChange={(e) => onChange({ ...sponsorship, supportPasskeys: e.target.checked })}
              colorScheme={t.accent}
              alignItems="flex-start"
              data-testid="role-form-sponsorship-passkeys"
            >
              <VStack align="start" spacing={0} ml={1}>
                <Text fontSize="sm" color={t.label}>Allow membership actions with passkeys</Text>
                <Text fontSize="xs" color={t.help}>
                  Enable the org’s sponsorship rules for claiming and leaving roles, vouching,
                  delegated actions and verified email claims. These rules apply across the org.
                </Text>
              </VStack>
            </Checkbox>
          )}
          {emailJoining && sponsorship.enabled && sponsorship.supportPasskeys && config?.claimBudgetMissing && (
            <Text fontSize="xs" color={t.help}>
              This also starts an email joining budget of {sponsorship.capNative} {symbol} every{' '}
              {sponsorship.epochDays} days so people can claim before holding a role. That budget is shared
              by all new email joiners across the org.
            </Text>
          )}
          <Text fontSize="xs" color={t.help}>
            The org must fund its gas balance. Turning this off leaves its other sponsorship budgets in place.
          </Text>
        </>
      )}
      <Box borderTop="1px solid" borderColor={t.panelBorder} pt={3}>
        <Text fontSize="xs" color={t.label} fontWeight="medium">Passkey actions</Text>
        <Text fontSize="xs" color={t.help} mt={1}>
          Eligible actions still require the member’s usual permissions. Spending limits and the org’s
          available gas balance also apply. This budget does not grant additional permissions.
        </Text>
        {config?.actionsError && <Text fontSize="xs" color={t.help} mt={2}>{config.actionsError}</Text>}
      </Box>
    </VStack>
  );
}
