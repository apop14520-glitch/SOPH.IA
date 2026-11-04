import React,{useEffect,useState} from 'react'
import {Alert,Avatar,Box,Button,Card,Chip,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Divider,FormControl,IconButton,InputAdornment,InputLabel,MenuItem,Radio,Select,Switch,Tab,Tabs,TextField,Paper,Tooltip,Typography} from '@mui/material'
import {Add,AutoAwesome,BlockOutlined,CheckCircle,CloudDownload,CloudUpload,DeleteOutline,Description,GroupOutlined,Key,OpenInNew,Person,PsychologyOutlined,SettingsSuggestOutlined,StorageOutlined,ThumbUpOutlined,Visibility,VisibilityOff} from '@mui/icons-material'
import {api,asArray,errorMessage} from '../api'

const roles={padrao:'Padrão',diretor:'Diretor',gerente:'Gerente de TI',admin:'Administrador'}
const validPassword=value=>value.length>=8&&/[A-Z]/.test(value)&&/[a-z]/.test(value)&&/\d/.test(value)&&/[^A-Za-z0-9]/.test(value)
const modelTypes=['RILC SOPH','Modelo de ETP','Modelo de Termo de Referência','Modelo de Despacho','Modelo de Memorando','Lei ou Regulamento','Manual Institucional','Outro Modelo']
const titleCase=value=>String(value||'').toLocaleLowerCase('pt-BR').replace(/(^|[\s/_-])([a-záéíóúâêôãõç])/g,(_,space,letter)=>space+letter.toLocaleUpperCase('pt-BR')).replace(/\b(rilc|soph|etp|tr|sei|pdf|docx)\b/gi,word=>word.toUpperCase())

const panelSx={p:{xs:2.5,md:3},borderRadius:3}
function PanelHeader({icon,title,description,action}){
 return <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap" mb={3}>
  <Box display="flex" gap={1.5} minWidth={0}>{icon&&<Box color="text.secondary" display="flex" pt={.25}>{icon}</Box>}<Box minWidth={0}><Typography variant="h6" fontWeight={700}>{title}</Typography>{description&&<Typography variant="body2" color="text.secondary" mt={.4}>{description}</Typography>}</Box></Box>
  {action}
 </Box>
}

export default function Admin({currentUser}){
 const [users,setUsers]=useState([]),[dialog,setDialog]=useState(null),[error,setError]=useState(''),[form,setForm]=useState({name:'',email:'',sector:'',role:'padrao',password:'',confirm:''})
 const [sectorOptions,setSectorOptions]=useState([])
 const [adminTab,setAdminTab]=useState(currentUser.role==='admin'?0:2)
 const [models,setModels]=useState([]),[modelFiles,setModelFiles]=useState([]),[modelType,setModelType]=useState('RILC SOPH'),[modelTitle,setModelTitle]=useState(''),[uploading,setUploading]=useState(false),[modelMessage,setModelMessage]=useState(''),[knowledgeTab,setKnowledgeTab]=useState(0),[selectedModel,setSelectedModel]=useState(null)
 const [learningExamples,setLearningExamples]=useState([]),[learningFilter,setLearningFilter]=useState('pendente'),[learningBusy,setLearningBusy]=useState(null)
 const [aiConfig,setAiConfig]=useState({provider:'cloudflare',enabled:true,model:'@cf/qwen/qwen3-30b-a3b-fp8',api_key:'',configured:false,masked_api_key:'',organization_id:'',project_id:'',web_enabled:true,web_domains:'gov.br, planalto.gov.br, tcu.gov.br, cgu.gov.br, compras.gov.br, pncp.gov.br, rondonia.ro.gov.br, soph.ro.gov.br'}),[showApiKey,setShowApiKey]=useState(false),[aiBusy,setAiBusy]=useState(false),[aiTesting,setAiTesting]=useState(false),[aiMessage,setAiMessage]=useState(null)
 const isAdmin=currentUser.role==='admin'
 const refresh=()=>api.get('/users').then(r=>setUsers(asArray(r.data))).catch(e=>{setUsers([]);setError(errorMessage(e,'Não foi possível carregar os usuários.'))})
 const refreshSectors=()=>api.get('/sectors').then(r=>setSectorOptions(asArray(r.data))).catch(()=>setSectorOptions([]))
 const refreshModels=()=>api.get('/knowledge').then(r=>setModels(asArray(r.data))).catch(()=>setModels([]))
 const refreshAI=()=>api.get('/admin/ai').then(({data})=>setAiConfig(current=>({...current,...data,api_key:''}))).catch(()=>{})
 const refreshLearning=()=>api.get('/admin/learning').then(r=>setLearningExamples(asArray(r.data))).catch(()=>setLearningExamples([]))
 useEffect(()=>{refresh();refreshSectors();if(isAdmin){refreshModels();refreshAI();refreshLearning()}},[])
 const update=async(id,changes)=>{setError('');try{await api.patch(`/users/${id}`,changes);await refresh()}catch(e){setError(errorMessage(e,'Não foi possível atualizar o usuário.'))}}
 const remove=async id=>{setError('');try{await api.delete(`/users/${id}`);await refresh()}catch(e){setError(errorMessage(e,'Não foi possível desativar o usuário.'))}}
 const create=async e=>{e.preventDefault();setError('');if(!/@sophi?a?\.ro\.gov\.br$/i.test(form.email)){setError('Informe um e-mail institucional da SOPH.');return}if(!validPassword(form.password)){setError('A senha deve ter 8 caracteres, maiúscula, minúscula, número e símbolo.');return}if(form.password!==form.confirm){setError('A confirmação de senha não corresponde.');return}const sector=sectorOptions.find(item=>item.name===form.sector);if(!sector){setError('Selecione um setor válido.');return}try{await api.post('/users',{name:form.name,email:form.email,password:form.password,role:form.role,sector_id:sector.id});setDialog(null);setForm({name:'',email:'',sector:'',role:'padrao',password:'',confirm:''});await refresh()}catch(e){setError(errorMessage(e,'Não foi possível criar o usuário.'))}}
 const changePassword=async e=>{e.preventDefault();setError('');if(!validPassword(form.password)){setError('A senha deve ter 8 caracteres, maiúscula, minúscula, número e símbolo.');return}if(form.password!==form.confirm){setError('A confirmação não corresponde.');return}try{await api.put(`/users/${dialog.id}/password`,{password:form.password});setDialog(null);setForm({...form,password:'',confirm:''})}catch(e){setError(errorMessage(e,'Não foi possível alterar a senha.'))}}
 const uploadModels=async e=>{e.preventDefault();if(!modelFiles.length||modelType==='Outro Modelo'&&!modelTitle.trim())return;setUploading(true);setModelMessage('');try{for(const file of modelFiles){const data=new FormData();data.append('title',modelTitle.trim()||file.name.replace(/\.(pdf|docx)$/i,''));data.append('category',modelType);data.append('file',file);await api.post('/knowledge/upload',data)}setModelMessage(`${modelFiles.length} documento(s) integrado(s) à base institucional.`);setModelFiles([]);setModelTitle('');refreshModels()}catch(e){setModelMessage(errorMessage(e,'Não foi possível integrar os modelos.'))}finally{setUploading(false)}}
 const modelBlob=async model=>{try{return (await api.get(`/knowledge/${model.id}/file`,{responseType:'blob'})).data}catch{return new Blob([model.content||'Conteúdo não disponível.'],{type:'text/plain;charset=utf-8'})}}
 const viewModel=async model=>{const preview=window.open('about:blank','_blank');const blob=await modelBlob(model),url=URL.createObjectURL(blob);if(preview)preview.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000)}
 const downloadModel=async model=>{const blob=await modelBlob(model),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=model.filename||`${model.title}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 const saveAI=async()=>{setAiBusy(true);setAiMessage(null);try{const payload={provider:aiConfig.provider,enabled:aiConfig.enabled,model:aiConfig.model,organization_id:aiConfig.organization_id||'',project_id:aiConfig.project_id||'',web_enabled:aiConfig.web_enabled,web_domains:aiConfig.web_domains,...(aiConfig.api_key.trim()?{api_key:aiConfig.api_key.trim()}:{})};const{data}=await api.put('/admin/ai',payload);setAiConfig(current=>({...current,...data,api_key:''}));setAiMessage({severity:'success',text:'Configuração institucional de IA e pesquisa web salva com segurança.'})}catch(e){setAiMessage({severity:'error',text:errorMessage(e,'Não foi possível salvar a configuração.')})}finally{setAiBusy(false)}}
 const testAI=async()=>{setAiTesting(true);setAiMessage(null);try{const payload={provider:aiConfig.provider,model:aiConfig.model,organization_id:aiConfig.organization_id||'',project_id:aiConfig.project_id||'',...(aiConfig.api_key.trim()?{api_key:aiConfig.api_key.trim()}:{})};const{data}=await api.post('/admin/ai/test',payload);setAiMessage({severity:'success',text:data.message})}catch(e){setAiMessage({severity:'error',text:errorMessage(e,'Não foi possível conectar ao provedor de IA.')})}finally{setAiTesting(false)}}
 const reviewLearning=async(id,status)=>{setLearningBusy(id);try{await api.patch(`/admin/learning/${id}`,{status});await refreshLearning()}catch(e){setError(errorMessage(e,'Não foi possível atualizar o aprendizado.'))}finally{setLearningBusy(null)}}
  const quietAlert={bgcolor:'action.hover',color:'text.primary',border:'none','& .MuiAlert-icon':{color:'text.secondary'}}
  const isSelf=user=>user.id===currentUser.id
  const lockedByRole=user=>!isAdmin&&['admin','gerente'].includes(user.role)
  const modelInfo={'@cf/qwen/qwen3-30b-a3b-fp8':{label:'Qwen3 30B A3B',note:'Melhor custo-benefício para redação institucional'},'@cf/zai-org/glm-4.7-flash':{label:'GLM 4.7 Flash',note:'Contexto amplo para documentos extensos'},'gemini-3.6-flash':{label:'Gemini 3.6 Flash',note:'Modelo estável para texto, documentos e PDFs extensos'}}
  const activeModel=modelInfo[aiConfig.model]||{label:aiConfig.model,note:''}
  const providerNote={cloudflare:'Modelos do Cloudflare Workers AI. Nenhuma chave aparece no navegador.',gemini:'Modelos do Google. A chave institucional fica guardada com segurança.'}
 return <Box maxWidth={1120} mx="auto" pb={4}>
  <Paper variant="outlined" sx={{p:.5,mb:3,borderRadius:3}}>
   <Tabs value={adminTab} onChange={(_,value)=>setAdminTab(value)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{minHeight:44,'& .MuiTabs-indicator':{display:'none'},'& .MuiTab-root':{minHeight:44,textTransform:'none',fontWeight:600,borderRadius:2,px:2,color:'text.secondary'},'& .Mui-selected':{color:'text.primary',bgcolor:'action.selected'}}}>
    {isAdmin&&<Tab icon={<SettingsSuggestOutlined fontSize="small"/>} iconPosition="start" label="Inteligência artificial" value={0}/>}
    {isAdmin&&<Tab icon={<StorageOutlined fontSize="small"/>} iconPosition="start" label="Base institucional" value={1}/>}
    <Tab icon={<GroupOutlined fontSize="small"/>} iconPosition="start" label="Usuários" value={2}/>
    {isAdmin&&<Tab icon={<PsychologyOutlined fontSize="small"/>} iconPosition="start" label="Aprendizado" value={3}/>}
   </Tabs>
  </Paper>
  {isAdmin&&adminTab===0&&<Paper variant="outlined" sx={{p:{xs:2.5,md:3},borderRadius:3}}>
   <Box display="flex" flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={2}>
    <Box minWidth={0}>
     <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
      <Typography variant="h6" fontWeight={750}>Inteligência artificial</Typography>
      <Chip size="small" label={aiConfig.enabled?'Ativa':'Desativada'} color={aiConfig.enabled?'success':'default'} variant={aiConfig.enabled?'filled':'outlined'}/>
     </Box>
     <Typography variant="body2" color="text.secondary" mt={.5}>Responde aos usuários e ajuda a elaborar, analisar e revisar documentos.</Typography>
    </Box>
    <Box display="flex" alignItems="center" gap={1}>
     <Typography variant="body2" color="text.secondary">{aiConfig.enabled?'Ligada':'Desligada'}</Typography>
     <Switch checked={aiConfig.enabled} onChange={e=>setAiConfig({...aiConfig,enabled:e.target.checked})} inputProps={{'aria-label':'Ativar inteligência artificial'}}/>
    </Box>
   </Box>
   <Box display="grid" gridTemplateColumns={{xs:'1fr',md:'1fr 1fr'}} gap={2.5} alignItems="start" mt={3}>
    <FormControl fullWidth><InputLabel>Provedor de IA</InputLabel><Select label="Provedor de IA" value={aiConfig.provider} onChange={e=>{const provider=e.target.value;setAiConfig({...aiConfig,provider,model:provider==='cloudflare'?'@cf/qwen/qwen3-30b-a3b-fp8':provider==='gemini'?'gemini-3.6-flash':aiConfig.model,api_key:'',configured:false,masked_api_key:'',organization_id:'',project_id:''});setAiMessage(null)}}><MenuItem value="cloudflare">Cloudflare Workers AI</MenuItem><MenuItem value="gemini">Google Gemini</MenuItem></Select><Typography variant="caption" color="text.secondary" display="block" mt={.75} px={.5}>{providerNote[aiConfig.provider]}</Typography></FormControl>
    <FormControl fullWidth disabled={!['cloudflare','gemini'].includes(aiConfig.provider)}><InputLabel>Modelo</InputLabel><Select label="Modelo" value={aiConfig.model} onChange={e=>setAiConfig({...aiConfig,model:e.target.value})} renderValue={value=>modelInfo[value]?.label||value}>{aiConfig.provider==='cloudflare'&&[<MenuItem key="qwen" value="@cf/qwen/qwen3-30b-a3b-fp8"><Box><Typography fontWeight={750}>Qwen3 30B A3B</Typography><Typography variant="caption" color="text.secondary">Melhor custo-benefício para redação institucional</Typography></Box></MenuItem>,<MenuItem key="glm" value="@cf/zai-org/glm-4.7-flash"><Box><Typography fontWeight={750}>GLM 4.7 Flash</Typography><Typography variant="caption" color="text.secondary">Contexto amplo para documentos extensos</Typography></Box></MenuItem>]}{aiConfig.provider==='gemini'&&<MenuItem value="gemini-3.6-flash"><Box><Typography fontWeight={750}>Gemini 3.6 Flash</Typography><Typography variant="caption" color="text.secondary">Modelo estável para texto, documentos e PDFs extensos</Typography></Box></MenuItem>}</Select><Typography variant="caption" color="text.secondary" display="block" mt={.75} px={.5}>{activeModel.note}</Typography></FormControl>
   </Box>
   {aiConfig.provider==='cloudflare'&&<Alert severity="info" icon={false} sx={{...quietAlert,mt:2}}>A conexão com o Cloudflare é feita pelo servidor, e nenhuma chave aparece no navegador. O modelo pode ser trocado aqui a qualquer momento.</Alert>}
   {aiConfig.provider==='gemini'&&<Box mt={2.5}>
    <TextField fullWidth type={showApiKey?'text':'password'} label={aiConfig.configured?'Nova chave API do Gemini (opcional)':'Chave API do Gemini'} placeholder={aiConfig.configured?aiConfig.masked_api_key:'Cole aqui a chave criada no Google AI Studio'} value={aiConfig.api_key} onChange={e=>setAiConfig({...aiConfig,api_key:e.target.value})} helperText={aiConfig.configured?'A chave atual continuará ativa se este campo permanecer vazio.':'A chave é enviada somente ao servidor e armazenada de forma protegida.'} InputProps={{endAdornment:<InputAdornment position="end"><IconButton onClick={()=>setShowApiKey(value=>!value)} edge="end" aria-label={showApiKey?'Ocultar chave':'Mostrar chave'}>{showApiKey?<VisibilityOff/>:<Visibility/>}</IconButton></InputAdornment>}}/>
    <Box mt={2} px={2} py={1.5} display="flex" alignItems="center" justifyContent="space-between" gap={2} border="1px solid" borderColor="divider" borderRadius={2}>
     <Box><Box display="flex" alignItems="center" gap={1} flexWrap="wrap"><Typography fontWeight={700}>Usar o Gemini como padrão</Typography>{aiConfig.enabled&&aiConfig.configured&&<Chip size="small" color="success" label="Em uso"/>}</Box><Typography variant="body2" color="text.secondary">A chave fica guardada com segurança e é usada nos chats de todos os usuários.</Typography></Box>
     <Switch checked={aiConfig.enabled} onChange={e=>setAiConfig({...aiConfig,enabled:e.target.checked})} inputProps={{'aria-label':'Usar Gemini como padrão institucional'}}/>
    </Box>
    <Alert severity="info" icon={false} sx={{...quietAlert,mt:2}}>Use uma chave de projeto institucional com faturamento e limites configurados. Documentos enviados ao Gemini são processados externamente; não envie conteúdo sigiloso sem autorização.</Alert>
   </Box>}
   <Divider sx={{my:3}}/>
   <Box display="flex" alignItems="center" justifyContent="space-between" gap={2}>
    <Box><Typography fontWeight={700}>Pesquisa na web</Typography><Typography variant="body2" color="text.secondary">Complementa a base institucional com fontes públicas oficiais. Só os domínios autorizados são consultados.</Typography></Box>
    <Switch checked={Boolean(aiConfig.web_enabled)} onChange={e=>setAiConfig({...aiConfig,web_enabled:e.target.checked})} inputProps={{'aria-label':'Ativar pesquisa na web'}}/>
   </Box>
   {aiConfig.web_enabled&&<Box mt={2}>
    <TextField fullWidth label="Domínios autorizados" value={aiConfig.web_domains||''} onChange={e=>setAiConfig({...aiConfig,web_domains:e.target.value})} helperText="Separados por vírgula. Subdomínios também são aceitos."/>
    {aiConfig.web_configured?<Typography variant="body2" color="success.main" mt={1}>Pesquisa ativa com {aiConfig.web_provider==='tavily'?'Tavily':'Google Search'}.</Typography>:<Typography variant="body2" color="warning.main" mt={1}>Falta configurar a chave da pesquisa (TAVILY_API_KEY) no Cloudflare Pages. Sem ela, a pesquisa não funciona.</Typography>}
   </Box>}
   <Divider sx={{my:3}}/>
   {aiMessage&&<Alert severity={aiMessage.severity} onClose={()=>setAiMessage(null)} sx={{mb:2}}>{aiMessage.text}</Alert>}
   <Box display="flex" justifyContent="flex-end" alignItems="center" gap={1.5} flexWrap="wrap">{['cloudflare','gemini'].includes(aiConfig.provider)&&<Button variant="text" color="inherit" disabled={aiTesting||(aiConfig.provider!=='cloudflare'&&!aiConfig.configured&&!aiConfig.api_key.trim())} onClick={testAI} startIcon={aiTesting?<CircularProgress size={17}/>:<CheckCircle/>}>{aiTesting?'Testando...':'Testar conexão'}</Button>}<Button variant="contained" disabled={aiBusy} onClick={saveAI} startIcon={aiBusy?<CircularProgress color="inherit" size={17}/>:<AutoAwesome/>}>{aiBusy?'Salvando...':'Salvar configuração'}</Button></Box>
  </Paper>}
  {isAdmin&&adminTab===1&&<Paper variant="outlined" sx={panelSx}>
   <PanelHeader icon={<CloudUpload/>} title="Base institucional" description="Documentos oficiais que a SOPH.IA consulta para elaborar e revisar minutas."/>
   <Tabs value={knowledgeTab} onChange={(_,value)=>setKnowledgeTab(value)} sx={{mb:3,borderBottom:'1px solid',borderColor:'divider',minHeight:40,'& .MuiTab-root':{minHeight:40,textTransform:'none',fontWeight:600}}}><Tab label="Integrar documentos"/><Tab label={`Documentos integrados (${models.length})`}/></Tabs>
   {knowledgeTab===0&&<Box component="form" onSubmit={uploadModels}>
    <Box display="grid" gridTemplateColumns={{xs:'1fr',md:'240px minmax(0,1fr)'}} gap={2} alignItems="start">
     <FormControl fullWidth><InputLabel>Tipo documental</InputLabel><Select label="Tipo documental" value={modelType} onChange={e=>{setModelType(e.target.value);if(e.target.value!=='Outro Modelo')setModelTitle('')}} MenuProps={{PaperProps:{sx:{maxHeight:260}}}}>{modelTypes.map(type=><MenuItem key={type} value={type}>{type}</MenuItem>)}</Select></FormControl>
     <Box display="grid" gap={2}>
      {modelType==='Outro Modelo'&&<TextField required label="Nome do documento" placeholder="Ex.: Modelo de Relatório Técnico" value={modelTitle} onChange={e=>setModelTitle(e.target.value)}/>}
      <Button component="label" variant="outlined" color="inherit" startIcon={<Description/>} sx={{height:56,justifyContent:'flex-start',px:2,borderStyle:'dashed'}}>{modelFiles.length?`${modelFiles.length} arquivo(s) selecionado(s)`:'Escolher arquivos PDF ou DOCX'}<input hidden multiple type="file" accept=".pdf,.docx" onChange={e=>setModelFiles([...e.target.files])}/></Button>
     </Box>
    </Box>
    {!!modelFiles.length&&<Box display="flex" flexWrap="wrap" gap={1} mt={2}>{modelFiles.map((file,index)=><Chip key={`${file.name}-${index}`} label={titleCase(file.name.replace(/\.(pdf|docx)$/i,''))} onDelete={()=>setModelFiles(old=>old.filter((_,i)=>i!==index))}/>)}</Box>}
    {modelMessage&&<Alert severity={modelMessage.includes('integrado')?'success':'error'} sx={{mt:2}}>{modelMessage}</Alert>}
    <Box display="flex" justifyContent="flex-end" mt={3}><Button type="submit" variant="contained" disabled={!modelFiles.length||uploading||modelType==='Outro Modelo'&&!modelTitle.trim()}>{uploading?'Integrando...':'Integrar documentos'}</Button></Box>
   </Box>}
   {knowledgeTab===1&&<Box>
    <Typography variant="body2" color="text.secondary" mb={2}>Selecione um documento para visualizar ou baixar o arquivo original.</Typography>
    {models.length?<Box sx={{maxHeight:360,overflowY:'auto',border:'1px solid',borderColor:'divider',borderRadius:2}}>{models.map((model,index)=><Box key={model.id} onClick={()=>setSelectedModel(model.id)} sx={{display:'grid',gridTemplateColumns:'auto minmax(0,1fr) auto',alignItems:'center',gap:1.5,px:2,py:1.5,borderTop:index?'1px solid':0,borderColor:'divider',cursor:'pointer',bgcolor:selectedModel===model.id?'action.selected':'transparent','&:hover':{bgcolor:'action.hover'}}}><Radio size="small" checked={selectedModel===model.id}/><Box minWidth={0}><Typography fontWeight={600} noWrap>{titleCase(model.title)}</Typography><Typography variant="caption" color="text.secondary">{titleCase(model.category)} · {model.filename?.split('.').pop()?.toUpperCase()||'DOCUMENTO'}</Typography></Box><Description color="action"/></Box>)}</Box>
    :<Typography color="text.secondary" textAlign="center" py={5}>Nenhum documento institucional cadastrado.</Typography>}
    <Box display="flex" justifyContent="flex-end" gap={1.5} flexWrap="wrap" mt={3}><Button variant="outlined" color="inherit" startIcon={<OpenInNew/>} disabled={!selectedModel} onClick={()=>viewModel(models.find(model=>model.id===selectedModel))}>Visualizar</Button><Button variant="contained" startIcon={<CloudDownload/>} disabled={!selectedModel} onClick={()=>downloadModel(models.find(model=>model.id===selectedModel))}>Baixar arquivo</Button></Box>
   </Box>}
  </Paper>}
  {isAdmin&&adminTab===3&&<Paper variant="outlined" sx={panelSx}>
   <PanelHeader icon={<PsychologyOutlined/>} title="Aprendizado institucional" description="Exemplos das conversas que podem orientar respostas futuras. Revise antes de aprovar." action={<Chip size="small" variant="outlined" label={`${learningExamples.filter(item=>item.status==='aprovado').length} aprovados`}/>}/>
   <Alert severity="info" icon={false} sx={{...quietAlert,mb:3}}>Pedidos e respostas ficam pendentes até a revisão. Aprove somente exemplos corretos, sem dados pessoais ou sigilosos.</Alert>
   <Box display="flex" gap={1} mb={2} flexWrap="wrap">{['pendente','aprovado','rejeitado'].map(status=><Chip key={status} clickable onClick={()=>setLearningFilter(status)} variant={learningFilter===status?'filled':'outlined'} color={learningFilter===status?'primary':'default'} label={`${status.charAt(0).toUpperCase()+status.slice(1)} (${learningExamples.filter(item=>item.status===status).length})`}/>)}</Box>
   {learningExamples.some(item=>item.status===learningFilter)?<Box sx={{maxHeight:'60vh',overflowY:'auto',border:'1px solid',borderColor:'divider',borderRadius:2}}>{learningExamples.filter(item=>item.status===learningFilter).map((example,index)=><Box key={example.id} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'minmax(0,1fr) auto'},gap:2,px:2,py:2,borderTop:index?'1px solid':0,borderColor:'divider'}}>
    <Box minWidth={0}><Typography variant="caption" color="text.secondary">{example.user_name} · conversa {example.conversation_id}</Typography><Typography fontWeight={600} mt={.5}>{example.prompt.slice(0,260)}{example.prompt.length>260?'…':''}</Typography><Typography variant="body2" color="text.secondary" mt={.75} sx={{whiteSpace:'pre-line'}}>{example.response.slice(0,520)}{example.response.length>520?'…':''}</Typography></Box>
    <Box display="flex" gap={1} alignItems="flex-start" flexShrink={0}>{example.status!=='aprovado'&&<Button size="small" variant="outlined" color="success" startIcon={<ThumbUpOutlined/>} disabled={learningBusy===example.id} onClick={()=>reviewLearning(example.id,'aprovado')}>Aprovar</Button>}{example.status!=='rejeitado'&&<Button size="small" variant="text" color="error" startIcon={<BlockOutlined/>} disabled={learningBusy===example.id} onClick={()=>reviewLearning(example.id,'rejeitado')}>Rejeitar</Button>}</Box>
   </Box>)}</Box>
   :<Typography color="text.secondary" textAlign="center" py={6}>Nenhum exemplo nesta categoria.</Typography>}
  </Paper>}
  {error&&<Alert severity="error" onClose={()=>setError('')} sx={{mb:2}}>{error}</Alert>}
  <Box sx={{display:adminTab===2?'block':'none'}}>
  <Paper variant="outlined" sx={panelSx}>
   <PanelHeader icon={<GroupOutlined/>} title="Usuários" description={`${users.filter(u=>u.active).length} ${users.filter(u=>u.active).length===1?'ativo':'ativos'} · ${users.length} ${users.length===1?'cadastrado':'cadastrados'}`} action={<Button variant="contained" startIcon={<Add/>} onClick={()=>{setError('');setDialog({type:'new'})}}>Novo usuário</Button>}/>
   <Box sx={{display:{xs:'none',md:'grid'},gridTemplateColumns:'minmax(0,1fr) 170px 150px 96px',gap:2,px:2,pb:1,color:'text.secondary'}}><Typography variant="caption">Nome</Typography><Typography variant="caption">Perfil</Typography><Typography variant="caption">Situação</Typography><Typography variant="caption" textAlign="right">Ações</Typography></Box>
   <Box sx={{border:'1px solid',borderColor:'divider',borderRadius:2,overflow:'hidden'}}>
    {users.map((user,index)=><Box key={user.id} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'minmax(0,1fr) 170px 150px 96px'},alignItems:'center',gap:{xs:1.5,md:2},px:2,py:1.75,borderTop:index?'1px solid':0,borderColor:'divider'}}>
     <Box display="flex" alignItems="center" gap={1.5} minWidth={0}>
      <Avatar sx={{width:36,height:36,bgcolor:'action.selected',color:'text.primary',fontSize:15}}>{user.name?.[0]?.toUpperCase()||<Person/>}</Avatar>
      <Box minWidth={0}><Typography fontWeight={600} noWrap>{user.name}{isSelf(user)&&<Typography component="span" variant="caption" color="text.secondary">{' '}(você)</Typography>}</Typography><Typography variant="caption" color="text.secondary" noWrap display="block">{user.email} · {user.sector_name||'Setor não informado'}</Typography></Box>
     </Box>
     <FormControl size="small" fullWidth disabled={isSelf(user)||lockedByRole(user)}><InputLabel>Perfil</InputLabel><Select label="Perfil" value={['elaborador','revisor'].includes(user.role)?'padrao':user.role||'padrao'} onChange={e=>update(user.id,{role:e.target.value})}>{Object.entries(roles).filter(([value])=>isAdmin||!['admin','gerente'].includes(value)).map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
     <Box display="flex" alignItems="center" gap={1}><Switch size="small" checked={user.active!==false} disabled={isSelf(user)||lockedByRole(user)} onChange={e=>update(user.id,{active:e.target.checked})} inputProps={{'aria-label':`Usuário ativo: ${user.name}`}}/><Typography variant="body2" color="text.secondary">{user.active!==false?'Ativo':'Inativo'}</Typography></Box>
     <Box display="flex" justifyContent={{xs:'flex-start',md:'flex-end'}} gap={.5}>
      <Tooltip title="Trocar senha"><span><IconButton aria-label={`Trocar senha de ${user.name}`} disabled={lockedByRole(user)} onClick={()=>{setError('');setForm({...form,password:'',confirm:''});setDialog({type:'password',id:user.id,name:user.name})}}><Key/></IconButton></span></Tooltip>
      <Tooltip title={isSelf(user)?'Conta atual protegida':'Desativar usuário'}><span><IconButton aria-label={`Desativar ${user.name}`} disabled={isSelf(user)||lockedByRole(user)} onClick={()=>remove(user.id)}><DeleteOutline/></IconButton></span></Tooltip>
     </Box>
    </Box>)}
   </Box>
  </Paper>
  <Dialog open={dialog?.type==='new'} onClose={()=>setDialog(null)} fullWidth maxWidth="sm"><Box component="form" onSubmit={create}><DialogTitle>Novo usuário</DialogTitle><DialogContent sx={{display:'grid',gap:2,pt:'12px!important'}}>{error&&<Alert severity="error">{error}</Alert>}<TextField required label="Nome completo" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><TextField required label="E-mail institucional" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><FormControl required><InputLabel>Setor</InputLabel><Select label="Setor" value={form.sector} onChange={e=>setForm({...form,sector:e.target.value})}>{sectorOptions.map(s=><MenuItem key={s.id} value={s.name}>{s.name}</MenuItem>)}</Select></FormControl><FormControl><InputLabel>Tipo de usuário</InputLabel><Select label="Tipo de usuário" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{Object.entries(roles).filter(([value])=>isAdmin||!['admin','gerente'].includes(value)).map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><TextField required type="password" label="Senha forte" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><TextField required type="password" label="Confirmar senha" value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})}/></DialogContent><DialogActions><Button onClick={()=>setDialog(null)}>Cancelar</Button><Button type="submit" variant="contained">Criar usuário</Button></DialogActions></Box></Dialog>
  <Dialog open={dialog?.type==='password'} onClose={()=>setDialog(null)} fullWidth maxWidth="xs"><Box component="form" onSubmit={changePassword}><DialogTitle>Trocar senha — {dialog?.name}</DialogTitle><DialogContent sx={{display:'grid',gap:2,pt:'12px!important'}}>{error&&<Alert severity="error">{error}</Alert>}<TextField required type="password" label="Nova senha forte" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} helperText="8+ caracteres, maiúscula, minúscula, número e símbolo"/><TextField required type="password" label="Confirmar senha" value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})}/></DialogContent><DialogActions><Button onClick={()=>setDialog(null)}>Cancelar</Button><Button type="submit" variant="contained">Alterar senha</Button></DialogActions></Box></Dialog>
  </Box>
 </Box>
}
