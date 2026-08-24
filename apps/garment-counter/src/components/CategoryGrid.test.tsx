import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '../theme';
import CategoryGrid from './CategoryGrid';
import type { CategoryTally } from '../types';

function talliesFrom(counts: Record<string, number>): Map<string, CategoryTally> {
  const map = new Map<string, CategoryTally>();
  for (const [category, count] of Object.entries(counts)) {
    map.set(category, { category, count, items: [] });
  }
  return map;
}

function renderGrid(
  tallies: Map<string, CategoryTally>,
  activeCategories: string[],
  beforeWashTallies?: Map<string, CategoryTally> | null,
) {
  return render(
    <ChakraProvider theme={theme}>
      <CategoryGrid
        tallies={tallies}
        activeCategories={activeCategories}
        beforeWashTallies={beforeWashTallies}
      />
    </ChakraProvider>,
  );
}

describe('CategoryGrid (dynamic layout, Req 12.3)', () => {
  it('renders one card per active category, scaling to N categories', () => {
    const cats = ['shirts', 'pants', 'towels', 'sheets', 'jackets', 'socks', 'hats'];
    const counts = Object.fromEntries(cats.map((c, i) => [c, i]));
    renderGrid(talliesFrom(counts), cats);

    for (const c of cats) {
      expect(screen.getByTestId(`category-card-${c}`)).toBeInTheDocument();
    }
  });

  it('uses the large 48px+ count token for count numbers (Req 1.4)', () => {
    renderGrid(talliesFrom({ shirts: 12 }), ['shirts']);
    const countEl = screen.getByText('12');
    // theme fontSize token `count` = 5rem (80px), comfortably above 48px min
    expect(countEl).toHaveStyle({ fontSize: 'var(--chakra-fontSizes-count)' });
  });

  it('shows the Before Wash count alongside in After Wash mode (Req 4.6)', () => {
    renderGrid(talliesFrom({ shirts: 4 }), ['shirts'], talliesFrom({ shirts: 5 }));
    expect(screen.getByText(/before: 5/i)).toBeInTheDocument();
  });
});
