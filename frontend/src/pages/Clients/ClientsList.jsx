import { People as PeopleIcon } from '@mui/icons-material';
import * as yup from 'yup';
import ContactDirectory from '../../components/ContactDirectory';

const clientValidationSchema = yup.object().shape({
  nom_client: yup
    .string()
    .required('Le nom du client est requis')
    .min(1, 'Le nom doit contenir au moins 1 caractère')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .trim(),
});

const clientFields = [
  {
    name: 'nom_client',
    label: 'Nom du client',
    type: 'text',
    placeholder: 'Ex. Marché central',
    required: true,
    helperText: "Utilisez le nom que l'équipe reconnaît au quotidien.",
  },
];

const initialValues = { nom_client: '' };

export default function ClientsList() {
  return (
    <ContactDirectory
      type="client"
      pageKey="clients"
      title="Clients"
      icon={<PeopleIcon />}
      initialValues={initialValues}
      fields={clientFields}
      validationSchema={clientValidationSchema}
      successMessage="Client créé avec succès"
    />
  );
}
