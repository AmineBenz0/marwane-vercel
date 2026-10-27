import { useId } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ExpandMore, InfoOutlined } from '@mui/icons-material';

export default function ExpandableDetails({
  label, children, icon = <InfoOutlined fontSize="small" />, description, meta,
  headingComponent = 'span', expanded, onChange, defaultExpanded = false,
  sx, contentSx, id: providedId,
}) {
  const generatedId = useId();
  const id = providedId || generatedId;
  return <Accordion disableGutters elevation={0} expanded={expanded} onChange={onChange}
    defaultExpanded={defaultExpanded} TransitionProps={{ unmountOnExit: true }}
    sx={[
      { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '12px !important',
        overflow: 'hidden', minWidth: 0, m: 0, flexShrink: 0, boxShadow: 'none', '&:before': { display: 'none' },
        '& + .MuiAccordion-root': { mt: 1.5 } },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}>
    <AccordionSummary id={`${id}-header`} aria-controls={`${id}-content`}
      aria-label={typeof label === 'string' ? label : undefined}
      aria-describedby={meta != null ? `${id}-meta` : undefined}
      expandIcon={<ExpandMore fontSize="small" />}
      sx={{ px: { xs: 1.75, sm: 2 }, py: 1.5, minHeight: 60, gap: 1,
        '&.Mui-expanded': { minHeight: 60, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' },
        '&:hover': { bgcolor: 'grey.50' }, '&.Mui-focusVisible': { bgcolor: 'action.focus' },
        '& .MuiAccordionSummary-content, & .MuiAccordionSummary-content.Mui-expanded': { my: 0, minWidth: 0, gap: 1.5, alignItems: 'center' },
        '& .MuiAccordionSummary-expandIconWrapper': { color: 'text.secondary', flexShrink: 0 } }}>
      {icon && <Box aria-hidden="true" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, flexShrink: 0,
        borderRadius: 1, color: 'primary.dark', bgcolor: theme => alpha(theme.palette.primary.main, 0.08), '& svg': { fontSize: 18 } }}>{icon}</Box>}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography component={headingComponent} variant="body2" fontWeight={700} color="text.primary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{label}</Typography>
        {description && <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, overflowWrap: 'anywhere' }}>{description}</Typography>}
      </Box>
      {meta != null && <Box id={`${id}-meta`} sx={{ flexShrink: 0, maxWidth: '35%', color: 'text.secondary', fontSize: '0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{meta}</Box>}
    </AccordionSummary>
    <AccordionDetails id={`${id}-content`} sx={[{ p: { xs: 2, sm: 2.5 }, minWidth: 0, bgcolor: 'background.paper' }, ...(Array.isArray(contentSx) ? contentSx : [contentSx])]}>{children}</AccordionDetails>
  </Accordion>;
}
