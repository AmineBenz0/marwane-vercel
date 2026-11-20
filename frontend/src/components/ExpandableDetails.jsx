import { useId, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Box, ButtonBase, Collapse, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ExpandMore } from '@mui/icons-material';

/** The card variant is opt-in: existing disclosure surfaces retain their layout. */
export default function ExpandableDetails({ label, children, variant = 'inline', icon, meta, description, headingComponent = 'span', contentSx, defaultExpanded = false, expanded, onChange, sx }) {
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
  return <InlineDetails id={id} label={label} description={description} icon={icon} meta={meta}
    defaultExpanded={defaultExpanded} expanded={expanded} onChange={onChange} sx={sx} contentSx={contentSx}>{children}</InlineDetails>;
}

/**
 * Inline disclosure: a small "Voir …" link with a chevron; the content opens in a soft grey panel.
 * Used for secondary details (stock by date, origin of the stock, history) so they never
 * compete with the main information.
 */
function InlineDetails({ id, label, description, icon, meta, defaultExpanded, expanded, onChange, sx, contentSx, children }) {
  const [localOpen, setLocalOpen] = useState(defaultExpanded);
  const open = expanded ?? localOpen;
  const toggle = (event) => {
    if (expanded === undefined) setLocalOpen(!open);
    onChange?.(event, !open);
  };
  return <Box sx={{ minWidth: 0, ...sx }}>
    <ButtonBase id={`${id}-header`} aria-expanded={open} aria-controls={`${id}-content`} onClick={toggle}
      aria-label={meta != null && typeof label === 'string' ? label : undefined}
      aria-describedby={meta != null ? `${id}-meta` : undefined}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%', py: 0.5, px: 0.75, mx: -0.75,
        borderRadius: 1, color: 'primary.dark', textAlign: 'left',
        '&:hover': { bgcolor: 'action.hover' }, '&.Mui-focusVisible': { bgcolor: 'action.focus' } }}>
      {icon && <Box aria-hidden="true" sx={{ display: 'flex', color: 'text.secondary', '& svg': { fontSize: 18 } }}>{icon}</Box>}
      <Typography component="span" variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{label}</Typography>
      {meta != null && <Typography id={`${id}-meta`} component="span" variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>· {meta}</Typography>}
      <ExpandMore aria-hidden="true" fontSize="small"
        sx={{ flexShrink: 0, transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }} />
    </ButtonBase>
    {description && <Typography variant="caption" color="text.secondary" display="block">{description}</Typography>}
    <Collapse in={open} unmountOnExit>
      <Box id={`${id}-content`} role="region" aria-labelledby={`${id}-header`}
        sx={{ mt: 0.75, p: { xs: 1.25, sm: 1.5 }, borderRadius: 1.5, bgcolor: 'grey.50', minWidth: 0, ...contentSx }}>
        {children}
      </Box>
    </Collapse>
  </Box>;
}
