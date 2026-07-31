import React, {useEffect,useState} from 'react'
import {Alert,Box,Card,Chip,CircularProgress,Table,TableBody,TableCell,TableHead,TableRow,Typography} from '@mui/material'
import {useNavigate} from 'react-router-dom'
import {api,errorMessage} from '../api'
export default function Documents(){
 const [docs,setDocs]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),nav=useNavigate()
 useEffect(()=>{api.get('/documents').then(r=>setDocs(Array.isArray(r.data)?r.data:[])).catch(e=>setError(errorMessage(e,'Não foi possível carregar os documentos'))).finally(()=>setLoading(false))},[])
 return <><Typography variant="h4" mb={1}>Documentos</Typography><Typography color="text.secondary" mb={3}>Minutas criadas, revisadas e aprovadas na SOPH.IA.</Typography>
 {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
 {loading?<Box display="grid" placeItems="center" minHeight={280}><CircularProgress/></Box>:
 <Card>{docs.length?<Table><TableHead><TableRow><TableCell>Título</TableCell><TableCell>Tipo</TableCell><TableCell>Versão</TableCell><TableCell>Status</TableCell></TableRow></TableHead><TableBody>{docs.map(d=>{
   const latest=Array.isArray(d.versions)&&d.versions.length?d.versions[d.versions.length-1]:null
   return <TableRow hover key={d.id} onClick={()=>latest&&nav(`/documentos/${d.id}`)} sx={{cursor:latest?'pointer':'default'}}><TableCell>{d.title||'Documento sem título'}</TableCell><TableCell>{String(d.document_type||'não informado').replaceAll('_',' ')}</TableCell><TableCell>{latest?.number??'Sem versão'}</TableCell><TableCell><Chip size="small" label={String(d.status||'rascunho').replaceAll('_',' ')}/></TableCell></TableRow>
 })}</TableBody></Table>:<Box p={5} textAlign="center"><Typography variant="h6">Nenhum documento criado</Typography><Typography color="text.secondary" mt={1}>Use o chat ou “Criar documento” para produzir a primeira minuta.</Typography></Box>}</Card>}
 </>
}
