/**
 * Layout principal de l'application.
 * 
 * Composant qui fournit la structure de base de l'application avec :
 * - Sidebar de navigation (responsive)
 * - Header avec informations utilisateur
 * - Zone de contenu principal
 * 
 * Utilise Material-UI pour le design et la responsivité.
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
  Security as SecurityIcon,
  Logout as LogoutIcon,
  CreditCard as CreditCardIcon,
  Factory as FactoryIcon,
  MoneyOff as MoneyOffIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import useAuthStore from '../../store/authStore';

const drawerWidth = 240;

/**
 * Configuration des éléments de navigation.
 * Chaque élément contient :
 * - text: Le libellé affiché dans le menu
 * - icon: L'icône Material-UI
 * - path: Le chemin de la route
 * - adminOnly: Si true, visible uniquement pour les admins
 */
const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'Stats Production', icon: <TrendingUpIcon />, path: '/production/dashboard' },
  { text: 'Production', icon: <FactoryIcon />, path: '/production' },
  { text: 'Transactions', icon: <ReceiptIcon />, path: '/transactions' },
  { text: 'Clients', icon: <PeopleIcon />, path: '/clients' },
  { text: 'Fournisseurs', icon: <BusinessIcon />, path: '/fournisseurs' },
  { text: 'Produits', icon: <InventoryIcon />, path: '/produits' },
  { text: 'Dépenses', icon: <MoneyOffIcon />, path: '/charges' },
  { text: 'LC', icon: <CreditCardIcon />, path: '/lettres-credit' },
  { text: 'Banques', icon: <AccountBalanceIcon />, path: '/comptes-bancaires' },
  { text: 'Caisse', icon: <CreditCardIcon />, path: '/caisse' },
  { text: 'Audit', icon: <SecurityIcon />, path: '/audit', adminOnly: true },
];

/**
 * Composant AppLayout.
 * 
 * @param {React.ReactNode} children - Le contenu à afficher dans la zone principale
 */
function AppLayout({ children }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [anchorEl, setAnchorEl] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const effectiveDrawerWidth = !isMobile && sidebarOpen ? drawerWidth : 0;

  /**
   * Gère l'ouverture/fermeture du drawer sur mobile.
   */
  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setSidebarOpen(!sidebarOpen);
    }
  };

  /**
   * Gère l'ouverture du menu utilisateur.
   */
  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  /**
   * Gère la fermeture du menu utilisateur.
   */
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  /**
   * Gère la déconnexion de l'utilisateur.
   */
  const handleLogout = () => {
    logout();
    handleMenuClose();
    navigate('/login');
  };

  /**
   * Gère la navigation vers une route.
   */
  const handleNavigation = (path) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  /**
   * Filtre les éléments de menu selon le rôle de l'utilisateur.
   */
  const filteredMenuItems = menuItems.filter(
    (item) => !item.adminOnly || user?.role === 'admin'
  );

  /**
   * Composant du drawer (sidebar).
   */
  const drawer = (
    <Box>
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
          minHeight: '64px !important',
        }}
      >
        <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600 }}>
          Comptabilité
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {filteredMenuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={isActive}
                onClick={() => handleNavigation(item.path)}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.primary.main,
                    color: theme.palette.primary.contrastText,
                    '&:hover': {
                      backgroundColor: theme.palette.primary.dark,
                    },
                    '& .MuiListItemIcon-root': {
                      color: theme.palette.primary.contrastText,
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: isActive
                      ? theme.palette.primary.contrastText
                      : 'inherit',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* AppBar (Header) */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${effectiveDrawerWidth}px)` },
          ml: { md: `${effectiveDrawerWidth}px` },
          zIndex: theme.zIndex.drawer + 1,
          transition: theme.transitions.create(['width', 'margin'], {
            duration: theme.transitions.duration.shorter,
          }),
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {menuItems.find((item) => item.path === location.pathname)?.text ||
              'Application'}
          </Typography>
          {/* Menu utilisateur */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {user?.email}
            </Typography>
            <IconButton
              onClick={handleMenuOpen}
              size="small"
              sx={{ ml: 2 }}
              aria-controls={anchorEl ? 'user-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={anchorEl ? 'true' : undefined}
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </Avatar>
            </IconButton>
            <Menu
              id="user-menu"
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              MenuListProps={{
                'aria-labelledby': 'user-button',
              }}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem disabled>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {user?.email}
                </Typography>
              </MenuItem>
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  Rôle: {user?.role || 'Utilisateur'}
                </Typography>
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Déconnexion</ListItemText>
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Drawer (Sidebar) */}
      <Box
        component="nav"
        sx={{
          width: { md: sidebarOpen ? `${drawerWidth}px` : 0 },
          flexShrink: { md: 0 },
          transition: theme.transitions.create('width', {
            duration: theme.transitions.duration.shorter,
          }),
        }}
        aria-label="navigation menu"
      >
        {/* Drawer mobile (temporaire) */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Meilleure performance sur mobile
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>
        {/* Drawer desktop (permanent) */}
        <Drawer
          variant="persistent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
          open={sidebarOpen}
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Zone de contenu principal */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 2.5, md: 3 },
          width: { md: `calc(100% - ${effectiveDrawerWidth}px)` },
          minHeight: '100vh',
          backgroundColor: theme.palette.background.default,
          transition: theme.transitions.create('width', {
            duration: theme.transitions.duration.shorter,
          }),
          overflowX: 'hidden', // Empêcher le scroll horizontal
        }}
      >
        <Toolbar /> {/* Espace pour l'AppBar fixe */}
        {children}
      </Box>
    </Box>
  );
}

export default AppLayout;

