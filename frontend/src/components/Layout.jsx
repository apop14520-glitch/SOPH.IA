import React,{useContext,useEffect,useState} from 'react'
import {Avatar,Box,Dialog,DialogContent,Divider,Drawer,IconButton,InputAdornment,List,ListItemButton,ListItemIcon,ListItemText,Menu,MenuItem,TextField,Tooltip,Typography,useTheme} from '@mui/material'
import {Add,ChevronRight,Close,DarkMode,HelpOutline,LightMode,Logout,MenuOpen,Search,Settings} from '@mui/icons-material'
import {useLocation,useNavigate} from 'react-router-dom'
import {api} from '../api'
import {ColorModeContext} from '../theme'
import {loadLocalChats} from '../chatStorage'

const wide=268,compact=72
const displayTitle=value=>{const short=String(value||'Nova conversa').replace(/\s+/g,' ').trim().slice(0,64).toLocaleLowerCase('pt-BR'),acronyms=/\b(soph\.?ia|soph|etp|tr|rilc|sei|ti|rh|pdf|docx|ia)\b/gi;return(short.charAt(0).toLocaleUpperCase('pt-BR')+short.slice(1)).replace(acronyms,word=>word.toLocaleUpperCase('pt-BR').replace('SOPHIA','SOPH.IA'))}
export default function Layout({children,user,onLogout}){
 const nav=useNavigate(),loc=useLocation(),theme=useTheme(),{mode,toggle}=useContext(ColorModeContext)
 const [chats,setChats]=useState([]),[collapsed,setCollapsed]=useState(()=>localStorage.getItem('sophia_sidebar')==='collapsed')
 const [searchOpen,setSearchOpen]=useState(false),[helpOpen,setHelpOpen]=useState(false),[query,setQuery]=useState(''),[results,setResults]=useState([]),[accountAnchor,setAccountAnchor]=useState(null)
 const width=collapsed?compact:wide
 useEffect(()=>{const refresh=()=>api.get('/conversations').then(r=>setChats(r.data)).catch(()=>setChats([]));refresh();window.addEventListener('sophia-conversations-changed',refresh);return()=>window.removeEventListener('sophia-conversations-changed',refresh)},[loc.pathname])
 useEffect(()=>{if(!query.trim()){setResults([]);return}let active=true;Promise.all(chats.map(c=>c.messages?Promise.resolve(c):api.get(`/conversations/${c.id}`).then(r=>r.data).catch(()=>null))).then(data=>{if(!active)return;const term=query.toLowerCase();setResults(data.filter(Boolean).filter(c=>c.title.toLowerCase().includes(term)||c.messages?.some(m=>m.content.toLowerCase().includes(term))))});return()=>{active=false}},[query,chats])
 const toggleSidebar=()=>setCollapsed(value=>{localStorage.setItem('sophia_sidebar',!value?'collapsed':'open');return!value})
 const newChat=()=>{window.dispatchEvent(new Event('sophia-new-chat'));nav('/')}
 const item=(icon,label,action,selected=false)=><Tooltip title={collapsed?label:''} placement="right"><ListItemButton onClick={action} selected={selected} sx={{borderRadius:2,minHeight:42,px:collapsed?1.4:2,justifyContent:collapsed?'center':'flex-start'}}><ListItemIcon sx={{minWidth:collapsed?0:36,justifyContent:'center'}}>{icon}</ListItemIcon>{!collapsed&&<ListItemText primary={label}/>}</ListItemButton></Tooltip>
 return <Box sx={{display:'flex'}}>
  <Box component="header" sx={{position:'fixed',top:0,left:width,right:0,height:72,zIndex:1250,display:'flex',alignItems:'center',justifyContent:'center',borderBottom:`1px solid ${theme.palette.divider}`,bgcolor:'background.paper',transition:'left .2s'}}>
   <Box sx={{width:360,height:60,backgroundImage:'url(/soph-logo-compact.jpg)',backgroundSize:'contain',backgroundRepeat:'no-repeat',backgroundPosition:'center',borderRadius:1}} aria-label="Porto de Porto Velho"/>
  </Box>
  <Drawer variant="permanent" sx={{width,flexShrink:0,transition:'width .2s','& .MuiDrawer-paper':{width,boxSizing:'border-box',transition:'width .2s',overflowX:'hidden',background:mode==='dark'?'#17120f':'#fff8f3',borderRight:`1px solid ${theme.palette.divider}`}}}>
   <Box sx={{height:'100%',display:'flex',flexDirection:'column',p:1.2}}>
    <Box display="flex" alignItems="center" justifyContent={collapsed?'center':'space-between'} px={collapsed?0:1} py={.5}>
     {!collapsed&&<Typography component="button" onClick={()=>nav('/')} fontWeight={900} fontSize={20} color="primary" sx={{border:0,background:'none',p:0,cursor:'pointer','&:hover':{opacity:.78}}}>SOPH.IA</Typography>}
     <Box display="flex">{!collapsed&&<Tooltip title="Pesquisar conversas"><IconButton size="small" onClick={()=>setSearchOpen(true)}><Search/></IconButton></Tooltip>}<Tooltip title={collapsed?'Expandir menu':'Encolher menu'}><IconButton size="small" onClick={toggleSidebar}><MenuOpen sx={{transform:collapsed?'rotate(180deg)':'none'}}/></IconButton></Tooltip></Box>
    </Box>
    <List dense sx={{mt:1}}>{item(<Add/>,'Novo chat',newChat,loc.pathname==='/')}{collapsed&&item(<Search/>,'Pesquisar conversas',()=>setSearchOpen(true))}</List>
    <Box sx={{flex:1,overflowY:'auto',mt:1}}>
     {!collapsed&&!!chats.length&&<Typography variant="caption" color="text.secondary" px={1.5}>Conversas</Typography>}
     <List dense>{chats.map(chat=>item(<Box sx={{width:6,height:6,borderRadius:'50%',bgcolor:'secondary.main'}}/>,displayTitle(chat.title),()=>nav(`/chat/${chat.id}`),loc.pathname===`/chat/${chat.id}`))}</List>
    </Box>
    <Divider sx={{my:1}}/>
    <Tooltip title={collapsed?'Abrir opções da conta':''} placement="right"><Box component="button" onClick={e=>setAccountAnchor(e.currentTarget)} sx={{width:'100%',display:'flex',alignItems:'center',justifyContent:collapsed?'center':'flex-start',gap:1.2,p:1,border:0,borderRadius:2,bgcolor:accountAnchor?'action.selected':'transparent',color:'text.primary',cursor:'pointer',textAlign:'left','&:hover':{bgcolor:'action.hover'}}}><Avatar sx={{width:34,height:34,bgcolor:'primary.main',flex:'0 0 auto'}}>{user.name?.[0]?.toUpperCase()||'U'}</Avatar>{!collapsed&&<><Box minWidth={0} flex={1}><Typography variant="body2" noWrap fontWeight={750}>{user.name}</Typography><Typography variant="caption" color="text.secondary">{user.role}</Typography></Box><ChevronRight fontSize="small" sx={{color:'text.secondary'}}/></>}</Box></Tooltip>
   </Box>
  </Drawer>
  <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={()=>setAccountAnchor(null)} anchorOrigin={{vertical:'top',horizontal:'left'}} transformOrigin={{vertical:'bottom',horizontal:'left'}} slotProps={{paper:{sx:{width:248,mb:1.2,p:.7,borderRadius:3,border:'1px solid',borderColor:'divider',boxShadow:'0 12px 32px rgba(0,0,0,.28)'}}}}>
   <Box display="flex" alignItems="center" gap={1.2} px={1.2} py={1}><Avatar sx={{width:34,height:34,bgcolor:'primary.main'}}>{user.name?.[0]?.toUpperCase()||'U'}</Avatar><Box minWidth={0} flex={1}><Typography variant="body2" fontWeight={750} noWrap>{user.name}</Typography><Typography variant="caption" color="text.secondary">{user.role}</Typography></Box></Box>
   <Divider sx={{my:.6}}/>
   {['admin','gerente'].includes(user.role)&&<MenuItem onClick={()=>{setAccountAnchor(null);nav('/admin')}} selected={loc.pathname==='/admin'} sx={{borderRadius:2}}><ListItemIcon><Settings fontSize="small"/></ListItemIcon><ListItemText>Administração</ListItemText></MenuItem>}
   <MenuItem onClick={()=>{toggle();setAccountAnchor(null)}} sx={{borderRadius:2}}><ListItemIcon>{mode==='dark'?<LightMode fontSize="small"/>:<DarkMode fontSize="small"/>}</ListItemIcon><ListItemText>{mode==='dark'?'Tema claro':'Tema escuro'}</ListItemText></MenuItem>
   <MenuItem onClick={()=>{setAccountAnchor(null);setHelpOpen(true)}} sx={{borderRadius:2}}><ListItemIcon><HelpOutline fontSize="small"/></ListItemIcon><ListItemText>Ajuda</ListItemText></MenuItem>
   <Divider sx={{my:.6}}/>
   <MenuItem onClick={()=>{setAccountAnchor(null);onLogout()}} sx={{borderRadius:2}}><ListItemIcon><Logout fontSize="small"/></ListItemIcon><ListItemText>Sair</ListItemText></MenuItem>
  </Menu>
  <Box component="main" sx={{flexGrow:1,p:loc.pathname==='/'||loc.pathname.startsWith('/chat/')?3:4,pt:'96px',minHeight:'100vh',maxWidth:`calc(100% - ${width}px)`,backgroundColor:'background.default',transition:'max-width .2s'}}>{children}</Box>
  <Dialog open={searchOpen} onClose={()=>setSearchOpen(false)} fullWidth maxWidth="sm"><DialogContent><Box display="flex" alignItems="center" gap={1} mb={2}><TextField autoFocus fullWidth placeholder="Pesquisar nas conversas..." value={query} onChange={e=>setQuery(e.target.value)} InputProps={{startAdornment:<InputAdornment position="start"><Search/></InputAdornment>}}/><IconButton onClick={()=>setSearchOpen(false)}><Close/></IconButton></Box><List>{query&&!results.length&&<Typography color="text.secondary" p={2}>Nenhuma conversa encontrada.</Typography>}{results.map(result=><ListItemButton key={result.id} onClick={()=>{nav(`/chat/${result.id}`);setSearchOpen(false);setQuery('')}} sx={{borderRadius:2}}><ListItemText primary={result.title} secondary={result.messages?.find(m=>m.content.toLowerCase().includes(query.toLowerCase()))?.content.slice(0,120)}/></ListItemButton>)}</List></DialogContent></Dialog>
  <Dialog open={helpOpen} onClose={()=>setHelpOpen(false)} fullWidth maxWidth="md"><DialogContent><Box display="flex" justifyContent="space-between" alignItems="center"><Typography variant="h4" color="primary">Manual da SOPH.IA</Typography><IconButton onClick={()=>setHelpOpen(false)}><Close/></IconButton></Box><Typography variant="h6" mt={3}>1. Iniciar uma conversa</Typography><Typography color="text.secondary">Clique em Novo chat, descreva claramente sua necessidade e pressione Enter ou a seta de envio. Use Shift+Enter para quebrar uma linha.</Typography><Typography variant="h6" mt={2}>2. Anexar documentos</Typography><Typography color="text.secondary">Clique no clipe ou arraste vários arquivos PDF/DOCX para o chat. Depois peça para resumir, revisar, comparar ou elaborar uma minuta com base neles.</Typography><Typography variant="h6" mt={2}>3. Elaborar documentos</Typography><Typography color="text.secondary">Informe objeto, setor, contexto, quantidades, prazos e responsáveis. A SOPH.IA pode apoiar ETP, TR, Despacho e Memorando. Nunca deixe a IA inventar dados ausentes.</Typography><Typography variant="h6" mt={2}>4. Pesquisar conversas</Typography><Typography color="text.secondary">Use a lupa para pesquisar títulos e mensagens. Os títulos são resumos curtos do primeiro pedido.</Typography><Typography variant="h6" mt={2}>5. Segurança e revisão</Typography><Typography color="text.secondary">Confirme fontes, valores, datas e fundamentos. Toda minuta deve ser revisada por servidor competente e, quando necessário, pelo Jurídico.</Typography><Typography variant="h6" mt={2}>6. Conta e senha</Typography><Typography color="text.secondary">Na tela de acesso, use Cadastre-se para criar uma conta institucional ou Esqueci a senha para gerar um link de redefinição.</Typography></DialogContent></Dialog>
 </Box>
}
