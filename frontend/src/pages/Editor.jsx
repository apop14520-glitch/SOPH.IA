import React, {useEffect,useState} from 'react'
import {Alert,Box,Button,Card,CardContent,Chip,FormControl,InputLabel,MenuItem,Select,TextField,Typography} from '@mui/material'
import {Download,Save} from '@mui/icons-material'
import {useParams} from 'react-router-dom'
import {api} from '../api'
export default function Editor(){
 const {id}=useParams(),[doc,setDoc]=useState(null),[text,setText]=useState(''),[note,setNote]=useState('Revisão manual'),[obs,setObs]=useState([])
 const load=()=>api.get(`/documents/${id}`).then(r=>{setDoc(r.data);setText(r.data.versions.at(-1).content)})
 useEffect(load,[id])
 if(!doc)return null
 const save=async()=>{await api.post(`/documents/${id}/versions`,{content:text,change_note:note});load()}
 const review=async()=>{const {data}=await api.post('/review',{text});setText(data.revised_text);setObs(data.observations)}
 const status=async value=>{const {data}=await api.patch(`/documents/${id}/status`,{status:value});setDoc(data)}
 const download=async()=>{const r=await api.get(`/documents/${id}/export`,{responseType:'blob'});const url=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=url;a.download=`${doc.title}.docx`;a.click();URL.revokeObjectURL(url)}
 return <><Box display="flex" justifyContent="space-between" alignItems="center" mb={2}><Box><Typography variant="h4">{doc.title}</Typography><Typography color="text.secondary">{doc.document_type.replace('_',' ')} · {doc.versions.length} versão(ões)</Typography></Box><Box display="flex" gap={1}><Button onClick={review}>Revisão básica</Button><Button startIcon={<Download/>} onClick={download}>Exportar DOCX</Button><Button variant="contained" startIcon={<Save/>} onClick={save}>Salvar versão</Button></Box></Box>
 {obs.map(x=><Alert key={x} severity="info" sx={{mb:1}}>{x}</Alert>)}
 <Box display="grid" gridTemplateColumns="1fr 300px" gap={2}><Card><CardContent><TextField fullWidth multiline minRows={26} value={text} onChange={e=>setText(e.target.value)} sx={{'& textarea':{fontFamily:'Georgia,serif',lineHeight:1.7}}}/><TextField fullWidth label="Nota da alteração" value={note} onChange={e=>setNote(e.target.value)} sx={{mt:2}}/></CardContent></Card>
 <Box><Card sx={{mb:2}}><CardContent><FormControl fullWidth><InputLabel>Status</InputLabel><Select value={doc.status} label="Status" onChange={e=>status(e.target.value)}>{['rascunho','em_revisao','revisado','aprovado'].map(s=><MenuItem key={s} value={s}>{s.replace('_',' ')}</MenuItem>)}</Select></FormControl></CardContent></Card>
 <Card><CardContent><Typography variant="h6" mb={1}>Fontes utilizadas</Typography>{doc.versions.at(-1).sources.map(s=><Box key={s.id} mb={2}><Chip size="small" label={s.title}/><Typography variant="caption" display="block" color="text.secondary" mt={.5}>{s.excerpt.slice(0,180)}…</Typography></Box>)}{!doc.versions.at(-1).sources.length&&<Typography color="text.secondary">Nenhuma fonte correlata localizada.</Typography>}</CardContent></Card>
 <Card sx={{mt:2}}><CardContent><Typography variant="h6">Histórico</Typography>{[...doc.versions].reverse().map(v=><Typography key={v.id} variant="body2" mt={1}>v{v.number} · {v.change_note}</Typography>)}</CardContent></Card></Box></Box></>
}
