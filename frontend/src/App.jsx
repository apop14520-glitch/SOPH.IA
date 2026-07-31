import React, {useEffect, useState} from 'react'
import {Navigate, Route, Routes} from 'react-router-dom'
import {api} from './api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CreateDocument from './pages/CreateDocument'
import Documents from './pages/Documents'
import Editor from './pages/Editor'
import Knowledge from './pages/Knowledge'
import Admin from './pages/Admin'
import Chat from './pages/Chat'

export default function App(){
  const [user,setUser]=useState(null), [loading,setLoading]=useState(true)
  useEffect(()=>{const token=localStorage.getItem('sophia_token');if(token==='local'){localStorage.removeItem('sophia_token');localStorage.removeItem('sophia_current_user');setLoading(false);return}api.get('/auth/me').then(r=>{setUser(r.data);localStorage.setItem('sophia_current_user',JSON.stringify(r.data))}).catch(()=>{localStorage.removeItem('sophia_token');localStorage.removeItem('sophia_current_user')}).finally(()=>setLoading(false))},[])
  if(loading) return null
  if(!user) return <Routes><Route path="*" element={<Login onLogin={setUser}/>}/></Routes>
  return <Layout user={user} onLogout={()=>{localStorage.removeItem('sophia_token');localStorage.removeItem('sophia_current_user');location.hash='#/';setUser(null)}}>
    <Routes>
      <Route path="/" element={<Chat/>}/>
      <Route path="/chat/:id" element={<Chat/>}/>
      <Route path="/painel" element={<Dashboard/>}/>
      <Route path="/criar" element={<CreateDocument/>}/>
      <Route path="/documentos" element={<Documents/>}/>
      <Route path="/documentos/:id" element={<Editor/>}/>
      <Route path="/biblioteca" element={<Knowledge/>}/>
      <Route path="/admin" element={['admin','gerente'].includes(user.role)?<Admin currentUser={user}/>:<Navigate to="/"/>}/>
      <Route path="*" element={<Navigate to="/"/>}/>
    </Routes>
  </Layout>
}
