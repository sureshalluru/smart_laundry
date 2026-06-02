import React from 'react';
import {
  Box,
  Input,
  List,
  ListItem,
  Spinner,
  Text,
} from '@chakra-ui/react';
import usePlacesAutocomplete from 'use-places-autocomplete';

const LocationAutocompleteInput = ({ value, onChange, placeholder }) => {
  const {
    ready,
    value: internalValue,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete();

  const handleInput = (e) => {
    setValue(e.target.value);
    onChange(e.target.value);
  };

  const handleSelect = (description) => {
    setValue(description, false);
    clearSuggestions();
    onChange(description);
  };

  return (
    <Box position="relative" width="100%">
      <Input
        value={value}
        onChange={handleInput}
        disabled={!ready}
        placeholder={placeholder}
        bg="white"
        border="1px solid #ccc"
        borderRadius="md"
        p={2}
      />
      {status === 'OK' && (
        <Box
          position="absolute"
          top="100%"
          left={0}
          right={0}
          bg="white"
          border="1px solid #ccc"
          borderRadius="md"
          mt={1}
          zIndex={10}
          maxH="200px"
          overflowY="auto"
          boxShadow="md"
        >
          <List spacing={0}>
            {data.map(({ place_id, description }) => (
              <ListItem
                key={place_id}
                px={3}
                py={2}
                _hover={{ bg: 'gray.100', cursor: 'pointer' }}
                onClick={() => handleSelect(description)}
              >
                {description}
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
};

export default LocationAutocompleteInput;
