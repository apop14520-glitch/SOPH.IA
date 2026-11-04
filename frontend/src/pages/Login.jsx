import React,{useContext,useEffect,useState} from 'react'
import {Alert,Box,Button,Card,CardContent,FormControl,IconButton,InputLabel,Link,MenuItem,Select,TextField,Typography} from '@mui/material'
import {ArrowBack,DarkModeOutlined,LightModeOutlined} from '@mui/icons-material'
import {api,errorMessage} from '../api'
import {ColorModeContext} from '../theme'

// Mesmos nomes da tabela de setores do backend, para que o cadastro seja aceito.
const sectors=['Presidência','Diretoria Administrativa e Financeira','Diretoria Técnica e Operacional','Tecnologia da Informação','Recursos Humanos','Licitações e Contratos','Assessoria Jurídica','Outro']
const strongPassword=password=>password.length>=8&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/\d/.test(password)&&/[^A-Za-z0-9]/.test(password)
const emptyForm={name:'',sector:'',email:'',password:'',confirm:''}
// Link de redefinição: #/redefinir?token=... (o token sai da URL assim que a senha é trocada).
const tokenFromLink=()=>new URLSearchParams(window.location.hash.split('?')[1]||'').get('token')||''

export default function Login({onLogin}){
 const {mode:colorMode,toggle}=useContext(ColorModeContext)
 const [resetToken,setResetToken]=useState(tokenFromLink)
 const [mode,setMode]=useState(()=>resetToken?'reset':'login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('')
 const [form,setForm]=useState(emptyForm),[newPassword,setNewPassword]=useState(''),[newConfirm,setNewConfirm]=useState(''),[busy,setBusy]=useState(false)
 const goTo=next=>{setMode(next);setError('');setMessage('')}
 // Link colado na mesma aba só muda o #: a tela precisa perceber o token sem recarregar.
 useEffect(()=>{const onHash=()=>{const token=tokenFromLink();if(token){setResetToken(token);setMode('reset');setError('');setMessage('')}};window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash)},[])

 const submitLogin=async e=>{
  e.preventDefault();setError('')
  try{
   const{data}=await api.post('/auth/login',{email,password})
   onLogin(data.user)
  }catch(err){setError(errorMessage(err,'E-mail ou senha inválidos'))}
 }

 const register=async e=>{
  e.preventDefault();setError('');setMessage('')
  const cleanEmail=form.email.trim()
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)){setError('Informe um e-mail válido.');return}
  if(!strongPassword(form.password)){setError('A senha deve ter 8 caracteres, maiúscula, minúscula, número e símbolo.');return}
  if(form.password!==form.confirm){setError('A confirmação de senha não corresponde.');return}
  try{
   const{data}=await api.post('/auth/register',{name:form.name.trim(),sector:form.sector,email:cleanEmail,password:form.password})
   setEmail(cleanEmail);setPassword('');setForm(emptyForm)
   setMode('login');setMessage(data.message)
  }catch(err){setError(errorMessage(err,'Não foi possível concluir o cadastro.'))}
 }

 const requestReset=async e=>{
  e.preventDefault();setError('');setMessage('');setBusy(true)
  try{
   const{data}=await api.post('/auth/forgot',{email:email.trim()})
   setMessage(data.message)
  }catch(err){setError(errorMessage(err,'Não foi possível solicitar a redefinição agora.'))}
  finally{setBusy(false)}
 }

 const saveReset=async e=>{
  e.preventDefault();setError('');setMessage('')
  if(!strongPassword(newPassword)){setError('A senha deve ter 8 caracteres, maiúscula, minúscula, número e símbolo.');return}
  if(newPassword!==newConfirm){setError('A confirmação de senha não corresponde.');return}
  setBusy(true)
  try{
   const{data}=await api.post('/auth/reset',{token:resetToken,password:newPassword})
   window.location.hash='#/'
   setNewPassword('');setNewConfirm('');setMode('login');setMessage(data.message)
  }catch(err){setError(errorMessage(err,'Não foi possível redefinir a senha.'))}
  finally{setBusy(false)}
 }

 const title={login:'Entrar',register:'Criar cadastro',forgot:'Recuperar senha',reset:'Criar nova senha'}[mode]

 return <Box sx={{minHeight:'100vh',display:'grid',placeItems:'center',p:{xs:2,sm:4},position:'relative',backgroundImage:`linear-gradient(rgba(20,14,10,.50),rgba(20,14,10,.50)),url('/porto-soph-login.jpg')`,backgroundSize:'cover',backgroundPosition:'center',backgroundAttachment:{md:'fixed'}}}>
  <IconButton onClick={toggle} aria-label={colorMode==='dark'?'Ativar tema claro':'Ativar tema escuro'} sx={{position:'fixed',top:{xs:16,sm:24},right:{xs:16,sm:24},zIndex:2,width:44,height:44,color:'#fff',backgroundColor:'rgba(20,16,13,.58)',backdropFilter:'blur(12px)',border:'1px solid rgba(255,255,255,.24)','&:hover':{backgroundColor:'rgba(242,101,34,.88)'}}}>{colorMode==='dark'?<LightModeOutlined/>:<DarkModeOutlined/>}</IconButton>
  <Card sx={{width:'min(460px,100%)',maxHeight:'calc(100vh - 32px)',overflowY:'auto',borderRadius:4,backgroundColor:colorMode==='dark'?'rgba(31,27,24,.96)':'rgba(255,255,255,.94)',backdropFilter:'blur(16px)',boxShadow:'0 24px 80px rgba(0,0,0,.38)',border:'1px solid',borderColor:colorMode==='dark'?'rgba(255,255,255,.13)':'rgba(255,255,255,.72)'}}><CardContent sx={{p:{xs:3,sm:4}}}>
  {(mode==='register'||mode==='forgot')&&<IconButton onClick={()=>goTo('login')} aria-label="Voltar ao acesso"><ArrowBack/></IconButton>}
  <Typography variant="h3" color="primary" fontWeight={900}>SOPH.IA</Typography><Typography color="text.secondary" variant="body2" mt={1}>Assistente para elaborar e revisar documentos.</Typography><Typography variant="h6" mt={2.5} mb={3}>{title}</Typography>
  {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}{message&&<Alert severity="success" sx={{mb:2,wordBreak:'break-word'}}>{message}</Alert>}

  {mode==='login'&&<Box component="form" onSubmit={submitLogin} display="grid" gap={2}>
   <TextField required label="E-mail" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/>
   <TextField required label="Senha" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/>
   <Box display="flex" justifyContent="space-between">
    <Link component="button" type="button" onClick={()=>goTo('forgot')} sx={{color:'primary.main',fontWeight:800,fontSize:13,minHeight:44,display:'inline-flex',alignItems:'center',px:1}}>Esqueci a senha</Link>
    <Link component="button" type="button" onClick={()=>goTo('register')} sx={{color:'primary.main',fontWeight:800,fontSize:13,minHeight:44,display:'inline-flex',alignItems:'center',px:1}}>Cadastre-se</Link>
   </Box>
   <Button type="submit" variant="contained" size="large" sx={{minHeight:48}}>Acessar</Button>
  </Box>}

  {mode==='register'&&<Box component="form" onSubmit={register} display="grid" gap={2}>
   <TextField required label="Nome completo" autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
   <FormControl required><InputLabel>Setor</InputLabel><Select label="Setor" value={form.sector} onChange={e=>setForm({...form,sector:e.target.value})}>{sectors.map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}</Select></FormControl>
   <TextField required type="email" label="E-mail" placeholder="seu@email.com" autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
   <TextField required type="password" label="Senha forte" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} helperText="8+ caracteres, maiúscula, minúscula, número e símbolo"/>
   <TextField required type="password" label="Confirmar senha" autoComplete="new-password" value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})}/>
   <Button type="submit" variant="contained" size="large">Cadastrar</Button>
  </Box>}

  {mode==='forgot'&&<Box component="form" onSubmit={requestReset} display="grid" gap={2}>
   <Typography color="text.secondary" variant="body2">Informe o e-mail da sua conta. Se ele estiver cadastrado, você receberá um link para criar uma nova senha. O link vale por 30 minutos.</Typography>
   <TextField required label="E-mail" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/>
   <Button type="submit" variant="contained" size="large" disabled={busy} sx={{minHeight:48}}>{busy?'Enviando...':'Enviar link'}</Button>
  </Box>}

  {mode==='reset'&&<Box component="form" onSubmit={saveReset} display="grid" gap={2}>
   <TextField required type="password" label="Nova senha" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} helperText="8+ caracteres, maiúscula, minúscula, número e símbolo"/>
   <TextField required type="password" label="Confirmar nova senha" autoComplete="new-password" value={newConfirm} onChange={e=>setNewConfirm(e.target.value)}/>
   <Button type="submit" variant="contained" size="large" disabled={busy} sx={{minHeight:48}}>{busy?'Salvando...':'Salvar nova senha'}</Button>
  </Box>}
 </CardContent></Card></Box>
}
