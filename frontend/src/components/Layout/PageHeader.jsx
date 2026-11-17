import { Box, Typography } from '@mui/material';

export default function PageHeader({ title, description, actions, sx = [] }) {
  return (
    <Box
      component="header"
      sx={[
        {
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          mb: 3,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 18rem' }, minWidth: 0 }}>
        <Typography
          component="h1"
          variant="h4"
          sx={{ fontSize: { xs: '1.5rem', md: '2.125rem' }, fontWeight: 800, overflowWrap: 'anywhere' }}
        >
          {title}
        </Typography>
        {description && <Typography color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>}
      </Box>
      {actions && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            width: { xs: '100%', sm: 'auto' },
            maxWidth: '100%',
            minWidth: 0,
            gap: 1,
            '& > .MuiButton-root': {
              flexGrow: { xs: 1, sm: 0 },
              maxWidth: '100%',
              minHeight: { xs: 44, sm: 'auto' },
            },
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}
