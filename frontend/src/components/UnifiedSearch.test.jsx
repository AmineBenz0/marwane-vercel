import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import UnifiedSearch from './UnifiedSearch';
import { get } from '../services/api';

const navigate = vi.fn();

vi.mock('../services/api', () => ({ get: vi.fn() }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

describe('UnifiedSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ results: [{ kind: 'produit', id: 7, label: 'Matière première', subtitle: 'matiere_premiere', href: '/produits/7' }] });
  });

  it('debounces a search, renders grouped results, and navigates on selection', async () => {
    render(<MemoryRouter><UnifiedSearch /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Recherche globale'), { target: { value: 'matiere' } });

    await waitFor(() => expect(get).toHaveBeenCalledWith('/search', expect.objectContaining({ params: { q: 'matiere' } })), { timeout: 1000 });
    expect(await screen.findByText('Matière première')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /matière première/i }));
    expect(navigate).toHaveBeenCalledWith('/produits/7');
  });
});
