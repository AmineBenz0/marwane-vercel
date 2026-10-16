import { useFieldArray, useWatch } from 'react-hook-form';
import { Alert, Box, Button, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { formatVaccineMoney, vaccineExpenseTotal } from '../../utils/vaccineExpenses';

export default function VaccineExpenseFields({ control, register, setValue, errors, vaccins, comptes, loading, loadError, disabled }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'depenses_vaccins' });
  const lines = useWatch({ control, name: 'depenses_vaccins' }) || [];
  const total = lines.reduce((sum, line) => sum + vaccineExpenseTotal(line.quantite, line.prix_unitaire), 0);

  return <Stack spacing={2}>
    <Divider />
    <Box>
      <Typography variant="subtitle2" fontWeight={900}>Dépenses – Vaccins</Typography>
      <Typography variant="caption" color="text.secondary">
        Sélectionnez un vaccin puis renseignez la quantité et le prix unitaire. Le prix est modifiable pour cette dépense.
      </Typography>
    </Box>
    {loadError && <Alert severity="warning">{loadError}</Alert>}
    {fields.map((field, index) => {
      const line = lines[index] || {};
      const prefix = `depenses_vaccins.${index}`;
      const lineErrors = errors.depenses_vaccins?.[index] || {};
      const selected = vaccins.find((item) => Number(item.id_vaccin) === Number(line.id_vaccin));
      return <Stack key={field.id} spacing={1.5} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <TextField select fullWidth label={`Vaccin ${index + 1}`} disabled={disabled}
          {...register(`${prefix}.id_vaccin`, { required: 'Sélectionnez un vaccin' })}
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
          <TextField fullWidth type="number" label={`Quantité ${index + 1}`} disabled={disabled}
            inputProps={{ min: '0.001', step: '0.001', max: '999999999.999' }}
            {...register(`${prefix}.quantite`, { required: 'Indiquez la quantité', min: { value: 0.001, message: 'La quantité doit être positive' },
              validate: (value) => /^\d+(?:\.\d{1,3})?$/.test(String(value)) || 'Maximum 3 décimales' })}
            error={!!lineErrors.quantite} helperText={lineErrors.quantite?.message || `En ${selected?.unite || line.unite || 'unité'}`} />
          <TextField fullWidth type="number" label={`Prix unitaire (DH) ${index + 1}`} disabled={disabled}
            inputProps={{ min: '0.01', step: '0.01', max: '9999999999.99' }}
            {...register(`${prefix}.prix_unitaire`, { required: 'Indiquez le prix', min: { value: 0.01, message: 'Le prix doit être positif' },
              validate: (value) => /^\d+(?:\.\d{1,2})?$/.test(String(value)) || 'Maximum 2 décimales' })}
            error={!!lineErrors.prix_unitaire} helperText={lineErrors.prix_unitaire?.message || 'Conservé uniquement pour cette dépense'} />
        </Box>
        <TextField select fullWidth label={`Payé depuis ${index + 1}`} value={line.id_compte || ''} disabled={disabled}
          {...register(`${prefix}.id_compte`)}>
          <MenuItem value="">Caisse</MenuItem>
          {line.id_compte && !comptes.some((account) => Number(account.id_compte) === Number(line.id_compte)) &&
            <MenuItem value={line.id_compte}>{`Compte #${line.id_compte}`}</MenuItem>}
          {comptes.map((account) => <MenuItem key={account.id_compte} value={account.id_compte}>{account.nom_banque}</MenuItem>)}
        </TextField>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Typography fontWeight={800}>Total : {formatVaccineMoney(vaccineExpenseTotal(line.quantite, line.prix_unitaire))}</Typography>
          <Button color="error" variant="outlined" startIcon={<DeleteIcon />} disabled={disabled} onClick={() => remove(index)}>Retirer</Button>
        </Stack>
      </Stack>;
    })}
    <Button variant="outlined" startIcon={<AddIcon />} disabled={disabled || loading || !!loadError || !vaccins.length || fields.length >= 100}
      onClick={() => append({ id_vaccin: '', quantite: '1', prix_unitaire: '', id_compte: '' })}>
      {loading ? 'Chargement des vaccins…' : 'Ajouter un vaccin'}
    </Button>
    {fields.length > 0 && <Typography fontWeight={900} textAlign="right">Total des dépenses : {formatVaccineMoney(total)}</Typography>}
    {fields.length > 0 && <Typography variant="caption" color="text.secondary">L’enregistrement créera une sortie dans la caisse ou le compte bancaire choisi.</Typography>}
  </Stack>;
}
