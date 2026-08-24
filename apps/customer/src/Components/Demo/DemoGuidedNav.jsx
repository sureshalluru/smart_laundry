import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HStack, Button, Text, Box } from '@chakra-ui/react';

/**
 * DemoGuidedNav
 *
 * A "← Previous | Step X of 10 | Next →" navigation bar that guides
 * visitors through the demo views sequentially. Sits below the active
 * view content so visitors can walk through each feature step-by-step.
 */
const DemoGuidedNav = ({ views }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const currentIndex = useMemo(() => {
    const pathSegment = location.pathname.split('/').pop();
    const idx = views.findIndex((v) => v.path === pathSegment);
    return idx >= 0 ? idx : 0;
  }, [location.pathname, views]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < views.length - 1;

  const goTo = (index) => {
    navigate(`/slb/demo/${views[index].path}`);
  };

  return (
    <Box
      borderTopWidth="1px"
      borderColor="gray.200"
      mt={6}
      pt={4}
      px={4}
    >
      <HStack justify="space-between" align="center">
        <Button
          size="sm"
          variant="ghost"
          colorScheme="blue"
          isDisabled={!hasPrev}
          onClick={() => goTo(currentIndex - 1)}
          aria-label={hasPrev ? `Previous: ${views[currentIndex - 1]?.label}` : 'No previous view'}
        >
          ← {hasPrev ? views[currentIndex - 1].label : 'Previous'}
        </Button>

        <Text fontSize="xs" color="gray.500" fontWeight="medium">
          {currentIndex + 1} of {views.length}
        </Text>

        <Button
          size="sm"
          variant="solid"
          colorScheme="blue"
          isDisabled={!hasNext}
          onClick={() => goTo(currentIndex + 1)}
          aria-label={hasNext ? `Next: ${views[currentIndex + 1]?.label}` : 'No next view'}
        >
          {hasNext ? views[currentIndex + 1].label : 'Done'} →
        </Button>
      </HStack>
    </Box>
  );
};

export default DemoGuidedNav;
