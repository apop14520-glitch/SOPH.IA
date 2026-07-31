import React,{useMemo,useState} from 'react'
import ReactDOM from 'react-dom/client'
import {HashRouter} from 'react-router-dom'
import {CssBaseline, ThemeProvider} from '@mui/material'
import {ColorModeContext,makeTheme} from './theme'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

// O projeto mantém o transformador JSX clássico para funcionar também sem
// configuração adicional do Vite. Disponibiliza o runtime aos módulos gerados.
globalThis.React = React

function Root(){
 const [mode,setMode]=useState(()=>localStorage.getItem('sophia_theme')||'dark')
 const toggle=()=>setMode(current=>{const next=current==='dark'?'light':'dark';localStorage.setItem('sophia_theme',next);return next})
 const theme=useMemo(()=>makeTheme(mode),[mode])
 return <ColorModeContext.Provider value={{mode,toggle}}><ThemeProvider theme={theme}><CssBaseline/><HashRouter><ErrorBoundary><App/></ErrorBoundary></HashRouter></ThemeProvider></ColorModeContext.Provider>
}
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><Root/></React.StrictMode>)
