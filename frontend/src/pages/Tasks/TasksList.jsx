import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Chip,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import DataGrid from '../../components/DataGrid/DataGrid';
import TaskModal from '../../components/Tasks/TaskModal';
import taskService from '../../services/taskService';
import useNotification from '../../hooks/useNotification';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

function TasksList() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const notification = useNotification();

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const data = await taskService.getTasks();
      setTasks(data || []);
    } catch (err) {
      console.error(err);
      notification.error('Erreur lors du chargement des tâches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleCreate = () => {
    setSelectedTask(null);
    setModalOpen(true);
  };

  const handleEdit = (task) => {
    setSelectedTask(task);
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
      try {
        await taskService.deleteTask(id);
        notification.success('Tâche supprimée');
        fetchTasks();
        setModalOpen(false);
      } catch (err) {
        console.error(err);
        notification.error('Erreur lors de la suppression');
      }
    }
  };

  const handleSave = async (data) => {
    try {
      if (selectedTask) {
        await taskService.updateTask(selectedTask.id_tache, data);
        notification.success('Tâche mise à jour');
      } else {
        await taskService.createTask(data);
        notification.success('Tâche créée');
      }
      fetchTasks();
    } catch (err) {
      console.error(err);
      notification.error("Erreur lors de l'enregistrement");
      throw err;
    }
  };

  const columns = [
    {
      id: 'titre',
      label: 'Titre',
      sortable: true,
      mobilePriority: true,
    },
    {
      id: 'date_debut',
      label: 'Date',
      sortable: true,
      mobilePriority: true,
      format: (val) => format(new Date(val), 'dd MMMM yyyy HH:mm', { locale: fr }),
    },
    {
      id: 'statut',
      label: 'Statut',
      sortable: true,
      format: (val) => {
        const colors = {
          en_attente: 'default',
          en_cours: 'primary',
          complete: 'success',
          annule: 'error',
        };
        const labels = {
          en_attente: 'En attente',
          en_cours: 'En cours',
          complete: 'Complétée',
          annule: 'Annulée',
        };
        return <Chip label={labels[val] || val} color={colors[val] || 'default'} size="small" />;
      }
    },
    {
      id: 'priorite',
      label: 'Priorité',
      sortable: true,
      format: (val) => {
        const colors = {
          basse: 'info',
          moyenne: 'warning',
          haute: 'error',
        };
        return <Chip label={val} color={colors[val] || 'default'} variant="outlined" size="small" />;
      }
    },
    {
      id: 'categorie',
      label: 'Catégorie',
      sortable: true,
    }
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">Mes Tâches</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
          Nouvelle Tâche
        </Button>
      </Stack>

      <DataGrid
        rows={tasks}
        columns={columns}
        loading={loading}
        onEdit={handleEdit}
        onDelete={(row) => handleDelete(row.id_tache)}
      />

      <TaskModal
        key={selectedTask?.id_tache || 'new'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={selectedTask}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </Box>
  );
}

export default TasksList;
