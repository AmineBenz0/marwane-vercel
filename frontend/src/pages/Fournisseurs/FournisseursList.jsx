import { Business as BusinessIcon } from '@mui/icons-material';
import * as yup from 'yup';
import ContactDirectory from '../../components/ContactDirectory';

const fournisseurValidationSchema = yup.object().shape({
  nom_fournisseur: yup
    .string()
    .required('Le nom du fournisseur est requis')
    .min(1, 'Le nom doit contenir au moins 1 caractère')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .trim(),
  mode_reglement_prefere: yup
    .string()
    .oneOf(['caisse', 'banque'], 'Choisissez un mode de règlement')
    .required('Le mode de règlement préféré est requis'),
});

const fournisseurFields = [
  {
    name: 'nom_fournisseur',
    label: 'Nom du fournisseur',
    type: 'text',
    placeholder: 'Ex. Coop Agadir',
    required: true,
    helperText: "Utilisez le nom que l'équipe reconnaît au quotidien.",
  },
  {
    name: 'mode_reglement_prefere',
    label: 'Source de règlement préférée',
    type: 'select',
    required: true,
    options: [
      { value: 'caisse', label: 'Caisse' },
      { value: 'banque', label: 'Compte bancaire' },
    ],
    helperText: 'Les paiements débitent cette source, quel que soit le type de paiement choisi.',
  },
];

const initialValues = { nom_fournisseur: '', mode_reglement_prefere: '' };

export default function FournisseursList() {
  return (
    <ContactDirectory
      type="fournisseur"
      pageKey="fournisseurs"
      title="Fournisseurs"
      icon={<BusinessIcon />}
      initialValues={initialValues}
      fields={fournisseurFields}
      validationSchema={fournisseurValidationSchema}
      successMessage="Fournisseur créé avec succès"
    />
  );
}
