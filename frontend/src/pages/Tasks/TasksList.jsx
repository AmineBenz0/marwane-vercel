import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  TaskAlt as TaskAltIcon,
} from '@mui/icons-material';
import { getTaskDate, groupTasks, isTaskDone } from './taskListModel';
import { formatShortDate, formatShortDateTime } from '../../utils/dateFormatting';
import TaskModal from '../../components/Tasks/TaskModal';
import taskService from '../../services/taskService';
import useNotification from '../../hooks/useNotification';

const STATUS_LABELS = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  complete: 'Completee',
  annule: 'Annulee',
};

const PRIORITY_LABELS = {
  basse: 'Basse',
  moyenne: 'Moyenne',
  haute: 'Haute',
};

const FILTERS = [
  { key: 'toutes', label: 'Toutes' },
  { key: 'aujourdhui', label: "Aujourd'hui" },
  { key: 'en_attente', label: 'En attente' },
  { key: 'urgentes', label: 'Urgentes' },
  { key: 'terminees', label: 'Terminees' },
];

const formatTaskDate = (task) => {
  const date = getTaskDate(task);
  if (!date) return 'Date non definie';
  if (task.est_toute_la_journee) return formatShortDate(date);
  return formatShortDateTime(date);
};

function TasksList() {
  const [tasks, setTasks] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [activeFilter, setActiveFilter] = useState('toutes');
  const notification = useNotification();

  const fetchTasks = async () => {
    try {
      const data = await taskService.getTasks();
      setTasks(data || []);
    } catch (err) {
      console.error(err);
      notification.error('Erreur lors du chargement des taches');
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
    if (window.confirm('Etes-vous sur de vouloir supprimer cette tache ?')) {
      try {
        await taskService.deleteTask(id);
        notification.success('Tache supprimee');
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
        notification.success('Tache mise a jour');
      } else {
        await taskService.createTask(data);
        notification.success('Tache creee');
      }
      fetchTasks();
    } catch (err) {
      console.error(err);
      notification.error("Erreur lors de l'enregistrement");
      throw err;
    }
  };

  const taskGroups = groupTasks(tasks, new Date());
  const { sortedTasks, overdue: overdueTasks, today: todayTasks, upcoming: upcomingTasks,
    unscheduled: unscheduledTasks, completed: completedTasks, allInActionOrder: allTasksInActionOrder,
    counts: taskCounts } = taskGroups;

  const filteredTasks = useMemo(() => {
    switch (activeFilter) {
      case 'aujourdhui':
        return todayTasks;
      case 'en_attente':
        return sortedTasks.filter((task) => task.statut === 'en_attente');
      case 'urgentes':
        return sortedTasks.filter((task) => task.priorite === 'haute' && !isTaskDone(task));
      case 'terminees':
        return sortedTasks.filter(isTaskDone);
      default:
        return allTasksInActionOrder;
    }
  }, [activeFilter, sortedTasks, todayTasks, allTasksInActionOrder]);

  const stats = [
    { label: "Aujourd'hui", value: taskCounts.aujourdhui, helper: 'A traiter dans la journee' },
    { label: 'En attente', value: taskCounts.en_attente, helper: 'Encore ouvertes' },
    { label: 'Urgentes', value: taskCounts.urgentes, helper: 'A regarder en premier' },
    { label: 'Terminees', value: taskCounts.terminees, helper: 'Archivees ou annulees' },
  ];

  const filterOptions = FILTERS.map((filter) => ({
    ...filter,
    count: taskCounts[filter.key] ?? taskCounts.toutes,
  }));

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'flex-end' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#17211D' }}>
            Mes taches
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 680 }}>
            Ce qui doit etre fait maintenant, puis ce qui arrive ensuite.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreate}
          sx={{ minHeight: 46, borderRadius: 2 }}
        >
          Nouvelle tache
        </Button>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {stats.map((stat) => (
          <Grid item xs={6} md={3} key={stat.label}>
            <Card sx={{ height: '100%', borderRadius: 3 }}>
              <CardContent sx={{ p: { xs: 1.75, md: 2.25 } }}>
                <Typography
                  variant="overline"
                  sx={{ color: 'text.secondary', fontWeight: 900, letterSpacing: '0.08em' }}
                >
                  {stat.label}
                </Typography>
                <Typography sx={{ mt: 1, fontSize: { xs: '1.75rem', md: '2.1rem' }, fontWeight: 900, lineHeight: 1 }}>
                  {stat.value}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.75, display: { xs: 'none', sm: 'block' } }}
                >
                  {stat.helper}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card
        sx={{
          mb: 2.5,
          borderRadius: 3,
          backgroundColor: '#F8FAF7',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <CardContent sx={{ p: { xs: 1.25, sm: 1.5 }, '&:last-child': { pb: { xs: 1.25, sm: 1.5 } } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                sm: 'repeat(auto-fit, minmax(145px, 1fr))',
              },
              gap: 1,
            }}
          >
            {filterOptions.map((filter) => {
              const selected = activeFilter === filter.key;
              return (
                <Button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  variant={selected ? 'contained' : 'outlined'}
                  sx={{
                    minHeight: { xs: 48, sm: 52 },
                    px: { xs: 1.25, sm: 1.5 },
                    borderRadius: 2.25,
                    justifyContent: 'space-between',
                    textTransform: 'none',
                    fontWeight: 900,
                    color: selected ? 'primary.contrastText' : '#26352F',
                    backgroundColor: selected ? undefined : '#FFFFFF',
                    borderColor: selected ? undefined : 'rgba(23, 33, 29, 0.14)',
                    boxShadow: selected ? '0 10px 22px rgba(10, 128, 105, 0.18)' : 'none',
                    '&:hover': {
                      backgroundColor: selected ? undefined : '#FFFFFF',
                      borderColor: selected ? undefined : 'primary.main',
                    },
                  }}
                >
                  <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {filter.label}
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      ml: 1,
                      minWidth: 28,
                      height: 28,
                      px: 0.75,
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: '0.82rem',
                      backgroundColor: selected ? 'rgba(255,255,255,0.2)' : '#EEF4EF',
                    }}
                  >
                    {filter.count}
                  </Box>
                </Button>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      {activeFilter === 'toutes' ? (
        <Stack spacing={2.5}>
          {overdueTasks.length > 0 && <TaskPanel
            title="En retard"
            subtitle="À traiter en priorité."
            tasks={overdueTasks}
            emptyText="Aucune tâche en retard."
            onCreate={handleCreate}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />}
          {todayTasks.length > 0 && <TaskPanel
            title="À faire aujourd'hui"
            subtitle="Les actions prévues pour aujourd'hui."
            tasks={todayTasks}
            emptyText="Aucune tâche aujourd'hui."
            onCreate={overdueTasks.length === 0 ? handleCreate : undefined}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />}
          {upcomingTasks.length > 0 && <TaskPanel
            title="Prochaines tâches"
            subtitle="Ce qui est prévu ensuite."
            tasks={upcomingTasks}
            emptyText="Aucune prochaine tâche prévue."
            onCreate={overdueTasks.length === 0 && todayTasks.length === 0 ? handleCreate : undefined}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />}
          {unscheduledTasks.length > 0 && <TaskPanel
            title="Sans date prévue"
            subtitle="Les tâches ouvertes sans échéance."
            tasks={unscheduledTasks}
            emptyText="Aucune tâche sans date prévue."
            onEdit={handleEdit}
            onDelete={handleDelete}
          />}
          {completedTasks.length > 0 && <RecentCompleted tasks={completedTasks} onEdit={handleEdit} />}
          {tasks.length === 0 && <TaskPanel
            title="Toutes les tâches"
            subtitle="0 tâche trouvée."
            tasks={[]}
            emptyText="Aucune tâche pour le moment."
            onCreate={handleCreate}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />}
        </Stack>
      ) : (
        <TaskPanel
          title={FILTERS.find((filter) => filter.key === activeFilter)?.label || 'Taches'}
          subtitle={`${filteredTasks.length} tache${filteredTasks.length > 1 ? 's' : ''} trouvee${filteredTasks.length > 1 ? 's' : ''}.`}
          tasks={filteredTasks}
          emptyText="Aucune tache pour ce filtre."
          onCreate={handleCreate}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

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

function TaskPanel({ title, subtitle, tasks, emptyText, onCreate, onEdit, onDelete }) {
  return (
    <Card sx={{ height: '100%', borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
          <Box>
            <Typography component="h2" sx={{ fontWeight: 900, fontSize: '1.25rem' }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          </Box>
          {onCreate && (
            <IconButton
              onClick={onCreate}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
              aria-label="Ajouter une tache"
            >
              <AddIcon />
            </IconButton>
          )}
        </Stack>

        {tasks.length === 0 ? (
          <Alert severity="info">{emptyText}</Alert>
        ) : (
          <Stack spacing={1.5}>
            {tasks.map((task) => (
              <TaskCard key={task.id_tache} task={task} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function TaskCard({ task, onEdit, onDelete }) {
  const done = isTaskDone(task);

  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: 2,
        border: '1px solid',
        borderColor: '#DCE4DF',
        backgroundColor: '#FFFDF8',
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.25}>
        <Stack direction="row" spacing={1.25} alignItems="flex-start">
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1.5,
              border: '2px solid',
              borderColor: done ? '#1D6F50' : '#B7C8C0',
              backgroundColor: done ? '#1D6F50' : 'transparent',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {done && <CheckCircleIcon sx={{ fontSize: 18 }} />}
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 900, lineHeight: 1.25 }}>
              {task.titre}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
              {formatTaskDate(task)}
            </Typography>
            {task.description && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.4 }}>
                {task.description}
              </Typography>
            )}
          </Box>
        </Stack>

        <PriorityChip value={task.priorite} />
      </Stack>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
        <StatusChip value={task.statut} />
        {task.categorie && <Chip label={task.categorie} size="small" variant="outlined" sx={{ fontWeight: 800 }} />}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={() => onEdit(task)}
          sx={{ borderRadius: 2 }}
        >
          Modifier
        </Button>
        <Button
          size="small"
          color="error"
          variant="outlined"
          startIcon={<DeleteIcon />}
          onClick={() => onDelete(task.id_tache)}
          sx={{ borderRadius: 2 }}
        >
          Supprimer
        </Button>
      </Stack>
    </Box>
  );
}

function RecentCompleted({ tasks, onEdit }) {
  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Box>
            <Typography component="h2" sx={{ fontWeight: 900, fontSize: '1.15rem' }}>
              Tâches terminées
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tâches terminées ou annulées.
            </Typography>
          </Box>
          <TaskAltIcon sx={{ color: '#1D6F50' }} />
        </Stack>

        {tasks.length === 0 ? (
          <Alert severity="info">Aucune tache terminee recemment.</Alert>
        ) : (
          <Stack spacing={1}>
            {tasks.map((task) => (
              <Box
                key={task.id_tache}
                onClick={() => onEdit(task)}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '110px 1fr' },
                  gap: 1,
                  p: 1.4,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: alpha('#129B89', 0.05) },
                }}
              >
                <Typography sx={{ color: '#1D6F50', fontWeight: 900, fontSize: '0.8rem' }}>
                  {formatTaskDate(task)}
                </Typography>
                <Typography sx={{ fontWeight: 800 }}>
                  {task.titre}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function StatusChip({ value }) {
  const colors = {
    en_attente: 'default',
    en_cours: 'primary',
    complete: 'success',
    annule: 'error',
  };

  return (
    <Chip
      label={STATUS_LABELS[value] || value || 'Statut'}
      color={colors[value] || 'default'}
      size="small"
      sx={{ fontWeight: 800 }}
    />
  );
}

function PriorityChip({ value }) {
  const colors = {
    basse: 'info',
    moyenne: 'warning',
    haute: 'error',
  };

  return (
    <Chip
      label={PRIORITY_LABELS[value] || value || 'Priorite'}
      color={colors[value] || 'default'}
      variant="outlined"
      size="small"
      sx={{ width: 'fit-content', fontWeight: 800 }}
    />
  );
}

export default TasksList;
