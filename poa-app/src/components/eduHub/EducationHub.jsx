import React, { useEffect, useState } from 'react';
import {
  Box, Button, Center, Flex, Heading, HStack, Icon, Progress, SimpleGrid,
  Tab, TabList, TabPanel, TabPanels, Tabs, Text, useDisclosure,
} from '@chakra-ui/react';
import { FiArrowUpRight, FiBookOpen, FiCheck, FiPlus } from 'react-icons/fi';
import { useRouter } from 'next/router';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import CommunityLoadingState from '@/components/shared/CommunityLoadingState';
import { educationCardStyle } from '@/components/eduHub/educationStyles';
import { useOrgGate } from '@/components/shared/OrgDeadEnd';
import { usePOContext } from '@/context/POContext';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';
import { useUserContext } from '@/context/UserContext';
import { useOrgTheme } from '@/hooks';
import { useOrgName } from '@/hooks/useOrgName';
import { useEducationCreateGate } from '@/hooks/useEducationCreateGate';
import { useTour } from '@/features/tour';
import CreateModuleModal from '@/components/eduHub/CreateModuleModal';
import QuizModal from '@/components/eduHub/QuizModal';

const eyebrow = {
  fontSize: 'xs',
  fontWeight: 'medium',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

function ModuleCard({ module, number, isCompleted, tokenLabel }) {
  const resourceHref = module.link || (module.ipfsHash ? `https://ipfs.io/ipfs/${module.ipfsHash}` : null);

  return (
    <Flex as="article" {...educationCardStyle} direction="column" p={{ base: 5, md: 6 }} minW={0} transition="border-color 150ms ease" _hover={{ borderColor: 'whiteAlpha.400' }}>
      <Flex justify="space-between" align="center" gap={3} mb={6}>
        <Text {...eyebrow} color="whiteAlpha.700">Module {String(number).padStart(2, '0')}</Text>
        {isCompleted ? (
          <HStack spacing={1.5} color="green.200" fontSize="xs">
            <Icon as={FiCheck} boxSize={3.5} />
            <Text>Completed</Text>
          </HStack>
        ) : <Icon as={FiBookOpen} boxSize={4} color="whiteAlpha.600" />}
      </Flex>
      <Heading as="h3" fontSize="xl" fontWeight="semibold" lineHeight="1.35" letterSpacing="-0.02em" overflowWrap="anywhere">{module.name}</Heading>
      <Text color="whiteAlpha.800" fontSize="sm" lineHeight="1.75" mt={3} mb={7} overflowWrap="anywhere">
        {module.isIndexing
          ? 'This module is getting ready. Its learning material will be available shortly.'
          : module.description}
      </Text>
      <Box mt="auto">
        <Flex align="baseline" justify="space-between" gap={3} pb={4} mb={4} borderBottom="1px solid" borderColor="whiteAlpha.200">
          <Text fontSize="xs" color="whiteAlpha.700">Module reward</Text>
          <Text fontSize="lg" fontWeight="medium" textAlign="right" overflowWrap="anywhere">
            {module.payout}{' '}
            <Text as="span" fontSize="xs" color="whiteAlpha.800" fontWeight="normal">{tokenLabel}</Text>
          </Text>
        </Flex>
        {module.isIndexing ? (
          <Button size="sm" h="40px" variant="outline" color="whiteAlpha.800" borderColor="whiteAlpha.300" isDisabled w="full">Preparing module</Button>
        ) : (
          <Flex align="center" justify="space-between" gap={3} wrap="wrap">
            <Button
              as={resourceHref ? 'a' : 'button'}
              href={resourceHref || undefined}
              target={resourceHref ? '_blank' : undefined}
              rel={resourceHref ? 'noopener noreferrer' : undefined}
              isDisabled={!resourceHref}
              aria-label={`${isCompleted ? 'Revisit' : 'Read'} ${module.name} (opens in a new tab)`}
              variant="ghost" size="sm" color="whiteAlpha.900" px={2} ml={-2}
              rightIcon={<FiArrowUpRight />}
              _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
            >
              {isCompleted ? 'Read again' : 'Start reading'}
            </Button>
            <QuizModal module={module} isCompleted={isCompleted} />
          </Flex>
        )}
      </Box>
    </Flex>
  );
}

export default function EducationHub() {
  const { poContextLoading, orgStatus, educationModules, educationHubEnabled, tokenLabel = DEFAULT_TOKEN_LABEL } = usePOContext();
  const { completedModules } = useUserContext();
  const { pageBackground, onBackground, onBackgroundMuted } = useOrgTheme();
  const { canCreateModule } = useEducationCreateGate();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isActive: isTourActive } = useTour();
  const router = useRouter();
  const userDAO = useOrgName();
  const orgGate = useOrgGate();
  const [filterIndex, setFilterIndex] = useState(0);

  useEffect(() => {
    if (orgStatus !== 'ready') return;
    if (!poContextLoading && !educationHubEnabled && userDAO && !isTourActive) {
      router.replace(`/dashboard/?org=${encodeURIComponent(userDAO)}`);
    }
  }, [orgStatus, poContextLoading, educationHubEnabled, userDAO, isTourActive, router]);

  useEffect(() => setFilterIndex(0), [userDAO]);

  const completedIds = new Set((completedModules || []).map((module) => String(module.moduleId)));
  const modules = (educationModules || []).map((module, index) => ({
    module,
    number: index + 1,
    isCompleted: completedIds.has(String(module.moduleId)),
  }));
  const completedCount = modules.filter((module) => module.isCompleted).length;
  const totalCount = modules.length;
  const progress = totalCount ? (completedCount / totalCount) * 100 : 0;
  const sortedModules = [...modules].sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted));
  const filters = [
    { label: 'All modules', items: sortedModules },
    { label: 'To learn', items: modules.filter((module) => !module.isCompleted) },
    { label: 'Completed', items: modules.filter((module) => module.isCompleted) },
  ];

  if (orgGate) return orgGate;

  return (
    <Box minH="100vh" background={pageBackground()}>
      <Navbar />
      {poContextLoading ? (
        <Center minH="70vh"><CommunityLoadingState label="Loading your learning space…" /></Center>
      ) : (
        <Box as="main" maxW="1200px" mx="auto" px={{ base: 4, md: 8 }} pt={{ base: 6, md: 10 }} pb={{ base: 12, md: 20 }} data-tour="education-hub-content">
          <Flex {...educationCardStyle} direction={{ base: 'column', md: 'row' }} p={{ base: 6, md: 9 }} gap={{ base: 8, md: 10 }} align={{ md: 'center' }}>
            <Box flex={1} minW={0}>
              <HStack spacing={2} color="purple.200" mb={4}>
                <Icon as={FiBookOpen} boxSize={4} />
                <Text {...eyebrow}>Community learning</Text>
              </HStack>
              <Heading as="h1" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold" letterSpacing="-0.02em" lineHeight="1.15">Learn & Earn</Heading>
              <Text mt={4} color="whiteAlpha.800" fontSize={{ base: 'sm', md: 'md' }} lineHeight="1.7" maxW="440px">
                Get to know your community, one short module at a time.
                Read, take a quiz, and earn {tokenLabel} along the way.
              </Text>
            </Box>
            <Box w={{ base: 'full', md: '260px' }} flexShrink={0} borderLeftWidth={{ base: 0, md: '1px' }} borderTopWidth={{ base: '1px', md: 0 }} borderColor="whiteAlpha.300" pl={{ md: 8 }} pt={{ base: 6, md: 0 }}>
              <Text {...eyebrow} color="whiteAlpha.700" mb={4}>Your progress</Text>
              <Flex align="baseline" gap={2}>
                <Text fontSize="4xl" fontWeight="medium" lineHeight="1" letterSpacing="-0.04em" fontVariantNumeric="tabular-nums">{completedCount}</Text>
                <Text fontSize="sm" color="whiteAlpha.800">of {totalCount} completed</Text>
              </Flex>
              <Progress
                aria-label="Learning modules completed"
                aria-valuetext={`${completedCount} of ${totalCount} modules completed`}
                value={progress} mt={5} h="5px" borderRadius="full" bg="whiteAlpha.200"
                sx={{ '& > div': { bg: 'purple.300' } }}
              />
              <Text fontSize="xs" color="whiteAlpha.700" mt={3} lineHeight="1.6">
                {totalCount === 0 ? 'Your next chapter starts here.' : completedCount === totalCount ? 'You’re all caught up. Nicely done.' : 'A little more understanding with every module.'}
              </Text>
            </Box>
          </Flex>
          <Flex align="center" justify="space-between" gap={4} mt={{ base: 8, md: 10 }} mb={5}>
            <Box>
              <Heading as="h2" color={onBackground} fontSize="xl" fontWeight="semibold" letterSpacing="-0.02em">The learning library</Heading>
              <Text fontSize="sm" color={onBackgroundMuted} mt={1}>Shared knowledge. At your own pace.</Text>
            </Box>
            {canCreateModule && (
              <Button leftIcon={<FiPlus />} onClick={onOpen} colorScheme="purple" size="sm" flexShrink={0} h="40px" px={{ base: 3, md: 4 }}>Add module</Button>
            )}
          </Flex>
          {totalCount === 0 ? (
            <Box {...educationCardStyle} textAlign="center" px={6} py={{ base: 12, md: 16 }}>
              <Center w={12} h={12} mx="auto" mb={5} border="1px solid" borderColor="whiteAlpha.300" borderRadius="xl" color="purple.200"><Icon as={FiBookOpen} boxSize={5} /></Center>
              <Heading as="h3" fontSize="xl" fontWeight="medium" mb={3}>Room for something worth sharing</Heading>
              <Text color="whiteAlpha.800" fontSize="sm" lineHeight="1.8" maxW="370px" mx="auto">
                {canCreateModule ? 'Share a useful resource and a short question. Give your community a place to begin.' : 'Your community’s learning modules will appear here. Check back for something new to explore.'}
              </Text>
              {canCreateModule && (
                <Button mt={6} onClick={onOpen} size="sm" variant="outline" borderColor="whiteAlpha.400" color="purple.200" _hover={{ bg: 'whiteAlpha.100' }}>Create the first module</Button>
              )}
            </Box>
          ) : (
            <Tabs index={filterIndex} onChange={setFilterIndex} variant="unstyled" isLazy>
              <TabList gap={{ base: 1, md: 2 }} mb={5} aria-label="Filter learning modules" flexWrap="wrap">
                {filters.map((filter) => (
                  <Tab key={filter.label} fontSize="sm" px={{ base: 3, md: 4 }} py={2} borderRadius="full" color={onBackgroundMuted} border="1px solid transparent" _selected={{ bg: 'rgba(0,0,0,0.82)', color: 'white', borderColor: 'whiteAlpha.300' }} _hover={{ textDecoration: 'underline', textUnderlineOffset: '4px' }}>
                    {filter.label}<Text as="span" ml={2} fontSize="xs" opacity={0.8}>{filter.items.length}</Text>
                  </Tab>
                ))}
              </TabList>
              <TabPanels>
                {filters.map((filter) => (
                  <TabPanel key={filter.label} p={0}>
                    {filter.items.length ? (
                      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                        {filter.items.map(({ module, number, isCompleted }) => <ModuleCard key={module.id} module={module} number={number} isCompleted={isCompleted} tokenLabel={tokenLabel} />)}
                      </SimpleGrid>
                    ) : (
                      <Box {...educationCardStyle} textAlign="center" px={6} py={12}>
                        <Heading as="h3" fontSize="lg" fontWeight="medium" mb={2}>{filter.label === 'Completed' ? 'Your learning adds up' : 'You’re all caught up'}</Heading>
                        <Text fontSize="sm" color="whiteAlpha.800">{filter.label === 'Completed' ? 'Complete a module and you’ll find it here.' : 'You’ve completed every module. Revisit one whenever you like.'}</Text>
                        <Button size="sm" variant="link" color="purple.200" mt={5} onClick={() => setFilterIndex(0)}>Browse all modules</Button>
                      </Box>
                    )}
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          )}
          {canCreateModule && <CreateModuleModal isOpen={isOpen} onClose={onClose} />}
        </Box>
      )}
    </Box>
  );
}
