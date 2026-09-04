import { HStack, Select } from '@chakra-ui/react';

export const SORT_OPTIONS = [
  { id: 'created_desc', label: 'Newest first' },
  { id: 'created_asc', label: 'Oldest first' },
  { id: 'difficulty_desc', label: 'Hardest first' },
  { id: 'payout_desc', label: 'Highest payout' },
  { id: 'hours_desc', label: 'Most hours' },
  { id: 'due_asc', label: 'Due soonest' },
  { id: 'status', label: 'Status order' },
];

export const GROUP_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'status', label: 'Status' },
  { id: 'difficulty', label: 'Difficulty' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'project', label: 'Project' },
];

const selectSx = {
  '> option': { background: '#15171d', color: 'white' },
};

const ListControls = ({ sortId, onSortChange, groupId, onGroupChange }) => (
  <HStack
    spacing={2}
    align="center"
    flex={{ base: '1', lg: 'initial' }}
    w={{ base: '100%', lg: 'auto' }}
    minW={0}
  >
    <Select
      size="sm"
      value={sortId}
      onChange={(e) => onSortChange(e.target.value)}
      bg="whiteAlpha.100"
      color="whiteAlpha.900"
      border="1px solid"
      borderColor="whiteAlpha.200"
      borderRadius="md"
      _hover={{ borderColor: 'whiteAlpha.300', bg: 'rgba(255,255,255,0.12)' }}
      _focusVisible={{ borderColor: 'purple.300', boxShadow: '0 0 0 1px var(--chakra-colors-purple-300)' }}
      sx={selectSx}
      w={{ base: '50%', lg: '164px' }}
      minW={0}
      aria-label="Sort tasks"
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.id} value={o.id}>
          {`Sort: ${o.label}`}
        </option>
      ))}
    </Select>

    <Select
      size="sm"
      value={groupId}
      onChange={(e) => onGroupChange(e.target.value)}
      bg="whiteAlpha.100"
      color="whiteAlpha.900"
      border="1px solid"
      borderColor="whiteAlpha.200"
      borderRadius="md"
      _hover={{ borderColor: 'whiteAlpha.300', bg: 'rgba(255,255,255,0.12)' }}
      _focusVisible={{ borderColor: 'purple.300', boxShadow: '0 0 0 1px var(--chakra-colors-purple-300)' }}
      sx={selectSx}
      w={{ base: '50%', lg: '154px' }}
      minW={0}
      aria-label="Group tasks"
    >
      {GROUP_OPTIONS.map((o) => (
        <option key={o.id} value={o.id}>
          {`Group: ${o.label}`}
        </option>
      ))}
    </Select>
  </HStack>
);

export default ListControls;
