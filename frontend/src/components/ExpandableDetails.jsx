import { useId } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Typography } from '@mui/material';
import { ChevronRight } from '@mui/icons-material';

export default function ExpandableDetails({ label, children }) {
  const id = useId();
  return <Accordion disableGutters elevation={0} TransitionProps={{ unmountOnExit: true }}
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
