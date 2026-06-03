import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
    colors: {
        brand: {
            50: '#EBF8FF',
            100: '#BEE3F8',
            200: '#90CDF4',
            300: '#63B3ED',
            400: '#4299E1',
            500: '#3182CE',
            600: '#2B6CB0',
            700: '#2C5282',
            800: '#2A4365',
            900: '#1A365D',
        },
    },
    fonts: {
        heading: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
        body: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    },
    styles: {
        global: {
            body: {
                bg: '#F7FAFC',
                color: 'gray.800',
            },
        },
    },
    components: {
        Button: {
            baseStyle: {
                borderRadius: 'xl',
                fontWeight: '600',
            },
            variants: {
                solid: (props) => ({
                    ...(props.colorScheme === 'blue' && {
                        bg: 'linear-gradient(135deg, #4299E1 0%, #63B3ED 100%)',
                        color: 'white',
                        _hover: {
                            transform: 'translateY(-1px)',
                            boxShadow: 'lg',
                            _disabled: { transform: 'none' },
                        },
                        _active: { transform: 'translateY(0)' },
                    }),
                    ...(props.colorScheme === 'teal' && {
                        bg: 'linear-gradient(135deg, #4299E1 0%, #63B3ED 100%)',
                        color: 'white',
                        _hover: {
                            transform: 'translateY(-1px)',
                            boxShadow: 'lg',
                            _disabled: { transform: 'none' },
                        },
                        _active: { transform: 'translateY(0)' },
                    }),
                }),
            },
        },
        Input: {
            defaultProps: {
                focusBorderColor: 'blue.400',
            },
            variants: {
                outline: {
                    field: {
                        borderRadius: 'lg',
                        _focus: {
                            boxShadow: '0 0 0 1px #63b3ed',
                        },
                    },
                },
            },
        },
        Select: {
            defaultProps: {
                focusBorderColor: 'blue.400',
            },
        },
        Card: {
            baseStyle: {
                container: {
                    borderRadius: 'xl',
                    boxShadow: 'sm',
                },
            },
        },
        FormLabel: {
            baseStyle: {
                fontSize: 'sm',
                fontWeight: '500',
                color: 'gray.600',
                mb: 1,
            },
        },
    },
});

export default theme;
