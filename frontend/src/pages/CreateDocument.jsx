import React, {useState} from 'react'
import {Alert,Box,Button,Card,CardContent,FormControl,InputLabel,MenuItem,Select,TextField,Typography} from '@mui/material'
import {useNavigate} from 'react-router-dom'
import {api,errorMessage} from '../api'
const configs={
 despacho:['interessado','assunto','contexto','decisao','destino','local_data','assinante','cargo'],
 memorando:['destinatario','remetente','assunto','mensagem','providencia','prazo','assinante','cargo'],
 etp:['unidade','objeto','problema','requisitos','alternativas','solucao','quantidade','memoria_calculo','estimativa_valor','resultados','riscos','sustentabilidade','conclusao'],
 termo_referencia:['objeto','justificativa','especificacoes','quantidade','execucao','obrigacoes_contratada','obrigacoes_contratante','fiscalizacao','pagamento','selecao','estimativa_valor','sancoes_riscos']
}
const label=x=>x.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')
export default function CreateDocument(){
 const [type,setType]=useState('despacho'),[title,setTitle]=useState(''),[fields,setFields]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),nav=useNavigate()
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{const {data}=await api.post('/documents/generate',{document_type:type,title,fields});nav(`/documentos/${data.id}`)}catch(e){setError(errorMessage(e,'Falha ao gerar'))}finally{setBusy(false)}}
 return <><Typography variant="h4">Criar documento</Typography><Typography color="text.secondary" mb={3}>Preencha apenas fatos conhecidos. Campos vazios serão sinalizados na minuta.</Typography>
 <Card><CardContent><Box component="form" onSubmit={submit} sx={{display:'grid',gap:2,maxWidth:900}}>{error&&<Alert severity="error">{error}</Alert>}
 <FormControl><InputLabel>Tipo</InputLabel><Select value={type} label="Tipo" onChange={e=>{setType(e.target.value);setFields({})}}>{Object.keys(configs).map(k=><MenuItem key={k} value={k}>{label(k)}</MenuItem>)}</Select></FormControl>
 <TextField required label="Título interno do documento" value={title} onChange={e=>setTitle(e.target.value)}/>
 {configs[type].map(k=><TextField key={k} label={label(k)} value={fields[k]||''} multiline={['contexto','decisao','mensagem','problema','requisitos','alternativas','solucao','justificativa','especificacoes','execucao'].includes(k)} minRows={2} onChange={e=>setFields({...fields,[k]:e.target.value})}/>)}
 <Button disabled={busy} type="submit" variant="contained" size="large">{busy?'Gerando...':'Gerar minuta'}</Button>
 </Box></CardContent></Card></>
}
