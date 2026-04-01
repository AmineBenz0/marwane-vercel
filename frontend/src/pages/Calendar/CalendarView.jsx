import React, { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import frLocale from '@fullcalendar/core/locales/fr';
import {
  Box,
  Typography,
  Paper,
  Button,
  Stack,
  useTheme,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import TaskModal from '../../components/Tasks/TaskModal';
import taskService from '../../services/taskService';
import useNotification from '../../hooks/useNotification';

function CalendarView() {
  const theme = useTheme();
  const calendarRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const notification = useNotification();

  const fetchEvents = async (start, end) => {
    try {
      const data = await taskService.getTasks({ start_date: start, end_date: end });
      const calendarEvents = data.map(task => ({
        id: task.id_tache.toString(),
        title: task.titre,
        start: task.date_debut,
        end: task.date_fin || undefined,
        allDay: task.est_toute_la_journee,
        extendedProps: { ...task },
        backgroundColor: getCategoryColor(task.categorie),
        borderColor: getCategoryColor(task.categorie),
      }));
      setEvents(calendarEvents);
    } catch (err) {
      console.error(err);
      notification.error('Erreur lors du chargement des événements');
    }
  };

  const getCategoryColor = (categorie) => {
    switch (categorie) {
      case 'travail': return theme.palette.primary.main;
      case 'personnel': return theme.palette.success.main;
      case 'rdv': return theme.palette.warning.main;
      case 'urgent': return theme.palette.error.main;
      default: return theme.palette.info.main;
    }
  };

  const handleDatesSet = (dateInfo) => {
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
      est_toute_la_journee: info.allDay
    });
    setModalOpen(true);
  };

  const handleEventDrop = async (info) => {
    try {
      const { event } = info;
      await taskService.updateTask(event.id, {
        date_debut: event.startStr,
        date_fin: event.endStr,
        est_toute_la_journee: event.allDay
      });
      notification.success('Tâche déplacée');
    } catch (err) {
      console.error(err);
      notification.error('Erreur lors du déplacement');
      info.revert();
    }
  };

  const handleSave = async (data) => {
    try {
      if (selectedTask?.id_tache) {
        await taskService.updateTask(selectedTask.id_tache, data);
        notification.success('Tâche mise à jour');
      } else {
        await taskService.createTask(data);
        notification.success('Tâche créée');
      }
      // Rafraîchir le calendrier
      const calendarApi = calendarRef.current.getApi();
      fetchEvents(calendarApi.view.activeStart.toISOString(), calendarApi.view.activeEnd.toISOString());
    } catch (err) {
      console.error(err);
      notification.error("Erreur lors de l'enregistrement");
      throw err;
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Supprimer cette tâche ?')) {
      try {
        await taskService.deleteTask(id);
        notification.success('Tâche supprimée');
        setModalOpen(false);
        const calendarApi = calendarRef.current.getApi();
        fetchEvents(calendarApi.view.activeStart.toISOString(), calendarApi.view.activeEnd.toISOString());
      } catch (err) {
        console.error(err);
        notification.error('Erreur lors de la suppression');
      }
    }
  }

  return (
    <Box sx={{ pb: 5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">Calendrier</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setSelectedTask(null); setModalOpen(true); }}>
          Nouvelle Tâche
        </Button>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          locale={frLocale}
          events={events}
          editable={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          weekends={true}
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
            hour12: false
          }}
        />
      </Paper>

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={selectedTask}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <style>
        {`
          .fc .fc-button-primary {
            background-color: ${theme.palette.primary.main};
            border-color: ${theme.palette.primary.main};
          }
          .fc .fc-button-primary:hover {
            background-color: ${theme.palette.primary.dark};
            border-color: ${theme.palette.primary.dark};
          }
          .fc .fc-button-primary:disabled {
            background-color: ${theme.palette.action.disabledBackground};
            border-color: ${theme.palette.action.disabledBackground};
          }
          .fc .fc-list-event-dot {
            border-color: ${theme.palette.primary.main};
          }
          .fc-theme-standard td, .fc-theme-standard th {
            border-color: ${theme.palette.divider};
          }
        `}
      </style>
    </Box>
  );
}

export default CalendarView;
