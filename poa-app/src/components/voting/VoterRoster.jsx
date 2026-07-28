import React, { useState } from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  Button,
  Collapse,
  Avatar,
  AvatarGroup,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';

/**
 * VoterRoster — who has voted, and (live polls only) who the group is still
 * waiting on. UX stance, deliberately:
 *
 *  - Names only, never choices. Individual ballots ARE public on-chain, but the
 *    roster's job is participation nudging, not choice surveillance — the same
 *    anti-pressure principle as hiding tallies until you've voted.
 *  - "Waiting on" names sit behind a collapsed expander while the poll is live
 *    (a gentle nudge you opt into reading, not front-and-center shaming) and
 *    collapse to an aggregate count once the poll closes — no retroactive
 *    blame in the archive.
 *  - Avatars are initial-based (Chakra hashes the name to a color), giving the
 *    row social weight beyond a text list.
 *
 * Props:
 *   roster  { voted:[{address,name}], waiting:[{address,name}], exact }
 *   live    bool — poll still accepting votes
 */
export function VoterRoster({ roster, live = false }) {
  const [showWaiting, setShowWaiting] = useState(false);
  if (!roster) return null;

  const { voted = [], waiting = [], exact = false } = roster;
  if (voted.length === 0 && (!exact || waiting.length === 0)) return null;

  const votedNames =
    voted.length <= 3
      ? voted.map((v) => v.name).join(', ')
      : `${voted.slice(0, 3).map((v) => v.name).join(', ')} +${voted.length - 3}`;

  return (
    <VStack align="stretch" spacing={2}>
      {voted.length > 0 && (
        <HStack spacing={2.5} align="center" minW={0}>
          <AvatarGroup size="xs" max={5} spacing="-6px">
            {voted.map((v) => (
              <Avatar key={v.address} name={v.name} bg="#6B4FB3" color="white" />
            ))}
          </AvatarGroup>
          <Text fontSize="xs" color="gray.200" noOfLines={1}>
            <Text as="span" color="gray.100" fontWeight="600">{votedNames}</Text>
            {' '}voted
          </Text>
        </HStack>
      )}

      {exact && waiting.length > 0 && (
        live ? (
          <Box>
            <Button
              variant="ghost"
              size="xs"
              px={1.5}
              color="gray.400"
              fontWeight="500"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              rightIcon={showWaiting ? <ChevronUpIcon /> : <ChevronDownIcon />}
              onClick={() => setShowWaiting((v) => !v)}
            >
              Waiting on {waiting.length} {waiting.length === 1 ? 'member' : 'members'}
            </Button>
            <Collapse in={showWaiting} animateOpacity>
              <Wrap spacing={1.5} mt={1.5} pl={1.5}>
                {waiting.map((m) => (
                  <WrapItem key={m.address}>
                    <Text
                      fontSize="xs"
                      px={2.5}
                      py={1}
                      borderRadius="full"
                      bg="whiteAlpha.200"
                      color="gray.200"
                    >
                      {m.name}
                    </Text>
                  </WrapItem>
                ))}
              </Wrap>
            </Collapse>
          </Box>
        ) : (
          <Text fontSize="xs" color="gray.400" pl={0.5}>
            {waiting.length} {waiting.length === 1 ? 'member' : 'members'} didn&apos;t vote
          </Text>
        )
      )}
    </VStack>
  );
}

export default VoterRoster;
