import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DECIMAL_INPUT_PROPS, installDecimalInputNormalizer, normalizeDecimalText, parseDecimal } from './decimalInput';

describe('decimal input helpers', () => {
  it('normalizes commas and spaces', () => {
    expect(normalizeDecimalText('12,5')).toBe('12.5');
    expect(normalizeDecimalText('1 200,50')).toBe('1200.50');
    expect(normalizeDecimalText('1 200')).toBe('1200');
  });

  it('parses amounts typed the French way', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('1 200,50')).toBe(1200.5);
    expect(parseDecimal('abc')).toBeNaN();
    expect(parseDecimal('1.000,50')).toBeNaN();
    expect(parseDecimal(3)).toBe(3);
  });
});

describe('installDecimalInputNormalizer', () => {
  let uninstall;
  beforeEach(() => { uninstall = installDecimalInputNormalizer(); });
  afterEach(() => uninstall());

  function Field() {
    const [value, setValue] = useState('');
    return <><input aria-label="Montant" {...DECIMAL_INPUT_PROPS} value={value} onChange={(event) => setValue(event.target.value)} /><output>{value}</output></>;
  }

  it('gives React the dotted value when a comma is typed', () => {
    render(<Field />);
    fireEvent.input(screen.getByLabelText('Montant'), { target: { value: '12,5' } });
    expect(screen.getByLabelText('Montant')).toHaveValue('12.5');
    expect(screen.getByRole('status')).toHaveTextContent('12.5');
  });

  it('leaves unmarked inputs alone', () => {
    render(<input aria-label="Notes" defaultValue="" />);
    fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'a,b' } });
    expect(screen.getByLabelText('Notes')).toHaveValue('a,b');
  });
});
