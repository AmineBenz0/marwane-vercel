/**
 * AppLayout — Layout principal redesigné.
 *
 * Design: sidebar sombre et élégante, header blanc épuré,
 * navigation groupée avec sections, indicateurs d'état actif clairs.
 * Adapté mobile avec drawer temporaire.
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  useTheme,
  useMediaQuery,
  alpha,
  Collapse,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Receipt as ReceiptIcon,
  People as PeopleIcon,
  Business as BusinessIcon,
  Inventory as InventoryIcon,
  AccountBalance as AccountBalanceIcon,
  Logout as LogoutIcon,
  CreditCard as CreditCardIcon,
  Factory as FactoryIcon,
  MoneyOff as MoneyOffIcon,
  TrendingUp as TrendingUpIcon,
  CalendarMonth as CalendarMonthIcon,
  Task as TaskIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  KeyboardArrowDown as ArrowDownIcon,
  NotificationsNoneOutlined as BellIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import useAuthStore from '../../store/authStore';

const DRAWER_WIDTH = 252;
const DRAWER_COLLAPSED = 68;

// ─── Navigation structure ─────────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: 'Vue d\'ensemble',
    items: [
      { text: 'Tableau de bord', icon: <DashboardIcon sx={{ fontSize: 20 }} />, path: '/dashboard' },
      { text: 'Calendrier', icon: <CalendarMonthIcon sx={{ fontSize: 20 }} />, path: '/calendar' },
      { text: 'Tâches', icon: <TaskIcon sx={{ fontSize: 20 }} />, path: '/tasks' },
    ],
  },
  {
    label: 'Production',
    items: [
      { text: 'Vue globale', icon: <TrendingUpIcon sx={{ fontSize: 20 }} />, path: '/production/dashboard' },
      { text: 'Productions', icon: <FactoryIcon sx={{ fontSize: 20 }} />, path: '/production' },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { text: 'Transactions', icon: <ReceiptIcon sx={{ fontSize: 20 }} />, path: '/transactions' },
      { text: 'Clients', icon: <PeopleIcon sx={{ fontSize: 20 }} />, path: '/clients' },
      { text: 'Fournisseurs', icon: <BusinessIcon sx={{ fontSize: 20 }} />, path: '/fournisseurs' },
      { text: 'Produits', icon: <InventoryIcon sx={{ fontSize: 20 }} />, path: '/produits' },
    ],
  },
  {
    label: 'Finances',
    items: [
      { text: 'Dépenses', icon: <MoneyOffIcon sx={{ fontSize: 20 }} />, path: '/charges' },
      { text: 'Lettres de crédit', icon: <CreditCardIcon sx={{ fontSize: 20 }} />, path: '/lettres-credit' },
      { text: 'Comptes bancaires', icon: <AccountBalanceIcon sx={{ fontSize: 20 }} />, path: '/comptes-bancaires' },
      { text: 'Caisse', icon: <CreditCardIcon sx={{ fontSize: 20 }} />, path: '/caisse' },
    ],
  },
];

// Get a friendly page title from the current path
const getPageTitle = (pathname) => {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.path === pathname) return item.text;
    }
  }
  return 'Application';
};

// ─── Sidebar Content ──────────────────────────────────────────────────────
function SidebarContent({ collapsed, onNavigate, location }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', py: 1 }}>
      {NAV_SECTIONS.map((section, sIndex) => (
        <Box key={sIndex} sx={{ mb: 0.5 }}>
          {/* Section label — hidden when collapsed */}
          {!collapsed && (
            <Typography
              variant="overline"
              sx={{
                display: 'block',
                px: 2.5,
                pt: sIndex === 0 ? 0.5 : 1.5,
                pb: 0.5,
                color: 'rgba(255,255,255,0.28)',
                fontSize: '0.6375rem',
                letterSpacing: '0.09em',
                fontWeight: 600,
              }}
            >
              {section.label}
            </Typography>
          )}
          {collapsed && sIndex > 0 && (
            <Divider sx={{ mx: 1.5, my: 1, borderColor: 'rgba(255,255,255,0.07)' }} />
          )}

          <List dense disablePadding sx={{ px: 1 }}>
            {section.items.map((item) => {
              const isActive = location.pathname === item.path ||
                (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
              return (
                <ListItem key={item.text} disablePadding sx={{ mb: 0.25 }}>
                  <Tooltip
                    title={collapsed ? item.text : ''}
                    placement="right"
                    arrow
                  >
                    <ListItemButton
                      onClick={() => onNavigate(item.path)}
                      sx={{
                        minHeight: 40,
                        borderRadius: 1.5,
                        px: collapsed ? 1 : 1.5,
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        backgroundColor: isActive
                          ? 'rgba(20, 184, 166, 0.18)'
                          : 'transparent',
                        '&:hover': {
                          backgroundColor: isActive
                            ? 'rgba(20, 184, 166, 0.22)'
                            : 'rgba(255,255,255,0.06)',
                        },
                        // Left accent bar for active item
                        position: 'relative',
                        '&::before': isActive ? {
                          content: '""',
                          position: 'absolute',
                          left: 0,
                          top: '20%',
                          height: '60%',
                          width: 3,
                          borderRadius: '0 2px 2px 0',
                          backgroundColor: '#14B8A6',
                        } : {},
                      }}
                    >
                      <ListItemIcon
                        sx={{
                          minWidth: 0,
                          mr: collapsed ? 0 : 1.5,
                          color: isActive ? '#14B8A6' : 'rgba(255,255,255,0.5)',
                          transition: 'color 0.15s',
                        }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      {!collapsed && (
                        <ListItemText
                          primary={item.text}
                          primaryTypographyProps={{
                            fontSize: '0.875rem',
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
                            noWrap: true,
                          }}
                        />
                      )}
                    </ListItemButton>
                  </Tooltip>
                </ListItem>
              );
            })}
          </List>
        </Box>
      ))}
    </Box>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────
function AppLayout({ children }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const effectiveWidth = isMobile ? 0 : (collapsed ? DRAWER_COLLAPSED : DRAWER_WIDTH);

  const handleNavigate = (path) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    setAnchorEl(null);
    navigate('/login');
  };

  const userInitials = user?.email
    ? user.email.split('@')[0].slice(0, 2).toUpperCase()
    : 'U';

  const pageTitle = getPageTitle(location.pathname);

  // ── Sidebar Header (logo area) ───────────────────────────────────────
  const sidebarHeader = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed && !isMobile ? 'center' : 'space-between',
        px: collapsed && !isMobile ? 1 : 2,
        py: 1.5,
        minHeight: 64,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {(!collapsed || isMobile) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Logo mark */}
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AccountBalanceIcon sx={{ fontSize: 18, color: '#fff' }} />
          </Box>
          <Box>
            <Typography
              sx={{
                fontSize: '0.9375rem',
                fontWeight: 700,
                color: '#FFFFFF',
                lineHeight: 1.2,
              }}
            >
              Comptabilité
            </Typography>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                color: 'rgba(255,255,255,0.4)',
                lineHeight: 1,
              }}
            >
              Gestion financière
            </Typography>
          </Box>
        </Box>
      )}
      {collapsed && !isMobile && (
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AccountBalanceIcon sx={{ fontSize: 20, color: '#fff' }} />
        </Box>
      )}
      {/* Collapse toggle — desktop only */}
      {!isMobile && (
        <IconButton
          onClick={() => setCollapsed(!collapsed)}
          size="small"
          sx={{
            color: 'rgba(255,255,255,0.4)',
            '&:hover': { color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' },
            ml: collapsed ? 0 : 'auto',
          }}
        >
          {collapsed
            ? <ChevronRightIcon sx={{ fontSize: 18 }} />
            : <ChevronLeftIcon sx={{ fontSize: 18 }} />
          }
        </IconButton>
      )}
    </Box>
  );

  // ── Sidebar footer (user info) ────────────────────────────────────────
  const sidebarFooter = (
    <Box
      sx={{
        p: collapsed ? 1 : 1.5,
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1,
          borderRadius: 2,
          cursor: 'pointer',
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
        onClick={(e) => setAnchorEl(e.currentTarget)}
      >
        <Avatar
          sx={{
            width: 34,
            height: 34,
            fontSize: '0.75rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
            flexShrink: 0,
          }}
        >
          {userInitials}
        </Avatar>
        {!collapsed && (
          <Box sx={{ overflow: 'hidden', flex: 1 }}>
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#FFFFFF',
                noWrap: true,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.email?.split('@')[0] || 'Utilisateur'}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                color: 'rgba(255,255,255,0.4)',
                textTransform: 'capitalize',
              }}
            >
              {user?.role || 'Utilisateur'}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {sidebarHeader}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', mt: 1 }}>
        <SidebarContent
          collapsed={collapsed && !isMobile}
          onNavigate={handleNavigate}
          location={location}
        />
      </Box>
      {sidebarFooter}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      {/* ── AppBar ──────────────────────────────────────────────────────── */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${effectiveWidth}px)` },
          ml: { md: `${effectiveWidth}px` },
          transition: theme.transitions.create(['width', 'margin'], {
            duration: theme.transitions.duration.standard,
          }),
          zIndex: theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ gap: 1, minHeight: '64px !important', px: { xs: 2, md: 3 } }}>
          {/* Mobile burger */}
          <IconButton
            size="small"
            onClick={() => setMobileOpen(true)}
            sx={{
              display: { md: 'none' },
              color: 'text.secondary',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <MenuIcon sx={{ fontSize: 20 }} />
          </IconButton>

          {/* Page title */}
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                fontSize: { xs: '1rem', sm: '1.125rem' },
                color: 'text.primary',
              }}
            >
              {pageTitle}
            </Typography>
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {/* User menu */}
            <Box
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 0.75,
                borderRadius: 2,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: 'divider',
                transition: 'all 0.15s',
                '&:hover': { borderColor: 'primary.main', backgroundColor: 'grey.50' },
              }}
            >
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
                }}
              >
                {userInitials}
              </Avatar>
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
                  {user?.email?.split('@')[0] || 'Utilisateur'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>
                  {user?.role || 'utilisateur'}
                </Typography>
              </Box>
              <ArrowDownIcon sx={{ fontSize: 16, color: 'text.secondary', display: { xs: 'none', sm: 'block' } }} />
            </Box>
          </Box>
        </Toolbar>
      </AppBar>

      {/* ── User menu ───────────────────────────────────────────────────── */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { mt: 1 } } }}
      >
        <Box sx={{ px: 1.5, py: 1, mb: 0.5 }}>
          <Typography variant="body2" fontWeight={600} color="text.primary">
            {user?.email}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
            Rôle : {user?.role || 'utilisateur'}
          </Typography>
        </Box>
        <Divider sx={{ mx: 1, mb: 0.5 }} />
        <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <LogoutIcon sx={{ fontSize: 18, color: 'error.main' }} />
          </ListItemIcon>
          <ListItemText
            primary="Se déconnecter"
            primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: 'error.main' }}
          />
        </MenuItem>
      </Menu>

      {/* ── Sidebar — mobile (temporary) ────────────────────────────────── */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            background: '#0F172A',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* ── Sidebar — desktop (permanent) ───────────────────────────────── */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: effectiveWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: collapsed ? DRAWER_COLLAPSED : DRAWER_WIDTH,
            boxSizing: 'border-box',
            background: '#0F172A',
            overflowX: 'hidden',
            transition: theme.transitions.create('width', {
              duration: theme.transitions.duration.standard,
            }),
          },
        }}
        open
      >
        {drawerContent}
      </Drawer>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: '100vh',
          backgroundColor: 'background.default',
          transition: theme.transitions.create('margin', {
            duration: theme.transitions.duration.standard,
          }),
        }}
      >
        <Toolbar sx={{ minHeight: '64px !important' }} />
        <Box sx={{ p: { xs: 2, sm: 2.5, md: 3 }, maxWidth: '100%' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export default AppLayout;
