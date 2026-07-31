import React from 'react'
import {Alert,Box,Button,Typography} from '@mui/material'

export default class ErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return{error}}
 componentDidCatch(error,info){console.error('SOPH.IA interface error',error,info)}
 render(){
  if(!this.state.error)return this.props.children
  return <Box sx={{minHeight:'100vh',display:'grid',placeItems:'center',p:3}}><Box maxWidth={620}><Alert severity="error"><Typography fontWeight={800}>A interface encontrou um erro.</Typography><Typography variant="body2" mt={1}>{this.state.error.message}</Typography></Alert><Button variant="contained" sx={{mt:2}} onClick={()=>{localStorage.removeItem('sophia_local_conversation');location.hash='#/';location.reload()}}>Voltar ao início</Button></Box></Box>
 }
}
