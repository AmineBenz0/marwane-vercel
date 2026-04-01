/**
 * Thème MUI personnalisé — Design System de l'application.
 *
 * Direction: "Refined Modern" — propre, professionnel, chaleureux.
 * Palette: Teal profond + gris ardoise + accents ambrés.
 * Typographie: Plus Jakarta Sans (claire, moderne, lisible).
 *
 * À utiliser dans main.jsx :
 *   import theme from './theme';
 *   <ThemeProvider theme={theme}> ... </ThemeProvider>
 */

import { createTheme, alpha } from '@mui/material/styles';

// ─── Palette ────────────────────────────────────────────────────────────────
const COLORS = {
  // Primary — Teal
  teal50:  '#F0FDFA',
  teal100: '#CCFBF1',
  teal200: '#99F6E4',
  teal500: '#14B8A6',
  teal600: '#0D9488',
  teal700: '#0F766E',
  teal800: '#115E59',
  teal900: '#134E4A',

  // Slate — neutrals
  slate50:  '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',

  // Amber — accents / warnings
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  amber600: '#D97706',

  // Semantic
  green500: '#22C55E',
  green600: '#16A34A',
  red500:   '#EF4444',
  red600:   '#DC2626',
  blue500:  '#3B82F6',
  blue600:  '#2563EB',
};

const theme = createTheme({
  // ── Palette ──────────────────────────────────────────────────────────────
  palette: {
    mode: 'light',
    primary: {
      light:       COLORS.teal500,
      main:        COLORS.teal600,
      dark:        COLORS.teal700,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main:        COLORS.amber500,
      dark:        COLORS.amber600,
      contrastText: COLORS.slate900,
    },
    success: {
      main:        COLORS.green500,
      dark:        COLORS.green600,
      contrastText: '#FFFFFF',
    },
    error: {
      main:        COLORS.red500,
      dark:        COLORS.red600,
      contrastText: '#FFFFFF',
    },
    info: {
      main:        COLORS.blue500,
      dark:        COLORS.blue600,
      contrastText: '#FFFFFF',
    },
    warning: {
      main:        COLORS.amber500,
      dark:        COLORS.amber600,
    },
    background: {
      default: COLORS.slate50,
      paper:   '#FFFFFF',
    },
    text: {
      primary:   COLORS.slate900,
      secondary: COLORS.slate500,
      disabled:  COLORS.slate400,
    },
    divider: COLORS.slate200,
    grey: {
      50:  COLORS.slate50,
      100: COLORS.slate100,
      200: COLORS.slate200,
      300: COLORS.slate300,
      400: COLORS.slate400,
      500: COLORS.slate500,
      600: COLORS.slate600,
      700: COLORS.slate700,
      800: COLORS.slate800,
      900: COLORS.slate900,
    },
  },

  // ── Typographie ──────────────────────────────────────────────────────────
  typography: {
    fontFamily: '"Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif',
    fontWeightLight:   300,
    fontWeightRegular: 400,
    fontWeightMedium:  500,
    fontWeightBold:    700,

    h1: { fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: COLORS.slate900 },
    h2: { fontSize: '1.875rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.015em', color: COLORS.slate900 },
    h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em', color: COLORS.slate900 },
    h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.35, color: COLORS.slate900 },
    h5: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4, color: COLORS.slate900 },
    h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5, color: COLORS.slate900 },

    subtitle1: { fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.5, color: COLORS.slate700 },
    subtitle2: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.5, color: COLORS.slate600 },

    body1: { fontSize: '0.9375rem', fontWeight: 400, lineHeight: 1.6, color: COLORS.slate700 },
    body2: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.6, color: COLORS.slate600 },

    caption: { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.5, color: COLORS.slate500 },
    overline: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.slate500 },

    button: { fontSize: '0.875rem', fontWeight: 600, letterSpacing: '0.01em', textTransform: 'none' },
  },

  // ── Shape ────────────────────────────────────────────────────────────────
  shape: {
    borderRadius: 10,
  },

  // ── Shadows ──────────────────────────────────────────────────────────────
  shadows: [
    'none',
    '0px 1px 2px rgba(15, 23, 42, 0.06)',
    '0px 1px 3px rgba(15, 23, 42, 0.08), 0px 1px 2px rgba(15, 23, 42, 0.06)',
    '0px 4px 6px -1px rgba(15, 23, 42, 0.07), 0px 2px 4px -1px rgba(15, 23, 42, 0.05)',
    '0px 10px 15px -3px rgba(15, 23, 42, 0.07), 0px 4px 6px -2px rgba(15, 23, 42, 0.04)',
    '0px 20px 25px -5px rgba(15, 23, 42, 0.07), 0px 10px 10px -5px rgba(15, 23, 42, 0.03)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.12)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.15)',
    '0px 25px 50px -12px rgba(15, 23, 42, 0.18)',
    ...Array(16).fill('0px 25px 50px -12px rgba(15, 23, 42, 0.20)'),
  ],

  // ── Component Overrides ──────────────────────────────────────────────────
  components: {

    // ── MuiCssBaseline — inject Google Font ──────────────────────────────
    MuiCssBaseline: {
      styleOverrides: `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; overflow-x: hidden; background: ${COLORS.slate50}; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${COLORS.slate100}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.slate300}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${COLORS.slate400}; }
      `,
    },

    // ── AppBar ────────────────────────────────────────────────────────────
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          borderBottom: `1px solid ${COLORS.slate200}`,
          color: COLORS.slate900,
        },
      },
    },

    // ── Drawer ────────────────────────────────────────────────────────────
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: COLORS.slate900,
          border: 'none',
          boxShadow: '4px 0 24px rgba(15, 23, 42, 0.12)',
        },
      },
    },

    // ── Card ─────────────────────────────────────────────────────────────
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${COLORS.slate200}`,
          borderRadius: 14,
          backgroundColor: '#FFFFFF',
          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
          '&:hover': {
            boxShadow: '0px 10px 25px -5px rgba(15,23,42,0.09)',
          },
        },
      },
    },

    // ── Paper ────────────────────────────────────────────────────────────
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${COLORS.slate200}`,
          borderRadius: 12,
          backgroundImage: 'none',
        },
      },
    },

    // ── Button ────────────────────────────────────────────────────────────
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
          fontSize: '0.875rem',
          padding: '8px 18px',
          transition: 'all 0.15s ease',
        },
        contained: {
          '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 4px 12px rgba(13,148,136,0.3)' },
        },
        outlined: {
          borderColor: COLORS.slate300,
          color: COLORS.slate700,
          '&:hover': { borderColor: COLORS.teal600, color: COLORS.teal600, backgroundColor: COLORS.teal50 },
        },
        text: {
          color: COLORS.slate600,
          '&:hover': { backgroundColor: COLORS.slate100 },
        },
        sizeSmall: { padding: '5px 12px', fontSize: '0.8125rem' },
        sizeLarge: { padding: '11px 24px', fontSize: '0.9375rem' },
      },
    },

    // ── IconButton ────────────────────────────────────────────────────────
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'background-color 0.15s ease',
        },
      },
    },

    // ── TextField ────────────────────────────────────────────────────────
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: '#FFFFFF',
            transition: 'box-shadow 0.15s ease',
            '& fieldset': { borderColor: COLORS.slate200 },
            '&:hover fieldset': { borderColor: COLORS.slate400 },
            '&.Mui-focused fieldset': { borderColor: COLORS.teal600, borderWidth: 1.5 },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(COLORS.teal600, 0.12)}` },
          },
          '& .MuiInputLabel-root': { color: COLORS.slate500 },
          '& .MuiInputLabel-root.Mui-focused': { color: COLORS.teal600 },
        },
      },
    },

    // ── Select ────────────────────────────────────────────────────────────
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.slate200 },
        },
      },
    },

    // ── Chip ─────────────────────────────────────────────────────────────
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          fontSize: '0.75rem',
          borderRadius: 6,
        },
      },
    },

    // ── Table ────────────────────────────────────────────────────────────
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            backgroundColor: COLORS.slate50,
            color: COLORS.slate500,
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            borderBottom: `1px solid ${COLORS.slate200}`,
            padding: '10px 16px',
          },
        },
      },
    },
    MuiTableBody: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            transition: 'background-color 0.1s ease',
            '&:hover': { backgroundColor: COLORS.slate50 },
            '&:last-child .MuiTableCell-root': { borderBottom: 'none' },
          },
          '& .MuiTableCell-root': {
            color: COLORS.slate700,
            fontSize: '0.875rem',
            borderBottom: `1px solid ${COLORS.slate100}`,
            padding: '12px 16px',
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: { borderRadius: 0, border: 'none', boxShadow: 'none' },
      },
    },

    // ── TablePagination ───────────────────────────────────────────────────
    MuiTablePagination: {
      styleOverrides: {
        root: {
          borderTop: `1px solid ${COLORS.slate200}`,
          color: COLORS.slate500,
          fontSize: '0.8125rem',
        },
        selectLabel: { fontSize: '0.8125rem' },
        displayedRows: { fontSize: '0.8125rem' },
      },
    },

    // ── Dialog ────────────────────────────────────────────────────────────
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          border: `1px solid ${COLORS.slate200}`,
          boxShadow: '0 25px 60px rgba(15,23,42,0.18)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '1.0625rem',
          fontWeight: 600,
          padding: '20px 24px 16px',
          color: COLORS.slate900,
          borderBottom: `1px solid ${COLORS.slate100}`,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: { padding: '20px 24px' },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '16px 24px',
          borderTop: `1px solid ${COLORS.slate100}`,
          gap: 8,
        },
      },
    },

    // ── Menu ─────────────────────────────────────────────────────────────
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 10,
          border: `1px solid ${COLORS.slate200}`,
          boxShadow: '0 10px 30px rgba(15,23,42,0.10)',
          minWidth: 180,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          fontWeight: 400,
          padding: '8px 14px',
          color: COLORS.slate700,
          borderRadius: 6,
          margin: '2px 6px',
          '&:hover': { backgroundColor: COLORS.slate100 },
          '&.Mui-selected': {
            backgroundColor: alpha(COLORS.teal600, 0.08),
            color: COLORS.teal700,
            fontWeight: 500,
            '&:hover': { backgroundColor: alpha(COLORS.teal600, 0.12) },
          },
        },
      },
    },

    // ── Tooltip ───────────────────────────────────────────────────────────
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: COLORS.slate800,
          color: '#FFFFFF',
          fontSize: '0.75rem',
          borderRadius: 6,
          padding: '5px 10px',
        },
        arrow: { color: COLORS.slate800 },
      },
    },

    // ── Avatar ────────────────────────────────────────────────────────────
    MuiAvatar: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          fontWeight: 600,
        },
      },
    },

    // ── Alert ────────────────────────────────────────────────────────────
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontSize: '0.875rem',
          border: '1px solid',
        },
        standardError: {
          backgroundColor: '#FFF5F5',
          borderColor: '#FED7D7',
          color: COLORS.red600,
        },
        standardSuccess: {
          backgroundColor: '#F0FFF4',
          borderColor: '#C6F6D5',
          color: COLORS.green600,
        },
        standardWarning: {
          backgroundColor: '#FFFBEB',
          borderColor: '#FDE68A',
          color: COLORS.amber600,
        },
        standardInfo: {
          backgroundColor: '#EBF8FF',
          borderColor: '#BEE3F8',
          color: COLORS.blue600,
        },
      },
    },

    // ── Divider ───────────────────────────────────────────────────────────
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: COLORS.slate200 },
      },
    },

    // ── ListItemButton ────────────────────────────────────────────────────
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'all 0.15s ease',
        },
      },
    },

    // ── Tabs ─────────────────────────────────────────────────────────────
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          color: COLORS.slate500,
          '&.Mui-selected': { color: COLORS.teal600, fontWeight: 600 },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: COLORS.teal600, borderRadius: 2 },
      },
    },

    // ── Badge ─────────────────────────────────────────────────────────────
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontSize: '0.6875rem',
          fontWeight: 700,
          minWidth: 18,
          height: 18,
          borderRadius: 9,
        },
      },
    },
  },
});

export default theme;
