import React, { useRef, useCallback, useState } from 'react';
import {
  Box,
  Flex,
  IconButton,
  Collapse,
  useBreakpointValue,
  useDisclosure,
} from '@chakra-ui/react';
import { NavLink, useNavigate } from 'react-router-dom';
import { HamburgerIcon, CloseIcon } from '@chakra-ui/icons';

/**
 * ViewSwitcher
 *
 * Navigation control for the interactive product demo. Renders a horizontal
 * scrollable tab bar on desktop viewports and a collapsible hamburger menu
 * on mobile viewports.
 *
 * Props:
 * - views: Array<{ key: string, label: string, icon: ReactIcon, path: string }>
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
const ViewSwitcher = ({ views = [] }) => {
  const isMobile = useBreakpointValue({ base: true, md: false });
  const { isOpen, onToggle, onClose } = useDisclosure();
  const tabsRef = useRef([]);
  const navigate = useNavigate();
  const [focusedIndex, setFocusedIndex] = useState(0);

  const handleKeyDown = useCallback(
    (e, index) => {
      let nextIndex = index;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (index + 1) % views.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (index - 1 + views.length) % views.length;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate(views[index].path);
        if (isMobile) onClose();
        return;
      } else {
        return;
      }

      setFocusedIndex(nextIndex);
      if (tabsRef.current[nextIndex]) {
        tabsRef.current[nextIndex].focus();
      }
    },
    [views, navigate, isMobile, onClose]
  );

  const renderTab = (view, index) => {
    const IconComponent = view.icon;

    return (
      <Box
        key={view.key}
        as={NavLink}
        to={view.path}
        role="tab"
        aria-label={view.label}
        aria-selected={undefined} // NavLink active state handles this via className
        tabIndex={focusedIndex === index ? 0 : -1}
        ref={(el) => {
          tabsRef.current[index] = el;
        }}
        onKeyDown={(e) => handleKeyDown(e, index)}
        onClick={() => {
          setFocusedIndex(index);
          if (isMobile) onClose();
        }}
        display="flex"
        alignItems="center"
        gap={2}
        px={3}
        py={2}
        borderRadius="md"
        fontSize="sm"
        fontWeight="medium"
        whiteSpace="nowrap"
        textDecoration="none"
        transition="all 0.15s ease"
        _hover={{
          bg: 'blue.50',
          color: 'blue.600',
        }}
        sx={{
          '&.active': {
            bg: 'blue.50',
            color: 'blue.600',
            borderBottom: isMobile ? 'none' : '2px solid',
            borderBottomColor: 'blue.500',
            fontWeight: 'bold',
          },
          '&:not(.active)': {
            color: 'gray.600',
            borderBottom: isMobile ? 'none' : '2px solid transparent',
          },
        }}
      >
        {IconComponent && <IconComponent size={16} />}
        {view.label}
      </Box>
    );
  };

  // Mobile: collapsible menu
  if (isMobile) {
    return (
      <Box mb={2}>
        <Flex justify="flex-end" p={2}>
          <IconButton
            aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
            icon={isOpen ? <CloseIcon /> : <HamburgerIcon />}
            onClick={onToggle}
            variant="ghost"
            size="sm"
          />
        </Flex>
        <Collapse in={isOpen} animateOpacity>
          <Box
            role="tablist"
            aria-label="Demo view navigation"
            display="flex"
            flexDirection="column"
            gap={1}
            px={2}
            pb={3}
            borderBottomWidth="1px"
            borderBottomColor="gray.200"
          >
            {views.map((view, index) => renderTab(view, index))}
          </Box>
        </Collapse>
      </Box>
    );
  }

  // Desktop: horizontal scrollable tab bar
  return (
    <Box
      role="tablist"
      aria-label="Demo view navigation"
      overflowX="auto"
      overflowY="hidden"
      borderBottomWidth="1px"
      borderBottomColor="gray.200"
      mb={4}
      px={2}
      py={1}
      css={{
        '&::-webkit-scrollbar': {
          height: '4px',
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#CBD5E0',
          borderRadius: '4px',
        },
        scrollbarWidth: 'thin',
      }}
    >
      <Flex gap={1} minW="max-content">
        {views.map((view, index) => renderTab(view, index))}
      </Flex>
    </Box>
  );
};

export default ViewSwitcher;
