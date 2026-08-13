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


// Na hospedagem estática, uma rota /api inexistente pode devolver o index.html
// com status 200. Sem esta validação, o React interpreta o HTML como dados da
// API e componentes que esperam listas falham com "map is not a function".
api.interceptors.response.use(response => {
  const contentType = String(response.headers?.['content-type'] || '').toLowerCase()
  const isHtml = contentType.includes('text/html') || (
    typeof response.data === 'string' && /^\s*<!doctype html|^\s*<html/i.test(response.data)
  )
  if (isHtml) {
    return Promise.reject({
      config: response.config,
      response: {
        status: 503,
        data: {detail: 'O servidor da SOPH.IA não está conectado. Configure VITE_API_URL com o endereço público do backend FastAPI.'},
      },
    })
  }
  return response
})

export const asArray = value => Array.isArray(value) ? value : []

export function errorMessage(error, fallback = 'Não foi possível concluir a operação') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(item => item.msg || 'Campo inválido').join('; ')
  if (detail && typeof detail === 'object') return detail.msg || JSON.stringify(detail)
  return fallback
}
