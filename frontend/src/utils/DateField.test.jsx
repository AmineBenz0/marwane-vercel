import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useForm } from 'react-hook-form';
import DateField from './DateField';

afterEach(cleanup);
function Form({ submit }) {
  const { register, handleSubmit, reset } = useForm({ defaultValues: { date: '2026-10-13' } });
  return (
    <form onSubmit={handleSubmit(submit)}>
      <DateField {...register('date')} label="Date du paiement" />
      <button type="button" onClick={() => reset({ date: '2026-10-15' })}>Réinitialiser</button>
      <button type="submit">Enregistrer</button>
    </form>
  );
}

describe('DateField with React Hook Form', () => {
  it('shows default dates and submits ISO values', async () => {
    const submit = vi.fn();
    render(<Form submit={submit} />);
    expect(screen.getByLabelText('Date du paiement')).toHaveValue('13/10/26');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0].date).toBe('2026-10-13');
  });

  it('submits a typed date in ISO format', async () => {
    const submit = vi.fn();
    render(<Form submit={submit} />);
    fireEvent.change(screen.getByLabelText('Date du paiement'), { target: { value: '14/10/26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0].date).toBe('2026-10-14');
  });

  it('synchronizes the displayed date and submitted value after reset', async () => {
    const submit = vi.fn();
    render(<Form submit={submit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(screen.getByLabelText('Date du paiement')).toHaveValue('15/10/26');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0].date).toBe('2026-10-15');
  });
});
