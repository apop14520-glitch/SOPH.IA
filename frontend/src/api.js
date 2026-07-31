import axios from 'axios'

// Usa o mesmo endereço pelo qual o usuário abriu a SOPH.IA. Em
// desenvolvimento, o Vite encaminha /api ao backend local; em produção,
// o proxy web faz o mesmo. Assim, computadores da rede não tentam acessar
// o próprio "localhost".
export const api = axios.create({baseURL: import.meta.env.VITE_API_URL || '/api'})
api.interceptors.request.use(config => {
  const token = localStorage.getItem('sophia_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function errorMessage(error, fallback = 'Não foi possível concluir a operação') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(item => item.msg || 'Campo inválido').join('; ')
  if (detail && typeof detail === 'object') return detail.msg || JSON.stringify(detail)
  return fallback
}
