import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  FileDownload as FileDownloadIcon,
  People as PeopleIcon,
  PersonAdd as PersonAddIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import * as yup from 'yup';
import { format } from 'date-fns';
import ModalForm from '../../components/ModalForm/ModalForm';
import SmartFilterPanel from '../../components/Filters/SmartFilterPanel';
import { get, post, put } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import useNotification from '../../hooks/useNotification';

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

function ClientsList() {
  const notification = useNotification();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [filters, setFilters] = useState({ nom: '' });

  const filterDefinitions = useMemo(() => [
    {
      id: 'nom',
      label: 'Rechercher un client',
      type: 'search',
      placeholder: 'Nom du client...',
      alwaysInline: true,
    },
  ], []);

  const fetchClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        est_actif: true,
        limit: 1000,
      };
      if (filters.nom.trim()) {
        params.recherche = filters.nom.trim();
      }
      const data = await get('/clients', { params });
      setClients(data || []);
    } catch (err) {
      const message = err?.message || 'Une erreur est survenue lors du chargement des clients';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [filters]);

  const handleFilterChange = (filterId, value) => {
    setFilters((prev) => ({ ...prev, [filterId]: value }));
  };

  const handleClearAllFilters = () => {
    setFilters({ nom: '' });
  };

  const handleCreate = () => {
    setEditingClient(null);
    setFormError(null);
    setModalOpen(true);
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormError(null);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (!formLoading) {
      setModalOpen(false);
      setEditingClient(null);
      setFormError(null);
    }
  };

  const handleSubmit = async (data) => {
    setFormLoading(true);
    setFormError(null);
    try {
      const payload = { ...data, est_actif: true };
      if (editingClient) {
        await put(`/clients/${editingClient.id_client}`, payload);
      } else {
        await post('/clients', payload);
      }
      setModalOpen(false);
      setEditingClient(null);
      await fetchClients();
      notification.success(editingClient ? 'Client modifié avec succès' : 'Client créé avec succès');
    } catch (err) {
      const message = err?.message || "Une erreur est survenue lors de l'enregistrement";
      setFormError(message);
      notification.error(message);
      throw err;
    } finally {
      setFormLoading(false);
    }
  };

  const handleViewProfile = (client) => {
    navigate(`/clients/${client.id_client}/profile`);
  };

  const handleExportExcel = () => {
    try {
      exportToExcelAdvanced(
        clients,
        [
          { id: 'nom_client', label: 'Nom du client' },
          { id: 'date_creation', label: 'Date de création' },
        ],
        `clients_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
        'Clients',
        {
          date_creation: (value) => value ? new Date(value).toLocaleDateString('fr-FR') : '-',
        }
      );
    } catch (err) {
      setError("Une erreur est survenue lors de l'export Excel");
    }
  };

  const clientsSummary = useMemo(() => {
    const now = new Date();
    const createdThisMonth = clients.filter((client) => {
      if (!client.date_creation) return false;
      const createdAt = new Date(client.date_creation);
      return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
    }).length;

    return {
      total: clients.length,
      createdThisMonth,
    };
  }, [clients]);

  return (
    <Box sx={{ maxWidth: '100%', overflowX: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.5rem', md: '2.125rem' }, fontWeight: 900 }}>
            Clients
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Retrouvez rapidement un client, consultez son profil ou ajoutez-en un nouveau.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={!isMobile && <FileDownloadIcon />}
            onClick={handleExportExcel}
            disabled={loading || clients.length === 0}
          >
            {isMobile ? 'Exporter' : 'Exporter Excel'}
          </Button>
          <Button variant="contained" startIcon={!isMobile && <AddIcon />} onClick={handleCreate}>
            {isMobile ? 'Créer' : 'Créer un client'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <SmartFilterPanel
        pageKey="clients"
        filterDefinitions={filterDefinitions}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAllFilters}
        maxInlineFilters={1}
        resultCount={clients.length}
        totalCount={clients.length}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, mb: 2.5 }}>
        <SummaryCard label="Clients" value={clientsSummary.total} icon={<PeopleIcon />} color="primary.main" />
        <SummaryCard label="Créés ce mois" value={clientsSummary.createdThisMonth} icon={<PersonAddIcon />} color="info.main" />
      </Box>

      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Skeleton key={item} variant="rounded" height={150} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
      ) : clients.length === 0 ? (
        <Card variant="outlined" sx={{ borderRadius: 4, p: 4, textAlign: 'center' }}>
          <Typography variant="h6" fontWeight={900}>Aucun client trouvé</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
            Essayez une autre recherche ou créez un nouveau client.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
            Nouveau client
          </Button>
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
          {clients.map((client) => (
            <Card
              key={client.id_client}
              variant="outlined"
              sx={{
                borderRadius: 4,
                transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 14px 34px rgba(15, 23, 42, 0.10)',
                  borderColor: 'primary.light',
                },
              }}
            >
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                      variant="h6"
                      component="button"
                      onClick={() => handleViewProfile(client)}
                      sx={{
                        display: 'block',
                        width: '100%',
                        p: 0,
                        border: 0,
                        bgcolor: 'transparent',
                        color: 'text.primary',
                        font: 'inherit',
                        fontWeight: 900,
                        textAlign: 'left',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        '&:hover': { color: 'primary.main' },
                      }}
                    >
                      {client.nom_client}
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
                  <Button variant="contained" startIcon={<VisibilityIcon />} onClick={() => handleViewProfile(client)} fullWidth>
                    Profil
                  </Button>
                  <Button variant="outlined" startIcon={<EditIcon />} onClick={() => handleEdit(client)} fullWidth>
                    Modifier
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <ModalForm
        open={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={{ nom_client: editingClient?.nom_client || '' }}
        validationSchema={clientValidationSchema}
        fields={clientFields}
        title={editingClient ? 'Modifier ce client' : 'Nouveau client'}
        submitLabel={editingClient ? 'Enregistrer' : 'Créer le client'}
        loading={formLoading}
        errorMessage={formError}
      />
    </Box>
  );
}

function SummaryCard({ label, value, icon, color }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box sx={{ color, display: 'flex' }}>{icon}</Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
              {label}
            </Typography>
            <Typography variant="h5" fontWeight={900}>{value}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default ClientsList;
