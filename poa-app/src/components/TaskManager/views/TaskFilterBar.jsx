import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Text,
  useBreakpointValue,
} from '@chakra-ui/react';
import { SearchIcon, SmallCloseIcon } from '@chakra-ui/icons';
import { FILTER_CHIPS, useTaskFilters } from './useTaskFilters';

// Dark-glass pill filter bar shared by the Board, List, and Gantt. Sits directly
// under the purple header. Search + toggleable quick-filter chips + a live
// "N of M tasks" count whenever anything is active. Mirrors ListControls'
// existing dark-glass styling — deliberately NOT a new visual language.
//
// On mobile the search input collapses behind an icon and the chips row scrolls
// horizontally so the bar never crowds the board.

const chipStyle = (active) => ({
  size: 'xs',
  variant: 'outline',
  borderRadius: 'full',
  fontSize: '0.7rem',
  fontWeight: '600',
  flexShrink: 0,
  px: 3,
  bg: active ? 'purple.400' : 'whiteAlpha.100',
  color: active ? 'white' : 'whiteAlpha.800',
  borderColor: active ? 'purple.300' : 'whiteAlpha.200',
  _hover: { bg: active ? 'purple.500' : 'whiteAlpha.200', borderColor: 'whiteAlpha.400' },
  _active: { bg: active ? 'purple.600' : 'whiteAlpha.300' },
});

const TaskFilterBar = ({ tasks = [] }) => {
  const {
    q,
    setQ,
    activeFilters,
    toggleFilter,
    predicate,
    clearAll,
    isFiltering,
    canReviewAnywhere,
  } = useTaskFilters();
  const isMobile = useBreakpointValue({ base: true, md: false });
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const chips = useMemo(
    () => FILTER_CHIPS.filter((c) => !c.reviewGated || canReviewAnywhere),
    [canReviewAnywhere],
  );

  const { matched, total } = useMemo(() => {
    const list = Array.isArray(tasks) ? tasks : [];
    if (!isFiltering) return { matched: list.length, total: list.length };
    let m = 0;
    for (const t of list) if (predicate(t, t.columnId)) m += 1;
    return { matched: m, total: list.length };
  }, [tasks, predicate, isFiltering]);

  const searchInput = (
    <InputGroup size="sm" maxW={{ base: '100%', md: '260px' }}>
      <InputLeftElement pointerEvents="none" h="100%">
        <SearchIcon color="whiteAlpha.500" boxSize={3} />
      </InputLeftElement>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search tasks"
        aria-label="Search tasks"
        bg="whiteAlpha.100"
        color="white"
        border="1px solid"
        borderColor="whiteAlpha.200"
        borderRadius="full"
        _placeholder={{ color: 'whiteAlpha.500' }}
        _hover={{ borderColor: 'whiteAlpha.300' }}
        _focus={{ borderColor: 'purple.300', boxShadow: 'none' }}
      />
      {q && (
        <InputRightElement h="100%">
          <IconButton
            aria-label="Clear search"
            icon={<SmallCloseIcon boxSize={3} />}
            size="xs"
            variant="ghost"
            color="whiteAlpha.700"
            _hover={{ bg: 'whiteAlpha.200' }}
            onClick={() => setQ('')}
          />
        </InputRightElement>
      )}
    </InputGroup>
  );

  const chipRow = chips.map((c) => (
    <Button
      key={c.id}
      {...chipStyle(activeFilters.has(c.id))}
      aria-pressed={activeFilters.has(c.id)}
      onClick={() => toggleFilter(c.id)}
    >
      {c.label}
    </Button>
  ));

  return (
    <Box
      px={{ base: 2, md: 3 }}
      pt={{ base: 2, md: 2 }}
      pb={{ base: 1, md: 0 }}
      w="100%"
    >
      <Flex
        align="center"
        gap={2}
        bg="rgba(0, 0, 0, 0.55)"
        border="1px solid"
        borderColor="whiteAlpha.150"
        borderRadius="full"
        px={{ base: 2, md: 3 }}
        py={1.5}
        w="100%"
        minW={0}
      >
        {isMobile ? (
          <>
            <IconButton
              aria-label={mobileSearchOpen ? 'Hide search' : 'Search tasks'}
              icon={<SearchIcon boxSize={3} />}
              size="sm"
              variant={q ? 'solid' : 'ghost'}
              colorScheme={q ? 'purple' : undefined}
              color={q ? 'white' : 'whiteAlpha.700'}
              borderRadius="full"
              flexShrink={0}
              onClick={() => setMobileSearchOpen((v) => !v)}
            />
            {mobileSearchOpen ? (
              searchInput
            ) : (
              <HStack
                spacing={2}
                overflowX="auto"
                flex="1"
                minW={0}
                py={0.5}
                sx={{
                  '&::-webkit-scrollbar': { display: 'none' },
                  scrollbarWidth: 'none',
                }}
              >
                {chipRow}
              </HStack>
            )}
          </>
        ) : (
          <>
            {searchInput}
            <HStack spacing={2} flex="1" minW={0} overflowX="auto" py={0.5}>
              {chipRow}
            </HStack>
          </>
        )}

        {isFiltering && (
          <HStack spacing={2} flexShrink={0} pl={1}>
            <Text fontSize="xs" color="whiteAlpha.700" whiteSpace="nowrap" display={{ base: 'none', sm: 'block' }}>
              {matched} of {total} tasks
            </Text>
            <Button
              size="xs"
              variant="ghost"
              color="whiteAlpha.700"
              _hover={{ bg: 'whiteAlpha.200', color: 'white' }}
              onClick={clearAll}
              leftIcon={<SmallCloseIcon boxSize={2.5} />}
              flexShrink={0}
            >
              Clear
            </Button>
          </HStack>
        )}
      </Flex>
    </Box>
  );
};

// Distinct empty state shown by every view when a search/filter is active but
// nothing matches — replaces the emoji "motivational" empty states in that case.
export const FilteredEmptyState = ({ onClear, compact = false }) => (
  <Flex
    direction="column"
    align="center"
    justify="center"
    textAlign="center"
    gap={3}
    py={compact ? 6 : 10}
    px={4}
  >
    <Text fontSize={compact ? 'sm' : 'md'} color="whiteAlpha.800" fontWeight="600">
      No tasks match your filters
    </Text>
    {onClear && (
      <Button size="sm" colorScheme="purple" variant="outline" onClick={onClear}>
        Clear filters
      </Button>
    )}
  </Flex>
);

export default TaskFilterBar;
