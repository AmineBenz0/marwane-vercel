import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarMonth as CalendarIcon } from '@mui/icons-material';
import { Box, IconButton, InputAdornment, TextField } from '@mui/material';
import { formatShortDate, parseShortDateInput } from './dateFormatting';

/** A locale-independent date field. UI uses dd/MM/yy; state remains YYYY-MM-DD. */
export default function DateField({
  value: controlledValue,
  onChange,
  onBlur,
  name,
  ref: registrationRef,
  label,
  InputProps = {},
  InputLabelProps = {},
  inputProps = {},
  ...textFieldProps
}) {
  const pickerRef = useRef(null);
  const textInputRef = useRef(null);
  const isoValueRef = useRef(controlledValue || '');
  const [uncontrolledValue, setUncontrolledValue] = useState('');
  const value = controlledValue === undefined ? uncontrolledValue : controlledValue;
  const [draft, setDraft] = useState(() => formatShortDate(value, ''));

  useEffect(() => {
    isoValueRef.current = value || '';
    setDraft(formatShortDate(value, ''));
  }, [value]);

  const emitChange = (isoValue) => {
    isoValueRef.current = isoValue;
    if (controlledValue === undefined) setUncontrolledValue(isoValue);
    const target = { name, type: 'date', value: isoValue };
    onChange?.({ target, currentTarget: target });
  };

  const registrationProxy = useMemo(() => ({
    get name() { return name; },
    get type() { return 'date'; },
    get value() { return isoValueRef.current; },
    set value(nextValue) {
      isoValueRef.current = nextValue || '';
      setUncontrolledValue(nextValue || '');
      setDraft(formatShortDate(nextValue, ''));
    },
    focus() { textInputRef.current?.focus(); },
    setCustomValidity(message) { textInputRef.current?.setCustomValidity(message); },
    reportValidity() { return textInputRef.current?.reportValidity() ?? true; },
  }), [name]);

  useEffect(() => {
    if (!registrationRef) return undefined;
    registrationRef(registrationProxy);
    return () => registrationRef(null);
  }, [registrationRef, registrationProxy]);

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      if (typeof picker.showPicker === 'function') picker.showPicker();
      else picker.click();
    } catch {
      picker.click();
    }
  };

  return (
    <Box sx={{ position: 'relative', width: textFieldProps.fullWidth ? '100%' : undefined }}>
      <TextField
        {...textFieldProps}
        label={label}
        name={name}
        value={draft}
        inputRef={textInputRef}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          const isoValue = parseShortDateInput(nextDraft);
          if (isoValue !== null) emitChange(isoValue);
        }}
        onBlur={() => {
          onBlur?.({ target: { name, type: 'date', value: isoValueRef.current }, currentTarget: { name, type: 'date', value: isoValueRef.current } });
          if (draft && parseShortDateInput(draft) === null) {
            setDraft(formatShortDate(isoValueRef.current, ''));
          }
        }}
        type="text"
        placeholder="dd/mm/yy"
        InputLabelProps={{ ...InputLabelProps, shrink: true }}
        inputProps={{ ...inputProps, inputMode: 'numeric', maxLength: 10, placeholder: 'dd/mm/yy' }}
        InputProps={{
          ...InputProps,
          endAdornment: (
            <>
              {InputProps.endAdornment}
              <InputAdornment position="end">
                <IconButton
                  aria-label={label ? `Choisir ${label.toLowerCase()}` : 'Choisir une date'}
                  edge="end"
                  onClick={openPicker}
                  size="small"
                  tabIndex={0}
                  disabled={textFieldProps.disabled}
                >
                  <CalendarIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            </>
          ),
        }}
      />
      <input
        ref={pickerRef}
        aria-hidden="true"
        tabIndex={-1}
        type="date"
        value={value || ''}
        min={inputProps.min}
        max={inputProps.max}
        onChange={(event) => {
          emitChange(event.target.value);
          setDraft(formatShortDate(event.target.value, ''));
        }}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', left: 0, bottom: 0 }}
      />
    </Box>
  );
}
