import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import ContactCard from './ContactCard';
import { formatMontantComplet } from '../utils/formatNumber';

afterEach(cleanup);

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<ContactCard to="/clients/7/profile" name="Contact test" type="client" {...props} />} />
        <Route path="/clients/7/profile" element={<div>Profil client</div>} />
        <Route path="/fournisseurs/7/profile" element={<div>Profil fournisseur</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ContactCard', () => {
  it.each(['client', 'fournisseur'])('uses one native focusable link to the %s profile', (type) => {
    const to = type === 'client' ? '/clients/7/profile' : '/fournisseurs/7/profile';
    renderCard({ type, to, balance: '125.50' });
    const link = screen.getByRole('link', { name: 'Voir le profil de Contact test' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', to);
    link.focus();
    expect(link).toHaveFocus();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Créé le/)).not.toBeInTheDocument();
    fireEvent.click(link);
    expect(screen.getByText(type === 'client' ? 'Profil client' : 'Profil fournisseur')).toBeVisible();
  });

  it.each([undefined, null, '', ' ', 'invalid', Infinity, true])('shows unavailable for missing or invalid balance %s', (balance) => {
    renderCard({ balance });
    expect(screen.getByText('Indisponible')).toBeVisible();
    expect(screen.queryByText(formatMontantComplet(0), { normalizer: (value) => value })).not.toBeInTheDocument();
  });

  it.each([0, '0', '0.00'])('displays a confirmed zero balance %s', (balance) => {
    renderCard({ balance });
    expect(screen.getByText(formatMontantComplet(0), { normalizer: (value) => value })).toBeVisible();
    expect(screen.queryByText('Indisponible')).not.toBeInTheDocument();
  });

  it.each([
    ['client', '42.50', 'Reste à encaisser'],
    ['fournisseur', '42.50', 'Reste à payer'],
    ['client', '-42.50', 'Avance reçue'],
    ['fournisseur', '-42.50', 'Avance versée'],
  ])('labels the %s net balance %s correctly', (type, balance, label) => {
    renderCard({ type, balance });
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(formatMontantComplet(42.5), { normalizer: (value) => value })).toBeVisible();
  });

  it('retains the complete name and exact large amount', () => {
    const name = 'Un nom particulièrement long '.repeat(8);
    renderCard({ name, balance: '9999999999999.99' });
    expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute('title', name);
    expect(screen.getByText(formatMontantComplet(9999999999999.99), { normalizer: (value) => value })).toBeVisible();
  });
});
