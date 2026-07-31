import React from 'react'
import {createTheme} from '@mui/material/styles'

export const ColorModeContext=React.createContext({mode:'dark',toggle:()=>{}})

export const makeTheme=mode=>createTheme({
  palette:{
    mode,
    primary:{main:'#f26522',contrastText:'#fff'},
    secondary:{main:'#747b7d'},
    background:mode==='dark'?{default:'#151311',paper:'#24201d'}:{default:'#f8f5f1',paper:'#ffffff'},
    text:mode==='dark'?{primary:'#fff8f2',secondary:'#c9beb5'}:{primary:'#2c211b',secondary:'#71635b'},
  },
  shape:{borderRadius:12},
  typography:{fontFamily:'"Inter","Segoe UI",sans-serif',h4:{fontWeight:750},h6:{fontWeight:700}},
  components:{
    MuiCard:{styleOverrides:{root:{border:`1px solid ${mode==='dark'?'rgba(242,101,34,.25)':'rgba(242,101,34,.20)'}`,backgroundImage:'none'}}},
    MuiButton:{styleOverrides:{root:{textTransform:'none',fontWeight:700}}},
    MuiDrawer:{styleOverrides:{paper:{backgroundImage:'none'}}},
  }
})
