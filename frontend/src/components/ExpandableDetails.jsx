import { useId } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ChevronRight, ExpandMore } from '@mui/icons-material';

/** The card variant is opt-in: existing disclosure surfaces retain their layout. */
export default function ExpandableDetails({ label, children, variant = 'inline', icon, meta, headingComponent = 'span', contentSx, defaultExpanded = false }) {
  const id = useId();
  if (variant === 'card') {
    return <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0} TransitionProps={{ unmountOnExit: true }}
      sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
        borderRadius: '12px !important', overflow: 'hidden', minWidth: 0, m: 0,
        boxShadow: 'none', '&:before': { display: 'none' } }}>
      <AccordionSummary id={`${id}-header`} aria-controls={`${id}-content`}
        aria-label={typeof label === 'string' ? label : undefined}
        expandIcon={<ExpandMore fontSize="small" />}
        sx={{ px: { xs: 1.75, sm: 2 }, py: 1.5, minHeight: 60, gap: 1,
          '&.Mui-expanded': { minHeight: 60, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' },
          '&:hover': { bgcolor: 'grey.50' }, '&.Mui-focusVisible': { bgcolor: 'action.focus' },
          '& .MuiAccordionSummary-content, & .MuiAccordionSummary-content.Mui-expanded': {
            my: 0, minWidth: 0, gap: 1.5, alignItems: 'center',
          }, '& .MuiAccordionSummary-expandIconWrapper': { color: 'text.secondary', flexShrink: 0 } }}>
        {icon && <Box aria-hidden="true" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, flexShrink: 0, borderRadius: 1, color: 'primary.dark',
          bgcolor: theme => alpha(theme.palette.primary.main, 0.08), '& svg': { fontSize: 18 } }}>{icon}</Box>}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component={headingComponent} variant="body2" fontWeight={700} color="text.primary"
            sx={{ display: 'block', overflowWrap: 'anywhere' }}>{label}</Typography>
        </Box>
        {meta != null && <Typography component="span" variant="caption" color="text.secondary"
          sx={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{meta}</Typography>}
      </AccordionSummary>
      <AccordionDetails id={`${id}-content`} sx={{ p: { xs: 1.75, sm: 2.5 }, minWidth: 0, ...contentSx }}>{children}</AccordionDetails>
    </Accordion>;
  }
  return <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0} TransitionProps={{ unmountOnExit: true }}
    sx={{ bgcolor: 'transparent', '&:before': { display: 'none' }, boxShadow: 'none !important' }}>
    <AccordionSummary id={`${id}-header`} aria-controls={`${id}-content`} expandIcon={<ChevronRight />}
      sx={{ px: 0, minHeight: 44, flexDirection: 'row-reverse', gap: 0.75,
        '& .MuiAccordionSummary-content': { my: 1 },
        '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': { transform: 'rotate(90deg)' } }}>
      <Typography variant="body2" color="primary.main">{label}</Typography>
    </AccordionSummary>
    <AccordionDetails sx={{ px: 0, pb: 1 }}>{children}</AccordionDetails>
  </Accordion>;
}
