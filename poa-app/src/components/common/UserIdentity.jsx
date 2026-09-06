/**
 * UserIdentity
 *
 * Single, consistent primitive for rendering a user (avatar + name).
 * Resolves identity through IdentityContext so cross-chain profile data
 * is picked up automatically (no caller needs to know which chain holds
 * the user's metadata).
 *
 * Fallback chain:
 *  - Avatar: IPFS URL -> initials over a deterministic gradient seeded from address
 *  - Name:   username -> truncated address
 */

import React, { useMemo } from 'react';
import { Avatar, HStack, Text, Box, Tooltip } from '@chakra-ui/react';
import Link from 'next/link';
import { useIdentity } from '@/context/IdentityContext';
import useIpfsImage from '@/hooks/useIpfsImage';
import { truncateAddress } from '@/utils/profileUtils';

const GRADIENT_PALETTES = [
  ['#F06543', '#E85D85'],
  ['#9055E8', '#7340CC'],
  ['#FF8F6B', '#F06543'],
  ['#B080FF', '#E85D85'],
  ['#FF8FA8', '#B080FF'],
  ['#5A2FA8', '#9055E8'],
  ['#CC4570', '#F06543'],
  ['#7340CC', '#5A2FA8'],
];

function gradientForAddress(address) {
  if (!address) return GRADIENT_PALETTES[0];
  let h = 0;
  for (let i = 2; i < address.length; i++) {
    h = (h * 31 + address.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % GRADIENT_PALETTES.length;
  return GRADIENT_PALETTES[idx];
}

function UserIdentity({
  address,
  size = 'sm',
  showAvatar = true,
  showName = true,
  link = true,
  fallbackName = 'address', // 'address' | 'none'
  nameColor,
  nameFontSize,
  nameFontWeight = 'medium',
  spacing = 2,
  isTruncated = false,
  maxNameW,
  // Optional override hints — used while caller already has data in hand
  usernameHint,
  avatarCidHint,
}) {
  const identity = useIdentity(address);
  const username = identity?.username || usernameHint || null;
  // A resolved identity is only authoritative for the avatar when it actually
  // found one. findUserProfileByAddress picks the single richest record across
  // chains, so an address whose home-chain account has a username and bio but no
  // avatar outranks the org chain's record that does have one — which is exactly
  // how a member's photo went missing from a group they had uploaded it in.
  // The caller's hint is that org's own live subgraph data, so it fills the gap.
  const avatarCid = identity?.avatarCid || avatarCidHint || null;
  const lowerAddress = address ? String(address).toLowerCase() : null;

  const gradient = useMemo(() => gradientForAddress(lowerAddress), [lowerAddress]);
  const avatarSrc = useIpfsImage(showAvatar ? avatarCid : null);

  const displayName = useMemo(() => {
    if (username) return username;
    if (fallbackName === 'address' && lowerAddress) return truncateAddress(lowerAddress);
    return '';
  }, [username, fallbackName, lowerAddress]);

  const initials = useMemo(() => {
    const seed = username || lowerAddress || '';
    if (!seed) return '';
    if (username) {
      return username.slice(0, 2).toUpperCase();
    }
    // Use chars after 0x for a stable identicon-style seed
    return seed.slice(2, 4).toUpperCase();
  }, [username, lowerAddress]);

  const avatarBg = useMemo(
    () => `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`,
    [gradient]
  );

  // Avatar uses our precomputed `initials` directly (Chakra's default
  // initials logic doesn't handle hex addresses). The sx override paints the
  // gradient onto the wrapper while leaving the inner initials layer transparent.
  const avatarEl = showAvatar ? (
    <Avatar
      size={size}
      name={initials}
      src={avatarSrc || undefined}
      getInitials={(name) => name}
      sx={{
        background: avatarBg,
        '& > div': { background: 'transparent' },
      }}
      color="white"
    />
  ) : null;

  const nameEl = showName && displayName ? (
    <Text
      as="span"
      color={nameColor}
      fontSize={nameFontSize}
      fontWeight={nameFontWeight}
      isTruncated={isTruncated}
      maxW={maxNameW}
    >
      {displayName}
    </Text>
  ) : null;

  const content = (
    <HStack spacing={spacing} align="center" minW={0}>
      {avatarEl}
      {nameEl}
    </HStack>
  );

  // Hover tooltip identifies the user by username — never the raw wallet
  // address (so a bare avatar with showName={false} still resolves to a
  // human-readable name on hover). When there's no username there's nothing
  // human-readable to surface, so we skip the tooltip rather than fall back to
  // the address.
  const wrapped = username ? (
    <Tooltip label={username} hasArrow openDelay={400}>
      <Box display="inline-flex" minW={0}>
        {content}
      </Box>
    </Tooltip>
  ) : (
    <Box display="inline-flex" minW={0}>
      {content}
    </Box>
  );

  if (link && username) {
    return (
      <Link href={`/u?username=${encodeURIComponent(username)}`} passHref legacyBehavior>
        <Box
          as="a"
          display="inline-flex"
          minW={0}
          onClick={(e) => e.stopPropagation()}
          _hover={{ textDecoration: 'none', filter: 'brightness(1.1)' }}
          transition="filter 0.15s"
        >
          {wrapped}
        </Box>
      </Link>
    );
  }

  return wrapped;
}

export default UserIdentity;
