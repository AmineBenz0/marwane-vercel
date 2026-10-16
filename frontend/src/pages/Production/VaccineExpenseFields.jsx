import { useState } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { Alert, Box, Button, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { formatVaccineMoney, vaccineExpenseTotal } from '../../utils/vaccineExpenses';
import VaccinePriceManagerDialog from './VaccinePriceManagerDialog';

export default function VaccineExpenseFields({ control, register, setValue, errors, vaccins, onVaccinsChange, comptes, loading, loadError, disabled }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'depenses_vaccins' });
  const lines = useWatch({ control, name: 'depenses_vaccins' }) || [];
  const [editingPrices, setEditingPrices] = useState({});
  const [managerOpen, setManagerOpen] = useState(false);
  const total = lines.reduce((sum, line) => sum + vaccineExpenseTotal(line.quantite, line.prix_unitaire), 0);

  const updateCataloguePrice = (updatedVaccine) => {
    onVaccinsChange((current) => current.map((vaccine) => (
      Number(vaccine.id_vaccin) === Number(updatedVaccine.id_vaccin) ? updatedVaccine : vaccine
    )));
  };

  return <Stack spacing={1.5}>
    <Divider sx={{ my: 0.5 }} />
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={0.75}>
      <Box>
        <Typography variant="subtitle2" fontWeight={900}>Dépenses – Vaccins</Typography>
        <Typography variant="caption" color="text.secondary">
          Le tarif enregistré s’applique automatiquement aux prochaines saisies.
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.5} justifyContent={{ xs: 'space-between', sm: 'flex-end' }}>
        <Button size="small" disabled={disabled || loading || !!loadError || !vaccins.length} onClick={() => setManagerOpen(true)}>
          Gérer les tarifs
        </Button>
        <Button size="small" variant="outlined" startIcon={<AddIcon />} disabled={disabled || loading || !!loadError || !vaccins.length || fields.length >= 100}
          onClick={() => append({ id_vaccin: '', quantite: '1', prix_unitaire: '', id_compte: '' })}>
          {loading ? 'Chargement…' : 'Ajouter un vaccin'}
        </Button>
      </Stack>
    </Stack>
    {loadError && <Alert severity="warning">{loadError}</Alert>}
    {fields.map((field, index) => {
      const line = lines[index] || {};
      const prefix = `depenses_vaccins.${index}`;
      const lineErrors = errors.depenses_vaccins?.[index] || {};
      const selected = vaccins.find((item) => Number(item.id_vaccin) === Number(line.id_vaccin));
      const isEditingPrice = !!editingPrices[index] || (!!selected && !line.prix_unitaire);
      const unit = selected?.unite || line.unite || 'unité';
      const displayUnit = Number(line.quantite) > 1 && !unit.endsWith('s') ? `${unit}s` : unit;
      const hasCataloguePrice = selected?.prix_defaut !== null && selected?.prix_defaut !== undefined && selected?.prix_defaut !== '';
      return <Stack key={field.id} spacing={1.25} sx={{ p: 1.5, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2" fontWeight={700}>Vaccin {index + 1}</Typography>
          <Button color="error" size="small" startIcon={<DeleteIcon />} disabled={disabled} onClick={() => remove(index)}>Retirer</Button>
        </Stack>
        <TextField select fullWidth label="Vaccin" disabled={disabled}
          {...register(`${prefix}.id_vaccin`, { required: 'Sélectionnez un vaccin' })}
          value={line.id_vaccin || ''} error={!!lineErrors.id_vaccin} helperText={lineErrors.id_vaccin?.message}
          onChange={(event) => {
            const vaccine = vaccins.find((item) => Number(item.id_vaccin) === Number(event.target.value));
            setValue(`${prefix}.id_vaccin`, event.target.value, { shouldDirty: true, shouldValidate: true });
            setValue(`${prefix}.prix_unitaire`, vaccine?.prix_defaut ?? '', { shouldDirty: true, shouldValidate: true });
            setEditingPrices((current) => ({ ...current, [index]: !vaccine?.prix_defaut }));
          }}>
          {!selected && line.id_vaccin && <MenuItem value={line.id_vaccin}>{line.nom_vaccin || `Vaccin #${line.id_vaccin}`}</MenuItem>}
          {vaccins.map((vaccine) => <MenuItem key={vaccine.id_vaccin} value={vaccine.id_vaccin}>{vaccine.nom}</MenuItem>)}
        </TextField>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <TextField fullWidth type="number" label="Quantité" disabled={disabled}
            inputProps={{ min: '0.001', step: '0.001', max: '999999999.999' }}
            {...register(`${prefix}.quantite`, { required: 'Indiquez la quantité', min: { value: 0.001, message: 'La quantité doit être positive' },
              validate: (value) => /^\d+(?:\.\d{1,3})?$/.test(String(value)) || 'Maximum 3 décimales' })}
            error={!!lineErrors.quantite} helperText={lineErrors.quantite?.message || selected?.unite || line.unite || 'Unité'} />
          {isEditingPrice ? <Stack spacing={0.25}>
            <TextField fullWidth type="number" label="Prix unitaire (DH)" disabled={disabled}
              inputProps={{ min: '0.01', step: '0.01', max: '9999999999.99' }}
              {...register(`${prefix}.prix_unitaire`, { required: 'Indiquez le prix', min: { value: 0.01, message: 'Le prix doit être positif' },
                validate: (value) => /^\d+(?:\.\d{1,2})?$/.test(String(value)) || 'Maximum 2 décimales' })}
              error={!!lineErrors.prix_unitaire} helperText={lineErrors.prix_unitaire?.message || (!hasCataloguePrice ? 'Aucun tarif enregistré : indiquez le prix pour cette saisie.' : 'Ce prix ne vaut que pour cette saisie.')} />
            {hasCataloguePrice && <Button size="small" sx={{ alignSelf: 'flex-start' }} disabled={disabled}
              onClick={() => { setValue(`${prefix}.prix_unitaire`, selected.prix_defaut, { shouldDirty: true, shouldValidate: true }); setEditingPrices((current) => ({ ...current, [index]: false })); }}>
              Utiliser le tarif catalogue
            </Button>}
          </Stack> :
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 56, px: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {line.prix_unitaire ? `${line.quantite || 0} ${displayUnit} × ${formatVaccineMoney(line.prix_unitaire)}` : 'Prix à renseigner'}
                </Typography>
                {!!line.prix_unitaire && <Typography variant="caption" color="text.secondary">Prix par unité</Typography>}
              </Box>
              <Button size="small" disabled={disabled} onClick={() => setEditingPrices((current) => ({ ...current, [index]: true }))}>
                Modifier le prix
              </Button>
            </Box>}
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
          <TextField select fullWidth label="Payé depuis" value={line.id_compte || ''} disabled={disabled}
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
    <VaccinePriceManagerDialog open={managerOpen} onClose={() => setManagerOpen(false)} vaccins={vaccins} onPriceUpdated={updateCataloguePrice} />
  </Stack>;
}
