import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import frLocale from '@fullcalendar/core/locales/fr';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  Paper,
  Stack,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  CalendarMonth as CalendarIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  EventAvailable as EventAvailableIcon,
} from '@mui/icons-material';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import fr from 'date-fns/locale/fr';
import TaskModal from '../../components/Tasks/TaskModal';
import taskService from '../../services/taskService';
import useNotification from '../../hooks/useNotification';

const getTaskDate = (task) => {
  if (!task?.date_debut) return null;
  try {
    return typeof task.date_debut === 'string' ? parseISO(task.date_debut) : new Date(task.date_debut);
  } catch {
    return null;
  }
};

const getTaskTimeLabel = (task) => {
  if (task.est_toute_la_journee) return 'Journee';
  const date = getTaskDate(task);
  if (!date) return 'Heure non definie';
  return format(date, 'HH:mm');
};

const formatDayTitle = (date) => format(date, 'EEEE d MMMM', { locale: fr });

function CalendarView() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const calendarRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [currentTitle, setCurrentTitle] = useState('');
  const notification = useNotification();

  const getCategoryColor = (categorie) => {
    switch (categorie) {
      case 'travail': return theme.palette.primary.main;
      case 'personnel': return theme.palette.success.main;
      case 'rdv': return theme.palette.warning.main;
      case 'urgent': return theme.palette.error.main;
      default: return theme.palette.info.main;
    }
  };

  const fetchEvents = async (start, end) => {
    try {
      const data = await taskService.getTasks({ start_date: start, end_date: end });
      const nextTasks = data || [];
      const calendarEvents = nextTasks.map((task) => ({
        id: task.id_tache.toString(),
        title: task.titre,
        start: task.date_debut,
        end: task.date_fin || undefined,
        allDay: task.est_toute_la_journee,
        extendedProps: { ...task },
        backgroundColor: getCategoryColor(task.categorie),
        borderColor: getCategoryColor(task.categorie),
      }));
      setTasks(nextTasks);
      setEvents(calendarEvents);
    } catch (err) {
      console.error(err);
      notification.error('Erreur lors du chargement des evenements');
    }
  };

  const fetchMobileAgenda = () => {
    const start = startOfDay(new Date());
    const end = addDays(start, 14);
    fetchEvents(start.toISOString(), end.toISOString());
  };

  useEffect(() => {
    if (isMobile) {
      fetchMobileAgenda();
    }
  }, [isMobile]);

  const upcomingTasks = useMemo(() => {
    const today = startOfDay(new Date());
    return [...tasks]
      .filter((task) => {
        const date = getTaskDate(task);
        return date && startOfDay(date) >= today;
      })
      .sort((a, b) => getTaskDate(a) - getTaskDate(b))
      .slice(0, 5);
  }, [tasks]);

  const mobileAgendaDays = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 14 }, (_, index) => {
      const date = addDays(today, index);
      const dayTasks = tasks
        .filter((task) => {
          const taskDate = getTaskDate(task);
          return taskDate && isSameDay(taskDate, date);
        })
        .sort((a, b) => getTaskDate(a) - getTaskDate(b));

      return { date, tasks: dayTasks };
    });
  }, [tasks]);

  const handleDatesSet = (dateInfo) => {
    setCurrentTitle(dateInfo.view.title);
    fetchEvents(dateInfo.startStr, dateInfo.endStr);
  };

  const handleEventClick = (info) => {
    setSelectedTask(info.event.extendedProps);
    setModalOpen(true);
  };

  const handleDateSelect = (info) => {
    setSelectedTask({
      date_debut: info.startStr,
      date_fin: info.endStr,
      est_toute_la_journee: info.allDay,
    });
    setModalOpen(true);
  };

  const handleNewTask = (date) => {
    setSelectedTask(date ? {
      date_debut: format(date, "yyyy-MM-dd'T'09:00"),
      date_fin: format(date, "yyyy-MM-dd'T'10:00"),
      est_toute_la_journee: false,
    } : null);
    setModalOpen(true);
  };

  const refreshCurrentRange = () => {
    if (isMobile) {
      fetchMobileAgenda();
      return;
    }

    const calendarApi = calendarRef.current?.getApi();
    if (!calendarApi) return;
    fetchEvents(calendarApi.view.activeStart.toISOString(), calendarApi.view.activeEnd.toISOString());
  };

  const handleEventDrop = async (info) => {
    try {
      const { event } = info;
      await taskService.updateTask(event.id, {
        date_debut: event.startStr,
        date_fin: event.endStr,
        est_toute_la_journee: event.allDay,
      });
      notification.success('Tache deplacee');
      refreshCurrentRange();
    } catch (err) {
      console.error(err);
      notification.error('Erreur lors du deplacement');
      info.revert();
    }
  };

  const handleSave = async (data) => {
    try {
      if (selectedTask?.id_tache) {
        await taskService.updateTask(selectedTask.id_tache, data);
        notification.success('Tache mise a jour');
      } else {
        await taskService.createTask(data);
        notification.success('Tache creee');
      }
      refreshCurrentRange();
    } catch (err) {
      console.error(err);
      notification.error("Erreur lors de l'enregistrement");
      throw err;
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Supprimer cette tache ?')) {
      try {
        await taskService.deleteTask(id);
        notification.success('Tache supprimee');
        setModalOpen(false);
        refreshCurrentRange();
      } catch (err) {
        console.error(err);
        notification.error('Erreur lors de la suppression');
      }
    }
  };

  const calendarApi = () => calendarRef.current?.getApi();

  return (
    <Box sx={{ pb: 5 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-end' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#17211D' }}>
            Calendrier
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {isMobile
              ? 'Les prochaines taches, date par date.'
              : 'Vue mensuelle complete avec les prochaines taches a cote.'}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleNewTask()}
          sx={{ minHeight: 46, borderRadius: 2 }}
        >
          Nouvelle tache
        </Button>
      </Stack>

      {isMobile ? (
        <MobileAgenda
          days={mobileAgendaDays}
          tasks={tasks}
          onTaskClick={(task) => {
            setSelectedTask(task);
            setModalOpen(true);
          }}
          onNewTask={handleNewTask}
        />
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={12} lg={8.4}>
            <Paper sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 3 }}>
              <Stack
                direction={{ xs: 'column', lg: 'row' }}
                alignItems={{ xs: 'stretch', lg: 'center' }}
                justifyContent="space-between"
                spacing={1.5}
                sx={{ mb: 2 }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 900, fontSize: '1.45rem', color: '#17211D' }}>
                    {currentTitle || 'Mois en cours'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Cliquez sur une date pour ajouter une tache.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <IconButton
                    onClick={() => calendarApi()?.prev()}
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                    aria-label="Mois precedent"
                  >
                    <ChevronLeftIcon />
                  </IconButton>
                  <Button variant="outlined" onClick={() => calendarApi()?.today()}>
                    Aujourd'hui
                  </Button>
                  <IconButton
                    onClick={() => calendarApi()?.next()}
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                    aria-label="Mois suivant"
                  >
                    <ChevronRightIcon />
                  </IconButton>
                </Stack>
              </Stack>

              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={false}
                locale={frLocale}
                events={events}
                editable
                selectable
                selectMirror
                dayMaxEvents={2}
                weekends
                datesSet={handleDatesSet}
                eventClick={handleEventClick}
                select={handleDateSelect}
                eventDrop={handleEventDrop}
                eventResize={handleEventDrop}
                height="auto"
                eventTimeFormat={{
                  hour: '2-digit',
                  minute: '2-digit',
                  meridiem: false,
                  hour12: false,
                }}
              />
            </Paper>
          </Grid>

          <Grid item xs={12} lg={3.6}>
            <UpcomingPanel
              tasks={upcomingTasks}
              onTaskClick={(task) => {
                setSelectedTask(task);
                setModalOpen(true);
              }}
              onNewTask={handleNewTask}
            />
          </Grid>
        </Grid>
      )}

      <TaskModal
        key={selectedTask?.id_tache || (selectedTask?.date_debut ? `new-${selectedTask.date_debut}` : 'new')}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={selectedTask}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <style>
        {`
          .fc {
            --fc-border-color: ${theme.palette.divider};
            --fc-today-bg-color: ${alpha(theme.palette.primary.main, 0.08)};
            font-family: inherit;
          }
          .fc .fc-col-header-cell-cushion {
            padding: 10px 4px;
            color: ${theme.palette.text.secondary};
            font-size: 12px;
            font-weight: 900;
            text-transform: uppercase;
          }
          .fc .fc-daygrid-day-number {
            padding: 8px;
            color: ${theme.palette.text.secondary};
            font-weight: 900;
          }
          .fc .fc-daygrid-day-frame {
            min-height: 104px;
          }
          .fc .fc-daygrid-event {
            border-radius: 7px;
            padding: 3px 6px;
            font-weight: 800;
          }
          .fc-theme-standard td, .fc-theme-standard th {
            border-color: ${theme.palette.divider};
          }
        `}
      </style>
    </Box>
  );
}

function UpcomingPanel({ tasks, onTaskClick, onNewTask }) {
  return (
    <Card sx={{ height: '100%', borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Box>
            <Typography component="h2" sx={{ fontWeight: 900, fontSize: '1.25rem' }}>
              A venir
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Les prochaines taches.
            </Typography>
          </Box>
          <EventAvailableIcon sx={{ color: '#315F85' }} />
        </Stack>

        <Stack spacing={1.25}>
          {tasks.length === 0 ? (
            <Alert severity="info">Aucune tache prevue pour cette periode.</Alert>
          ) : (
            tasks.map((task) => (
              <TaskCard key={task.id_tache} task={task} onClick={() => onTaskClick(task)} compact />
            ))
          )}
        </Stack>

        <Button
          fullWidth
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => onNewTask()}
          sx={{ mt: 2, borderRadius: 2 }}
        >
          Ajouter une tache
        </Button>
      </CardContent>
    </Card>
  );
}

function MobileAgenda({ days, tasks, onTaskClick, onNewTask }) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const todayEntry = days.find(({ date }) => isSameDay(date, today)) || { date: today, tasks: [] };
  const upcomingDaysWithTasks = days.filter(({ date, tasks: dayTasks }) => (
    !isSameDay(date, today) && dayTasks.length > 0
  ));
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const dates = [];
    let cursor = calendarStart;

    while (cursor <= calendarEnd) {
      const date = cursor;
      const dayTasks = tasks.filter((task) => {
        const taskDate = getTaskDate(task);
        return taskDate && isSameDay(taskDate, date);
      });

      dates.push({
        date,
        inMonth: isSameMonth(date, today),
        isToday: isSameDay(date, today),
        hasTasks: dayTasks.length > 0,
      });
      cursor = addDays(cursor, 1);
    }

    return dates;
  }, [tasks, today]);

  return (
    <Stack spacing={1.5}>
      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: '1.15rem', textTransform: 'capitalize' }}>
                {format(today, 'MMMM yyyy', { locale: fr })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Vue rapide du mois.
              </Typography>
            </Box>
            <CalendarIcon sx={{ color: '#315F85' }} />
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: 0.75,
            }}
          >
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => (
              <Typography
                key={`${day}-${index}`}
                sx={{
                  textAlign: 'center',
                  color: 'text.secondary',
                  fontSize: '0.72rem',
                  fontWeight: 900,
                }}
              >
                {day}
              </Typography>
            ))}
            {monthDays.map(({ date, inMonth, isToday, hasTasks }) => (
              <Box
                key={date.toISOString()}
                onClick={() => onNewTask(date)}
                sx={{
                  position: 'relative',
                  display: 'grid',
                  placeItems: 'center',
                  minHeight: 38,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: isToday ? '#129B89' : '#DCE4DF',
                  backgroundColor: isToday ? '#E0F1E7' : '#FFFFFF',
                  color: inMonth ? '#17211D' : 'text.disabled',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {format(date, 'd')}
                {hasTasks && (
                  <Box
                    sx={{
                      position: 'absolute',
                      bottom: 4,
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      backgroundColor: '#A96522',
                    }}
                  />
                )}
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>

      <AgendaDayCard
        title="Aujourd'hui"
        subtitle={formatDayTitle(todayEntry.date)}
        date={todayEntry.date}
        tasks={todayEntry.tasks}
        emptyText="Aucune tache aujourd'hui."
        onTaskClick={onTaskClick}
        onNewTask={onNewTask}
      />

      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: '1.1rem' }}>
                Prochaines taches
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Seulement les jours avec quelque chose a faire.
              </Typography>
            </Box>
            <EventAvailableIcon sx={{ color: '#315F85' }} />
          </Stack>

          {upcomingDaysWithTasks.length === 0 ? (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                color: 'text.secondary',
                backgroundColor: 'grey.50',
                fontWeight: 700,
              }}
            >
              Aucune tache prevue pour les prochains jours.
            </Box>
          ) : (
            <Stack spacing={1.5}>
              {upcomingDaysWithTasks.map(({ date, tasks: dayTasks }) => (
                <Box key={date.toISOString()}>
                  <Typography sx={{ mb: 0.75, fontWeight: 900, fontSize: '0.92rem', textTransform: 'capitalize' }}>
                    {formatDayTitle(date)}
                  </Typography>
                  <Stack spacing={1}>
                    {dayTasks.map((task) => (
                      <TaskCard key={task.id_tache} task={task} onClick={() => onTaskClick(task)} />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

function AgendaDayCard({ title, subtitle, date, tasks, emptyText, onTaskClick, onNewTask }) {
  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ mb: 1.5 }}>
          <Box>
            <Typography sx={{ fontWeight: 900, fontSize: '1.1rem' }}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
              {subtitle}
            </Typography>
          </Box>
          <IconButton
            onClick={() => onNewTask(date)}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            aria-label="Ajouter une tache"
          >
            <AddIcon />
          </IconButton>
        </Stack>

        {tasks.length === 0 ? (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              color: 'text.secondary',
              backgroundColor: 'grey.50',
              fontWeight: 700,
            }}
          >
            {emptyText}
          </Box>
        ) : (
          <Stack spacing={1}>
            {tasks.map((task) => (
              <TaskCard key={task.id_tache} task={task} onClick={() => onTaskClick(task)} />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function TaskCard({ task, onClick, compact = false }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : { xs: '1fr', sm: '72px 1fr' },
        gap: 1,
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: '#DCE4DF',
        backgroundColor: '#FFFDF8',
        cursor: 'pointer',
        '&:hover': {
          borderColor: 'primary.main',
          backgroundColor: alpha('#129B89', 0.06),
        },
      }}
    >
      <Typography sx={{ color: '#129B89', fontWeight: 900, fontSize: '0.8rem' }}>
        {compact ? format(getTaskDate(task), 'dd MMM', { locale: fr }) : getTaskTimeLabel(task)}
      </Typography>
      <Box>
        <Typography sx={{ fontWeight: 900, lineHeight: 1.25 }}>
          {task.titre}
        </Typography>
        {task.description && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, lineHeight: 1.35 }}>
            {task.description}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default CalendarView;
