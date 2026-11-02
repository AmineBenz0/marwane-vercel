import { useId, useState } from 'react';
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import { AccountBalanceWalletOutlined, MoreVert } from '@mui/icons-material';

export default function PartyCreditMenu({ onOpen }) {
  const [anchor, setAnchor] = useState(null);
  const id = useId();
  return <>
    <Tooltip title="Autres actions"><IconButton aria-label="Autres actions" aria-haspopup="menu" aria-expanded={anchor ? 'true' : undefined} aria-controls={anchor ? id : undefined}
      onClick={event => setAnchor(event.currentTarget)} sx={{ alignSelf: 'center', border: 1, borderColor: 'divider', borderRadius: 2 }}><MoreVert /></IconButton></Tooltip>
    <Menu id={id} anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
      <MenuItem onClick={() => { setAnchor(null); onOpen(); }}><ListItemIcon><AccountBalanceWalletOutlined fontSize="small" /></ListItemIcon><ListItemText>Avances et crédits</ListItemText></MenuItem>
    </Menu>
  </>;
}
