import { useState, useCallback } from 'react';
import {
  Box,
  Center,
  Heading,
  Text,
  VStack,
  HStack,
  IconButton,
  Spinner,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiDelete } from 'react-icons/fi';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useEmployeeAuth } from '../Context/EmployeeAuthContext';

export default function PinEntryPage() {
  const { laundryId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useEmployeeAuth();

  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const returnUrl = searchParams.get('returnUrl') || `/${laundryId}/admin/active-orders`;

  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const dotFilled = useColorModeValue('blue.500', 'blue.300');
  const dotEmpty = useColorModeValue('gray.300', 'gray.600');
  const btnBg = useColorModeValue('white', 'gray.700');
  const btnHover = useColorModeValue('gray.100', 'gray.600');

  const handleDigit = useCallback(async (digit) => {
    if (isLoading) return;

    setError(null);
    const newPin = pin + digit;

    if (newPin.length > 4) return;

    setPin(newPin);

    // Auto-submit when 4th digit is entered
    if (newPin.length === 4) {
      setIsLoading(true);
      try {
        await login(laundryId, newPin);
        navigate(returnUrl, { replace: true });
      } catch (err) {
        setError(err.message || 'Invalid PIN');
        setPin('');
      } finally {
        setIsLoading(false);
      }
    }
  }, [pin, isLoading, login, laundryId, navigate, returnUrl]);

  const handleBackspace = useCallback(() => {
    if (isLoading) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }, [isLoading]);

  // PIN indicator dots
  const renderDots = () => (
    <HStack spacing={4} justify="center">
      {[0, 1, 2, 3].map((i) => (
        <Box
          key={i}
          w="16px"
          h="16px"
          borderRadius="full"
          bg={i < pin.length ? dotFilled : 'transparent'}
          borderWidth="2px"
          borderColor={i < pin.length ? dotFilled : dotEmpty}
          transition="all 0.15s"
        />
      ))}
    </HStack>
  );

  // Keypad button component
  const KeypadButton = ({ digit, onClick, children, ...props }) => (
    <Box
      as="button"
      onClick={onClick}
      disabled={isLoading}
      w="72px"
      h="72px"
      minH="44px"
      borderRadius="full"
      bg={btnBg}
      boxShadow="sm"
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontSize="2xl"
      fontWeight="semibold"
      _hover={{ bg: btnHover }}
      _active={{ transform: 'scale(0.95)', bg: btnHover }}
      _disabled={{ opacity: 0.5, cursor: 'not-allowed' }}
      transition="all 0.1s"
      aria-label={digit !== undefined ? `Digit ${digit}` : undefined}
      {...props}
    >
      {children !== undefined ? children : digit}
    </Box>
  );

  return (
    <Center minH="100vh" bg={bgColor} p={4}>
      <VStack spacing={8} w="full" maxW="320px">
        {/* Header */}
        <VStack spacing={2}>
          <Heading as="h1" size="lg" color="blue.600" textAlign="center">
            Enter PIN
          </Heading>
          <Text fontSize="sm" color="gray.500" textAlign="center">
            Enter your 4-digit PIN to continue
          </Text>
        </VStack>

        {/* PIN dots or spinner */}
        <Box h="40px" display="flex" alignItems="center" justifyContent="center">
          {isLoading ? (
            <Spinner size="lg" color="blue.500" thickness="3px" />
          ) : (
            renderDots()
          )}
        </Box>

        {/* Error message */}
        {error && (
          <Text color="red.500" fontSize="sm" textAlign="center" fontWeight="medium">
            {error}
          </Text>
        )}

        {/* Numeric keypad */}
        <VStack spacing={3}>
          {/* Row 1: 1 2 3 */}
          <HStack spacing={4}>
            <KeypadButton digit="1" onClick={() => handleDigit('1')} />
            <KeypadButton digit="2" onClick={() => handleDigit('2')} />
            <KeypadButton digit="3" onClick={() => handleDigit('3')} />
          </HStack>

          {/* Row 2: 4 5 6 */}
          <HStack spacing={4}>
            <KeypadButton digit="4" onClick={() => handleDigit('4')} />
            <KeypadButton digit="5" onClick={() => handleDigit('5')} />
            <KeypadButton digit="6" onClick={() => handleDigit('6')} />
          </HStack>

          {/* Row 3: 7 8 9 */}
          <HStack spacing={4}>
            <KeypadButton digit="7" onClick={() => handleDigit('7')} />
            <KeypadButton digit="8" onClick={() => handleDigit('8')} />
            <KeypadButton digit="9" onClick={() => handleDigit('9')} />
          </HStack>

          {/* Row 4: empty 0 backspace */}
          <HStack spacing={4}>
            {/* Empty placeholder */}
            <Box w="72px" h="72px" />

            <KeypadButton digit="0" onClick={() => handleDigit('0')} />

            {/* Backspace */}
            <IconButton
              aria-label="Backspace"
              icon={<FiDelete size={24} />}
              onClick={handleBackspace}
              isDisabled={isLoading || pin.length === 0}
              w="72px"
              h="72px"
              minH="44px"
              borderRadius="full"
              bg={btnBg}
              boxShadow="sm"
              _hover={{ bg: btnHover }}
              _active={{ transform: 'scale(0.95)', bg: btnHover }}
              variant="ghost"
            />
          </HStack>
        </VStack>
      </VStack>
    </Center>
  );
}
