import React, {Suspense, lazy, useEffect, useState} from 'react'
import {Navigate, Route, Routes} from 'react-router-dom'
import {Box, CircularProgress} from '@mui/material'
import {api} from './api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Chat from './pages/Chat'

// A Administração só é usada por administradores e gerentes; carregá-la sob demanda reduz o primeiro acesso.
const Admin = lazy(() => import('./pages/Admin'))

export default function App(){
  const [user,setUser]=useState(null), [loading,setLoading]=useState(true)

  useEffect(()=>{
    localStorage.removeItem('sophia_token')
    api.get('/auth/me')
      .then(r=>setUser(r.data))
      .catch(()=>setUser(null))
      .finally(()=>setLoading(false))
  },[])

  if(loading) return <Box sx={{minHeight:'100dvh',display:'grid',placeItems:'center'}}><CircularProgress aria-label="Carregando"/></Box>
  if(!user) return <Routes><Route path="*" element={<Login onLogin={setUser}/>}/></Routes>

  const logout=()=>{api.post('/auth/logout').catch(()=>{});location.hash='#/';setUser(null)}
  const canAdmin=['admin','gerente'].includes(user.role)

  return <Layout user={user} onLogout={logout}>
    <Suspense fallback={<Box sx={{display:'grid',placeItems:'center',minHeight:240}}><CircularProgress/></Box>}>
      <Routes>
        <Route path="/" element={<Chat/>}/>
        <Route path="/chat/:id" element={<Chat/>}/>
        <Route path="/admin" element={canAdmin?<Admin currentUser={user}/>:<Navigate to="/"/>}/>
        <Route path="*" element={<Navigate to="/"/>}/>
      </Routes>
    </Suspense>
  </Layout>
}
