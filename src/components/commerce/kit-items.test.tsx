import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KitItems } from './kit-items';

describe('KitItems', () => {
  it('lists the pieces, sizes and colors of a kit', () => {
    render(
      <KitItems
        kit={{
          items: [
            {
              productId: 'a',
              name: 'Cruz Essencial',
              size: '20 cm',
              sizeIndex: 1,
              color: 'Marfim',
              quantity: 2,
            },
            {
              productId: 'b',
              name: 'Terço',
              size: 'Único',
              sizeIndex: 0,
              color: null,
              quantity: 1,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('Kit com 3 peças')).toBeInTheDocument();
    expect(screen.getByText('2× Cruz Essencial (20 cm · Marfim)')).toBeInTheDocument();
    expect(screen.getByText('1× Terço (Único · Qualquer cor)')).toBeInTheDocument();
  });
});
