import React, {useEffect,useState} from 'react'
import {Alert,Box,Button,Card,CardContent,Chip,TextField,Typography} from '@mui/material'
import {api,errorMessage} from '../api'
export default function Knowledge(){
 const [items,setItems]=useState([]),[title,setTitle]=useState(''),[category,setCategory]=useState('normativo'),[file,setFile]=useState(null),[message,setMessage]=useState('')
 const load=()=>api.get('/knowledge').then(r=>setItems(r.data))
 useEffect(load,[])
 const submit=async e=>{e.preventDefault();const form=new FormData();form.append('title',title);form.append('category',category);form.append('file',file);try{await api.post('/knowledge/upload',form);setMessage('Documento incorporado à biblioteca.');setTitle('');setFile(null);load()}catch(e){setMessage(errorMessage(e,'Falha no upload'))}}
 return <><Typography variant="h4">Biblioteca institucional</Typography><Typography color="text.secondary" mb={3}>PDF e DOCX com texto selecionável, até 15 MB.</Typography>
 <Card sx={{mb:3}}><CardContent><Box component="form" onSubmit={submit} display="grid" gridTemplateColumns="2fr 1fr 2fr auto" gap={2} alignItems="center"><TextField required label="Título" value={title} onChange={e=>setTitle(e.target.value)}/><TextField label="Categoria" value={category} onChange={e=>setCategory(e.target.value)}/><Button component="label" variant="outlined">{file?.name||'Escolher arquivo'}<input hidden required type="file" accept=".pdf,.docx" onChange={e=>setFile(e.target.files[0])}/></Button><Button type="submit" variant="contained" disabled={!file}>Enviar</Button></Box>{message&&<Alert sx={{mt:2}}>{message}</Alert>}</CardContent></Card>
 <Box display="grid" gap={2}>{items.map(x=><Card key={x.id}><CardContent><Box display="flex" gap={1} alignItems="center"><Typography variant="h6">{x.title}</Typography><Chip size="small" label={x.category}/></Box><Typography color="text.secondary" mt={1}>{x.content.slice(0,320)}{x.content.length>320?'…':''}</Typography></CardContent></Card>)}</Box></>
}
