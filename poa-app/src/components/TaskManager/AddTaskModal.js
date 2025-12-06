import React, { useState } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  ModalFooter,
  VStack,
  HStack,
  Select,
  Textarea,
  useToast,
  InputGroup,
  InputRightAddon,
  Switch,
  Text,
  Box,
} from '@chakra-ui/react';
import { BOUNTY_TOKEN_OPTIONS, BOUNTY_TOKENS } from '../../util/tokens';


const AddTaskModal = ({ isOpen, onClose, onAddTask }) => {



  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('easy');
  const [estHours, setEstHours] = useState(.5);
  const [hasBounty, setHasBounty] = useState(false);
  const [bountyToken, setBountyToken] = useState(BOUNTY_TOKENS.BREAD.address);
  const [bountyAmount, setBountyAmount] = useState('');

  const [loading, setLoading] = useState(false)

  const toast = useToast();

  const handleSubmit = () => {
    const handleAddTask = async () => {
      setLoading(true);
      await onAddTask({
        name,
        description,
        difficulty,
        estHours,
        bountyToken: hasBounty ? bountyToken : BOUNTY_TOKENS.NONE.address,
        bountyAmount: hasBounty ? bountyAmount : '0',
      });

      setLoading(false);
      setDescription('');
      setName('');
      setHasBounty(false);
      setBountyAmount('');
    };

    handleAddTask();
    setDifficulty('easy');
    setEstHours(.5);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Add Task</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl id="task-name">
              <FormLabel>Task Name</FormLabel>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormControl>
            <FormControl id="task-description">
              <FormLabel>Description</FormLabel>
              <Textarea
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormControl>
            <FormControl id="task-difficulty">
              <FormLabel>Difficulty</FormLabel>
              <Select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="veryHard">Very Hard</option>
              </Select>
            </FormControl>
            <FormControl id="task-estimated-hours">
              <FormLabel>Estimated Hours</FormLabel>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={estHours}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (isNaN(val)) {
                    setEstHours(0.5);
                  } else {
                    setEstHours(val);
                  }
                }}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (val <= 0.5) {
                    setEstHours(0.5);
                  } else {
                    setEstHours(Math.round(val * 2) / 2);
                  }
                }}
              />
            </FormControl>

            <FormControl id="task-bounty">
              <HStack justify="space-between">
                <FormLabel mb={0}>Add Token Bounty</FormLabel>
                <Switch
                  isChecked={hasBounty}
                  onChange={(e) => setHasBounty(e.target.checked)}
                  colorScheme="teal"
                />
              </HStack>
            </FormControl>

            {hasBounty && (
              <Box w="100%" p={3} bg="gray.50" borderRadius="md">
                <VStack spacing={3}>
                  <FormControl id="bounty-token">
                    <FormLabel fontSize="sm">Token</FormLabel>
                    <Select
                      value={bountyToken}
                      onChange={(e) => setBountyToken(e.target.value)}
                      size="sm"
                    >
                      {BOUNTY_TOKEN_OPTIONS.filter(t => !t.isDefault).map((token) => (
                        <option key={token.symbol} value={token.address}>
                          {token.symbol} - {token.name}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl id="bounty-amount">
                    <FormLabel fontSize="sm">Amount</FormLabel>
                    <InputGroup size="sm">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={bountyAmount}
                        onChange={(e) => setBountyAmount(e.target.value)}
                      />
                      <InputRightAddon>
                        {BOUNTY_TOKEN_OPTIONS.find(t => t.address === bountyToken)?.symbol || 'TOKEN'}
                      </InputRightAddon>
                    </InputGroup>
                  </FormControl>
                  <Text fontSize="xs" color="gray.500">
                    This bounty will be paid in addition to participation tokens
                  </Text>
                </VStack>
              </Box>
            )}

          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="blue" mr={3} onClick={handleSubmit}
          isLoading={loading}
          loadingText="Adding Task">
            Add Task
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default AddTaskModal;

