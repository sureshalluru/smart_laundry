import { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Switch,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  VStack,
  Wrap,
} from '@chakra-ui/react';
import { useCounterStore } from '../store/counterStore';

export interface SettingsScreenProps {
  onDone?: () => void;
}

/**
 * Configure the Jetson URL and EC2 URL independently (Req 2.5, 11.4), manage
 * the known-category list (Req 12.4), and toggle audio. Values persist via the
 * store's setters.
 */
export default function SettingsScreen({ onDone }: SettingsScreenProps) {
  const settings = useCounterStore((s) => s.settings);
  const setJetsonUrl = useCounterStore((s) => s.setJetsonUrl);
  const setEc2Url = useCounterStore((s) => s.setEc2Url);
  const setKnownCategories = useCounterStore((s) => s.setKnownCategories);
  const toggleMute = useCounterStore((s) => s.toggleMute);

  const [newCategory, setNewCategory] = useState('');

  const addCategory = () => {
    const value = newCategory.trim();
    if (value === '' || settings.knownCategories.includes(value)) return;
    setKnownCategories([...settings.knownCategories, value]);
    setNewCategory('');
  };

  const removeCategory = (category: string) => {
    setKnownCategories(settings.knownCategories.filter((c) => c !== category));
  };

  return (
    <Box maxW="720px" mx="auto" p={8}>
      <VStack align="stretch" spacing={8}>
        <Heading size="xl">Settings</Heading>

        <FormControl>
          <FormLabel fontSize="xl">Camera (Jetson) URL</FormLabel>
          <Input
            size="lg"
            placeholder="http://192.168.1.100:8000"
            value={settings.jetsonUrl}
            onChange={(e) => setJetsonUrl(e.target.value)}
            aria-label="Jetson URL"
          />
        </FormControl>

        <FormControl>
          <FormLabel fontSize="xl">Cloud (EC2) URL</FormLabel>
          <Input
            size="lg"
            placeholder="http://54.209.208.218:8000"
            value={settings.ec2Url}
            onChange={(e) => setEc2Url(e.target.value)}
            aria-label="EC2 URL"
          />
        </FormControl>

        <FormControl>
          <FormLabel fontSize="xl">Categories</FormLabel>
          <HStack>
            <Input
              size="lg"
              placeholder="e.g. shirts"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCategory();
              }}
              aria-label="New category"
            />
            <Button onClick={addCategory}>Add</Button>
          </HStack>
          <Wrap mt={4} spacing={3}>
            {settings.knownCategories.map((category) => (
              <Tag key={category} size="lg" colorScheme="green" borderRadius="full">
                <TagLabel>{category}</TagLabel>
                <TagCloseButton
                  aria-label={`Remove ${category}`}
                  onClick={() => removeCategory(category)}
                />
              </Tag>
            ))}
            {settings.knownCategories.length === 0 && (
              <Text color="gray.400">No categories yet — they also appear automatically as items are detected.</Text>
            )}
          </Wrap>
        </FormControl>

        <FormControl display="flex" alignItems="center" justifyContent="space-between">
          <FormLabel fontSize="xl" mb={0}>
            Mute audio feedback
          </FormLabel>
          <Switch
            size="lg"
            isChecked={settings.audioMuted}
            onChange={toggleMute}
            aria-label="Mute audio"
          />
        </FormControl>

        {onDone && (
          <Button colorScheme="green" size="lg" onClick={onDone}>
            Done
          </Button>
        )}
      </VStack>
    </Box>
  );
}
