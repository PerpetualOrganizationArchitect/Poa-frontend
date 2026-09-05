import React, { useMemo } from 'react';
import { Box, Container, Heading, Text, VStack, HStack, Badge, Link, Table, Thead, Tbody, Tr, Th, Td } from '@chakra-ui/react';
import { ExternalLinkIcon } from '@chakra-ui/icons';
import { motion } from 'framer-motion';

const MotionBox = motion.create(Box);

const BeaconSection = ({ chains }) => {
  // Combine all beacon upgrades from all chains, sorted newest first
  const allUpgrades = useMemo(() => {
    const upgrades = [];
    Object.values(chains).forEach(chain => {
      (chain.beaconUpgrades || []).forEach(u => {
        upgrades.push({
          ...u,
          chainName: chain.name,
          chainId: chain.chainId,
          explorer: chain.blockExplorer,
        });
      });
    });
    return upgrades.sort((a, b) => parseInt(b.upgradedAt || b.blockTimestamp || 0) - parseInt(a.upgradedAt || a.blockTimestamp || 0));
  }, [chains]);

  return (
    <Box as="section" py={{ base: 12, md: 16 }} bg="warmGray.50">
      <Container maxW="6xl">
        <MotionBox initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <Text fontSize="sm" fontWeight="600" color="warmGray.400" letterSpacing="0.08em" textTransform="uppercase" mb={2}>
            Upgrades
          </Text>
          <Heading fontSize={{ base: 'xl', md: '2xl' }} fontWeight="700" color="warmGray.800" mb={2}>
            Beacon Upgrade History
          </Heading>
          <Text fontSize="sm" color="warmGray.500" mb={6}>
            All contract implementations are upgraded via beacon proxy pattern. Upgrades propagate cross-chain via Hyperlane.
          </Text>

          {allUpgrades.length === 0 ? (
            <Box bg="white" border="1px solid" borderColor="warmGray.100" borderRadius="xl" p={8} textAlign="center">
              <Text color="warmGray.400">No upgrade history indexed yet</Text>
            </Box>
          ) : (
            <Box bg="white" border="1px solid" borderColor="warmGray.100" borderRadius="xl" overflow="hidden">
              <Box overflowX="auto">
                <Table size="sm" variant="simple">
                  <Thead bg="warmGray.50">
                    <Tr>
                      <Th color="warmGray.500" fontSize="2xs">Date</Th>
                      <Th color="warmGray.500" fontSize="2xs">Chain</Th>
                      <Th color="warmGray.500" fontSize="2xs">Version</Th>
                      <Th color="warmGray.500" fontSize="2xs">Implementation</Th>
                      <Th color="warmGray.500" fontSize="2xs">Tx</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {allUpgrades.slice(0, 30).map((u, i) => (
                      <Tr key={u.id || i} _hover={{ bg: 'warmGray.50' }}>
                        <Td fontSize="xs" color="warmGray.600">
                          {new Date(parseInt(u.upgradedAt || u.blockTimestamp) * 1000).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </Td>
                        <Td>
                          <Badge fontSize="2xs" bg="amethyst.50" color="amethyst.600">{u.chainName}</Badge>
                        </Td>
                        <Td>
                          {u.version && <Badge fontSize="2xs" bg="warmGray.100" color="warmGray.600">{u.version}</Badge>}
                        </Td>
                        <Td fontSize="xs" fontFamily="mono" color="warmGray.600">
                          {(u.newImplementation || u.implementation) ? `${(u.newImplementation || u.implementation).slice(0, 6)}...${(u.newImplementation || u.implementation).slice(-4)}` : '—'}
                        </Td>
                        <Td>
                          {u.transactionHash && (
                            <Link href={`${u.explorer}/tx/${u.transactionHash}`} isExternal fontSize="xs" color="amethyst.500">
                              <ExternalLinkIcon boxSize={3} />
                            </Link>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </Box>
          )}
        </MotionBox>
      </Container>
    </Box>
  );
};

export default BeaconSection;
