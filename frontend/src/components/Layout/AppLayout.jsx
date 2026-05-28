/**
 * AppLayout — Layout principal redesigné.
 *
 * Design: sidebar sombre et élégante, header blanc épuré,
 * navigation groupée avec sections, indicateurs d'état actif clairs.
 * Adapté mobile avec drawer temporaire.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
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
  KeyboardArrowRight as ArrowRightIcon,
} from '@mui/icons-material';
import useAuthStore from '../../store/authStore';
import { batimentService } from '../../services/productionService';

const DRAWER_WIDTH = 252;
const DRAWER_COLLAPSED = 68;

// ─── Navigation structure ─────────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: 'Aujourd\'hui',
    items: [
      { text: 'Accueil quotidien', icon: <DashboardIcon sx={{ fontSize: 20 }} />, path: '/dashboard' },
      { text: 'Calendrier', icon: <CalendarMonthIcon sx={{ fontSize: 20 }} />, path: '/calendar' },
      { text: 'Tâches', icon: <TaskIcon sx={{ fontSize: 20 }} />, path: '/tasks' },
    ],
  },
  {
    label: 'Travail terrain',
    items: [
      { text: 'Production & stock', icon: <TrendingUpIcon sx={{ fontSize: 20 }} />, path: '/production' },
      { text: 'Par bâtiment', icon: <FactoryIcon sx={{ fontSize: 20 }} />, path: '/production/batiment' },
    ],
  },
  {
    label: 'Ventes & achats',
    items: [
      { text: 'Transactions', icon: <ReceiptIcon sx={{ fontSize: 20 }} />, path: '/transactions' },
      { text: 'Clients', icon: <PeopleIcon sx={{ fontSize: 20 }} />, path: '/clients' },
      { text: 'Fournisseurs', icon: <BusinessIcon sx={{ fontSize: 20 }} />, path: '/fournisseurs' },
      { text: 'Produits', icon: <InventoryIcon sx={{ fontSize: 20 }} />, path: '/produits' },
    ],
  },
  {
    label: 'Argent',
    items: [
      { text: 'Dépenses', icon: <MoneyOffIcon sx={{ fontSize: 20 }} />, path: '/charges' },
      { text: 'Lettres de crédit', icon: <CreditCardIcon sx={{ fontSize: 20 }} />, path: '/lettres-credit' },
      { text: 'Comptes bancaires', icon: <AccountBalanceIcon sx={{ fontSize: 20 }} />, path: '/comptes-bancaires' },
      { text: 'Caisse', icon: <CreditCardIcon sx={{ fontSize: 20 }} />, path: '/caisse' },
    ],
  },
];

const isNavItemActive = (pathname, itemPath) => {
  if (pathname === itemPath) return true;
  if (itemPath === '/dashboard') return false;
  if (itemPath === '/production') return pathname === '/production' || pathname === '/production/dashboard';
  return pathname.startsWith(`${itemPath}/`);
};

// ─── Sidebar Content ──────────────────────────────────────────────────────
function SidebarContent({
  collapsed,
  onNavigate,
  location,
  batiments = [],
  productionBuildingsOpen,
  onToggleProductionBuildings,
}) {
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
              const isActive = isNavItemActive(location.pathname, item.path);
              const isProductionBuildings = item.path === '/production/batiment';
              return (
                <React.Fragment key={item.text}>
                  <ListItem disablePadding sx={{ mb: 0.25 }}>
                    <Tooltip
                      title={collapsed ? item.text : ''}
                      placement="right"
                      arrow
                    >
                      <ListItemButton
                        onClick={() => isProductionBuildings ? onToggleProductionBuildings() : onNavigate(item.path)}
                        sx={{
                          minHeight: 40,
                          borderRadius: 1.5,
                          px: collapsed ? 1 : 1.5,
                          pl: collapsed ? 1 : 2,
                          justifyContent: collapsed ? 'center' : 'flex-start',
                          backgroundColor: isActive
                            ? 'rgba(20, 184, 166, 0.18)'
                            : 'transparent',
                          overflow: 'hidden',
                          '&:hover': {
                            backgroundColor: isActive
                              ? 'rgba(20, 184, 166, 0.22)'
                              : 'rgba(255,255,255,0.06)',
                          },
                          position: 'relative',
                          '&::before': isActive ? {
                            content: '""',
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 4,
                            borderRadius: '6px 0 0 6px',
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
                          <>
                            <ListItemText
                              primary={item.text}
                              primaryTypographyProps={{
                                fontSize: '0.875rem',
                                fontWeight: isActive ? 600 : 400,
                                color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
                                noWrap: true,
                              }}
                            />
                            {isProductionBuildings && (
                              productionBuildingsOpen
                                ? <ArrowDownIcon sx={{ fontSize: 18, color: isActive ? '#14B8A6' : 'rgba(255,255,255,0.45)' }} />
                                : <ArrowRightIcon sx={{ fontSize: 18, color: isActive ? '#14B8A6' : 'rgba(255,255,255,0.45)' }} />
                            )}
                          </>
                        )}
                      </ListItemButton>
                    </Tooltip>
                  </ListItem>
                  {!collapsed && isProductionBuildings && productionBuildingsOpen && batiments.map((batiment) => {
                    const childPath = `/production/batiment/${batiment.id_batiment}`;
                    const childActive = location.pathname === childPath;
                    return (
                      <ListItem key={childPath} disablePadding sx={{ mb: 0.25 }}>
                        <ListItemButton
                          onClick={() => onNavigate(childPath)}
                          sx={{
                            minHeight: 34,
                            borderRadius: 1.5,
                            pl: 5.5,
                            pr: 1.5,
                            backgroundColor: childActive ? 'rgba(20, 184, 166, 0.14)' : 'transparent',
                            '&:hover': { backgroundColor: childActive ? 'rgba(20, 184, 166, 0.2)' : 'rgba(255,255,255,0.05)' },
                          }}
                        >
                          <ListItemText
                            primary={batiment.nom}
                            primaryTypographyProps={{
                              fontSize: '0.8125rem',
                              fontWeight: childActive ? 700 : 400,
                              color: childActive ? '#FFFFFF' : 'rgba(255,255,255,0.58)',
                              noWrap: true,
                            }}
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </React.Fragment>
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
  const [productionBuildingsOpen, setProductionBuildingsOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [batiments, setBatiments] = useState([]);
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

  useEffect(() => {
    const loadBatiments = async () => {
      try {
        const data = await batimentService.getBatiments();
        setBatiments(data || []);
      } catch {
        setBatiments([]);
      }
    };
    loadBatiments();
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith('/production/batiment')) {
      setProductionBuildingsOpen(true);
    }
  }, [location.pathname]);

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
              Gestion ferme
            </Typography>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                color: 'rgba(255,255,255,0.4)',
                lineHeight: 1,
              }}
            >
              Mode quotidien
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
          batiments={batiments}
          productionBuildingsOpen={productionBuildingsOpen}
          onToggleProductionBuildings={() => setProductionBuildingsOpen((open) => !open)}
        />
      </Box>
      {sidebarFooter}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      {/* ── AppBar ──────────────────────────────────────────────────────── */}
      <IconButton
        size="medium"
        onClick={() => setMobileOpen(true)}
        sx={{
          display: { xs: 'inline-flex', md: 'none' },
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: theme.zIndex.drawer - 1,
          width: 44,
          height: 44,
          color: '#FFFFFF',
          backgroundColor: '#0F172A',
          boxShadow: '0 14px 34px rgba(15, 23, 42, 0.22)',
          '&:hover': { backgroundColor: '#111C33' },
        }}
        aria-label="Ouvrir le menu"
      >
        <MenuIcon sx={{ fontSize: 22 }} />
      </IconButton>

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
        <Box sx={{ p: { xs: 2, sm: 2.5, md: 3 }, pt: { xs: 8, md: 3 }, maxWidth: '100%' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export default AppLayout;
