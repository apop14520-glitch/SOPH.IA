import React from 'react'
import {createTheme} from '@mui/material/styles'

export const ColorModeContext=React.createContext({mode:'dark',toggle:()=>{}})

export const makeTheme=mode=>createTheme({
  palette:{
    mode,
    primary:mode==='dark'?{main:'#f26522',contrastText:'#1a0f08'}:{main:'#c2410c',contrastText:'#ffffff'},
    secondary:{main:'#747b7d'},
    background:mode==='dark'?{default:'#151311',paper:'#24201d'}:{default:'#f8f5f1',paper:'#ffffff'},
    text:mode==='dark'?{primary:'#fff8f2',secondary:'#c9beb5'}:{primary:'#2c211b',secondary:'#71635b'},
  },
  shape:{borderRadius:12},
  typography:{fontFamily:'"Inter Variable","Inter","Segoe UI",sans-serif',h4:{fontWeight:750},h6:{fontWeight:700}},
  components:{
    MuiCard:{styleOverrides:{root:{border:`1px solid ${mode==='dark'?'rgba(255,255,255,.12)':'rgba(44,33,27,.14)'}`,backgroundImage:'none'}}},
    MuiButton:{styleOverrides:{root:{textTransform:'none',fontWeight:700,'@media (max-width:899.95px)':{minHeight:44}},outlined:{borderColor:mode==='dark'?'rgba(255,255,255,.24)':'rgba(44,33,27,.22)'}}},
    MuiTab:{styleOverrides:{root:{textTransform:'none'}}},
    MuiDrawer:{styleOverrides:{paper:{backgroundImage:'none'}}},
    MuiCssBaseline:{styleOverrides:{html:{colorScheme:mode}}},
  }
})
