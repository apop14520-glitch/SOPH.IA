import React, {useEffect,useState} from 'react'
import {Box,Button,Card,CardContent,Chip,Grid,Typography} from '@mui/material'
import {useNavigate} from 'react-router-dom'
import {api} from '../api'
export default function Dashboard(){
 const [docs,setDocs]=useState([]),[knowledge,setKnowledge]=useState([]),nav=useNavigate()
 useEffect(()=>{Promise.all([api.get('/documents'),api.get('/knowledge')]).then(([a,b])=>{setDocs(a.data);setKnowledge(b.data)})},[])
 const cards=[['Documentos',docs.length],['Em revisão',docs.filter(d=>d.status==='em_revisao').length],['Fontes institucionais',knowledge.length]]
 return <><Box display="flex" justifyContent="space-between" alignItems="center" mb={3}><Box><Typography variant="h4">Visão geral</Typography><Typography color="text.secondary">Elaboração segura, rastreável e assistida.</Typography></Box><Button variant="contained" onClick={()=>nav('/criar')}>Nova minuta</Button></Box>
 <Grid container spacing={2}>{cards.map(([l,n])=><Grid size={{xs:12,md:4}} key={l}><Card><CardContent><Typography color="text.secondary">{l}</Typography><Typography variant="h3" mt={1}>{n}</Typography></CardContent></Card></Grid>)}</Grid>
 <Typography variant="h6" mt={4} mb={2}>Documentos recentes</Typography><Card>{docs.slice(0,5).map(d=><Box key={d.id} onClick={()=>nav(`/documentos/${d.id}`)} sx={{p:2,borderBottom:'1px solid #18313d',cursor:'pointer',display:'flex',justifyContent:'space-between'}}><Box><Typography fontWeight={700}>{d.title}</Typography><Typography variant="caption" color="text.secondary">{d.document_type.replace('_',' ').toUpperCase()} · versão {d.versions.at(-1).number}</Typography></Box><Chip label={d.status.replace('_',' ')}/></Box>)}{!docs.length&&<CardContent><Typography color="text.secondary">Nenhuma minuta criada.</Typography></CardContent>}</Card></>
}
