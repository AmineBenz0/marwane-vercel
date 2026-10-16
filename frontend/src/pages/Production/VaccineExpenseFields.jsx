import { useFieldArray, useWatch } from 'react-hook-form';
import { Alert, Box, Button, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { formatVaccineMoney, vaccineExpenseTotal } from '../../utils/vaccineExpenses';

export default function VaccineExpenseFields({ control, register, setValue, errors, vaccins, comptes, loading, loadError, disabled }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'depenses_vaccins' });
  const lines = useWatch({ control, name: 'depenses_vaccins' }) || [];
  const total = lines.reduce((sum, line) => sum + vaccineExpenseTotal(line.quantite, line.prix_unitaire), 0);

  return <Stack spacing={1.5}>
    <Divider sx={{ my: 0.5 }} />
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={0.75}>
      <Box>
        <Typography variant="subtitle2" fontWeight={900}>D�penses - Vaccins</Typography>
        <Typography variant="caption" color="text.secondary">
          Les montants seront d�bit�s de la caisse ou du compte choisi.
        </Typography>
      </Box>
      <Button size="small" variant="outlined" startIcon={<AddIcon />} disabled={disabled || loading || !!loadError || !vaccins.length || fields.length >= 100}
        onClick={() => append({ id_vaccin: '', quantite: '1', prix_unitaire: '', id_compte: '' })}>
        {loading ? 'Chargement.' : 'Ajouter un vaccin'}
      </Button>
    </Stack>
    {loadError && <Alert severity="warning">{loadError}</Alert>}
    {fields.map((field, index) => {
      const line = lines[index] || {};
      const prefix = `depenses_vaccins.${index}`;
      const lineErrors = errors.depenses_vaccins?.[index] || {};
      const selected = vaccins.find((item) => Number(item.id_vaccin) === Number(line.id_vaccin));
      return <Stack key={field.id} spacing={1.25} sx={{ p: 1.5, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2" fontWeight={700}>Vaccin {index + 1}</Typography>
          <Button color="error" size="small" startIcon={<DeleteIcon />} disabled={disabled} onClick={() => remove(index)}>Retirer</Button>
        </Stack>
        <TextField select fullWidth label="Vaccin" disabled={disabled}
          {...register(`${prefix}.id_vaccin`, { required: 'S�lectionnez un vaccin' })}
          value={line.id_vaccin || ''} error={!!lineErrors.id_vaccin} helperText={lineErrors.id_vaccin?.message}
          onChange={(event) => {
            const vaccine = vaccins.find((item) => Number(item.id_vaccin) === Number(event.target.value));
            setValue(`${prefix}.id_vaccin`, event.target.value, { shouldDirty: true, shouldValidate: true });
            setValue(`${prefix}.prix_unitaire`, vaccine?.prix_defaut ?? '', { shouldDirty: true });
          }}>
          {!selected && line.id_vaccin && <MenuItem value={line.id_vaccin}>{line.nom_vaccin || `Vaccin #${line.id_vaccin}`}</MenuItem>}
          {vaccins.map((vaccine) => <MenuItem key={vaccine.id_vaccin} value={vaccine.id_vaccin}>{vaccine.nom}</MenuItem>)}
        </TextField>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <TextField fullWidth type="number" label="Quantit�" disabled={disabled}
            inputProps={{ min: '0.001', step: '0.001', max: '999999999.999' }}
            {...register(`${prefix}.quantite`, { required: 'Indiquez la quantit�', min: { value: 0.001, message: 'La quantit� doit �tre positive' },
              validate: (value) => /^\d+(?:\.\d{1,3})?$/.test(String(value)) || 'Maximum 3 d�cimales' })}
            error={!!lineErrors.quantite} helperText={lineErrors.quantite?.message || selected?.unite || line.unite || 'Unit�'} />
          <TextField fullWidth type="number" label="Prix unitaire (DH)" disabled={disabled}
            inputProps={{ min: '0.01', step: '0.01', max: '9999999999.99' }}
            {...register(`${prefix}.prix_unitaire`, { required: 'Indiquez le prix', min: { value: 0.01, message: 'Le prix doit �tre positif' },
              validate: (value) => /^\d+(?:\.\d{1,2})?$/.test(String(value)) || 'Maximum 2 d�cimales' })}
            error={!!lineErrors.prix_unitaire} helperText={lineErrors.prix_unitaire?.message} />
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
          <TextField select fullWidth label="Pay� depuis" value={line.id_compte || ''} disabled={disabled}
            {...register(`${prefix}.id_compte`)}>
            <MenuItem value="">Caisse</MenuItem>
            {line.id_compte && !comptes.some((account) => Number(account.id_compte) === Number(line.id_compte)) &&
              <MenuItem value={line.id_compte}>{`Compte #${line.id_compte}`}</MenuItem>}
            {comptes.map((account) => <MenuItem key={account.id_compte} value={account.id_compte}>{account.nom_banque}</MenuItem>)}
          </TextField>
          <Typography variant="body2" fontWeight={800} sx={{ minWidth: { sm: 150 }, textAlign: { xs: 'left', sm: 'right' } }}>
            Total : {formatVaccineMoney(vaccineExpenseTotal(line.quantite, line.prix_unitaire))}
          </Typography>
        </Stack>
      </Stack>;
    })}
    {fields.length > 0 && <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.5, py: 1, bgcolor: 'primary.50', borderRadius: 1.5 }}>
      <Typography variant="body2" fontWeight={700}>Total des vaccins</Typography>
      <Typography fontWeight={900}>{formatVaccineMoney(total)}</Typography>
    </Stack>}
  </Stack>;
}

