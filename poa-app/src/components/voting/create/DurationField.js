import React, { useMemo } from 'react';
import {
  FormControl,
  FormLabel,
  FormErrorMessage,
  Input,
  Wrap,
  WrapItem,
  Button,
  Text,
  Box,
} from '@chakra-ui/react';
import { inputStyles } from '@/components/shared/glassStyles';

const PRESETS = [
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
];

/**
 * Formats "Voting ends Fri, Jul 17 at 3:12 PM" from a duration in hours.
 * Returns null for non-positive / invalid durations.
 */
export function formatVotingEnds(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return null;
  const end = new Date(Date.now() + h * 3600 * 1000);
  const datePart = end.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timePart = end.toLocaleString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Voting ends ${datePart} at ${timePart}`;
}

/**
 * Duration picker: preset chips [1 day][3 days][1 week][Custom] with a live
 * "Voting ends <date>" readout. Custom reveals a numeric hours input (min 1).
 *
 * `value` is hours (string or number). `onChange(hours)` receives a number.
 */
const DurationField = ({ value, onChange, isInvalid, errorMessage }) => {
  const hours = Number(value);

  // A value that doesn't match any preset means the user is in custom mode.
  const matchedPreset = PRESETS.find(p => p.hours === hours);
  const [customOpen, setCustomOpen] = React.useState(!matchedPreset);

  // Keep custom mode open once a non-preset value is present.
  React.useEffect(() => {
    if (!PRESETS.some(p => p.hours === Number(value))) {
      setCustomOpen(true);
    }
  }, [value]);

  const endsLabel = useMemo(() => formatVotingEnds(value), [value]);

  const selectPreset = (presetHours) => {
    setCustomOpen(false);
    onChange(presetHours);
  };

  return (
    <FormControl isInvalid={isInvalid}>
      <FormLabel color="gray.200" fontSize="sm">
        How long is voting open?
      </FormLabel>
      <Wrap spacing={2} mb={customOpen ? 3 : 2}>
        {PRESETS.map((preset) => {
          const active = !customOpen && Number(value) === preset.hours;
          return (
            <WrapItem key={preset.hours}>
              <Button
                size="sm"
                variant={active ? 'solid' : 'outline'}
                colorScheme="purple"
                bg={active ? 'purple.600' : 'transparent'}
                borderColor="purple.500"
                color="white"
                _hover={{ bg: active ? 'purple.700' : 'whiteAlpha.200' }}
                onClick={() => selectPreset(preset.hours)}
              >
                {preset.label}
              </Button>
            </WrapItem>
          );
        })}
        <WrapItem>
          <Button
            size="sm"
            variant={customOpen ? 'solid' : 'outline'}
            colorScheme="purple"
            bg={customOpen ? 'purple.600' : 'transparent'}
            borderColor="purple.500"
            color="white"
            _hover={{ bg: customOpen ? 'purple.700' : 'whiteAlpha.200' }}
            onClick={() => setCustomOpen(true)}
          >
            Custom
          </Button>
        </WrapItem>
      </Wrap>

      {customOpen && (
        <Input
          placeholder="Hours"
          type="number"
          step="1"
          min="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...inputStyles}
        />
      )}

      {endsLabel ? (
        <Text fontSize="xs" color="purple.200" mt={2}>
          {endsLabel}
        </Text>
      ) : (
        <Box mt={2} />
      )}

      {isInvalid && errorMessage && (
        <FormErrorMessage>{errorMessage}</FormErrorMessage>
      )}
    </FormControl>
  );
};

export default DurationField;
