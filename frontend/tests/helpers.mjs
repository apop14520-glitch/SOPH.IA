// Auxiliares para testar o Worker com um D1 simulado em memória e login real.
// Usado pelos testes em frontend/tests e pela medição das respostas da avaliação.
import {randomBytes} from 'node:crypto'

export const {onRequest} = await import(new URL('../functions/api/[[path]].js', import.meta.url).href)

// Senhas de teste geradas a cada execução: nenhuma senha fica escrita no repositório.
const senhaAleatoria = () => `${randomBytes(12).toString('base64url')}Aa1!`
const SENHA_SERVIDOR = senhaAleatoria()
const SENHA_GERENTE = senhaAleatoria()
const SENHA_SEGUNDO_ADMIN = senhaAleatoria()
const SENHA_ADMIN = senhaAleatoria()

export const SECRET_KEY = 'chave-de-teste-com-mais-de-32-caracteres'
export const ADMIN = ['admin@soph.ro.gov.br', SENHA_ADMIN]
export const SEGUNDO_ADMIN = ['segundo@soph.ro.gov.br', SENHA_SEGUNDO_ADMIN]
export const GERENTE = ['gerente@soph.ro.gov.br', SENHA_GERENTE]

const encoder = new TextEncoder()

function base64url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

// Mesmo formato de hash usado pelo Worker (PBKDF2-SHA256, 100 mil iterações).
export async function passwordHash(password, salt = 'salt-de-teste-0001') {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000}, material, 256)
  return `pbkdf2$100000$${salt}$${base64url(new Uint8Array(bits))}`
}

export async function seedUsers() {
  return [
    {id: 1, name: 'Administrador', email: 'admin@soph.ro.gov.br', role: 'admin', active: 1, sector_id: 1, password_hash: await passwordHash(SENHA_ADMIN)},
    {id: 2, name: 'Segundo Admin', email: 'segundo@soph.ro.gov.br', role: 'admin', active: 1, sector_id: 1, password_hash: await passwordHash(SENHA_SEGUNDO_ADMIN)},
    {id: 3, name: 'Servidor', email: 'servidor@soph.ro.gov.br', role: 'padrao', active: 1, sector_id: 1, password_hash: await passwordHash(SENHA_SERVIDOR)},
    {id: 4, name: 'Gerente de TI', email: 'gerente@soph.ro.gov.br', role: 'gerente', active: 1, sector_id: 1, password_hash: await passwordHash(SENHA_GERENTE)},
  ]
}

// D1 simulado: cobre apenas as instruções SQL usadas pelas rotas testadas.
export function createDb(initialUsers) {
  const users = initialUsers.map(user => ({...user}))
  const sectors = [{id: 1, name: 'Tecnologia da Informação'}]
  const loginAttempts = new Map()
  const passwordResets = []
  const conversations = []
  const chatMessages = []
  let nextId = Math.max(...users.map(user => user.id)) + 1
  let nextMessageId = 1

  function query(sql, args) {
    if (/SELECT COUNT\(\*\) count FROM users/.test(sql)) return {count: users.length}
    if (/^SELECT id FROM users WHERE lower\(email\)=lower\(\?\) AND id<>\?$/.test(sql)) {
      const user = users.find(item => item.email === String(args[0]).toLowerCase() && item.id !== args[1])
      return user ? {id: user.id} : null
    }
    if (/WHERE u\.id=\? AND u\.active=1/.test(sql)) {
      const user = users.find(item => item.id === args[0] && item.active)
      return user ? {...user, sector_name: null} : null
    }
    if (/^SELECT id,email,active FROM users WHERE lower\(email\)=lower\(\?\)$/.test(sql)) {
      const user = users.find(item => item.email === String(args[0]).toLowerCase())
      return user ? {id: user.id, email: user.email, active: user.active} : null
    }
    if (/WHERE lower\(u\.email\)=lower\(\?\)/.test(sql)) {
      const user = users.find(item => item.email === String(args[0]).toLowerCase())
      return user ? {...user, sector_name: null} : null
    }
    if (/SELECT COUNT\(\*\) AS total FROM users WHERE role='admin' AND active=1/.test(sql)) {
      return {total: users.filter(item => item.role === 'admin' && item.active).length}
    }
    if (/SELECT id,role,active FROM users WHERE id=\?/.test(sql) || /SELECT id,name,email,role,active,sector_id FROM users WHERE id=\?/.test(sql)) {
      const user = users.find(item => item.id === args[0])
      return user ? {...user} : null
    }
    if (/FROM sectors WHERE lower\(name\)=lower\(\?\)/.test(sql)) {
      const sector = sectors.find(item => item.name.toLowerCase() === String(args[0]).toLowerCase())
      return sector ? {id: sector.id} : null
    }
    if (/FROM login_attempts WHERE key=\?/.test(sql)) {
      const row = loginAttempts.get(args[0])
      return row ? {...row} : null
    }
    if (/^SELECT id,user_id FROM password_resets WHERE token_hash=\? AND used_at IS NULL AND expires_at>\?$/.test(sql)) {
      const row = passwordResets.find(item => item.token_hash === args[0] && item.used_at === null && item.expires_at > args[1])
      return row ? {id: row.id, user_id: row.user_id} : null
    }
    if (/FROM settings WHERE key=\?/.test(sql)) return null
    if (/^SELECT \* FROM conversations WHERE id=\? AND user_id=\?$/.test(sql)) {
      const conversation = conversations.find(item => item.id === args[0] && item.user_id === args[1])
      return conversation ? {...conversation} : null
    }
    if (/^SELECT \* FROM chat_messages WHERE id=\?$/.test(sql)) {
      const message = chatMessages.find(item => item.id === args[0])
      return message ? {...message} : null
    }
    if (/^SELECT id FROM conversations WHERE id=\? AND user_id=\?$/.test(sql)) {
      const conversation = conversations.find(item => item.id === args[0] && item.user_id === args[1])
      return conversation ? {id: conversation.id} : null
    }
    throw new Error(`SQL não suportado no teste: ${sql}`)
  }

  function exec(sql, args) {
    if (/^INSERT INTO users/.test(sql)) {
      const [name, email, password_hash, role, sector_id] = args
      const row = {id: nextId++, name, email, password_hash, role, active: 1, sector_id}
      users.push(row)
      return {meta: {last_row_id: row.id, changes: 1}}
    }
    if (/^UPDATE users SET email=\? WHERE id=\?$/.test(sql)) {
      const user = users.find(item => item.id === args[1])
      if (user) user.email = String(args[0]).toLowerCase()
      return {meta: {changes: user ? 1 : 0}}
    }
    const update = sql.match(/^UPDATE users SET (role|sector_id|active|password_hash)=\? WHERE id=\?$/)
    if (update) {
      const user = users.find(item => item.id === args[1])
      if (user) user[update[1]] = args[0]
      return {meta: {changes: user ? 1 : 0}}
    }
    if (/^UPDATE users SET active=0 WHERE id=\?$/.test(sql)) {
      const user = users.find(item => item.id === args[0])
      if (user) user.active = 0
      return {meta: {changes: user ? 1 : 0}}
    }
    if (/^INSERT INTO login_attempts/.test(sql)) {
      const [key, failures, window_start, locked_until] = args
      loginAttempts.set(key, {failures, window_start, locked_until})
      return {meta: {changes: 1}}
    }
    if (/^DELETE FROM login_attempts WHERE key=\?$/.test(sql)) {
      loginAttempts.delete(args[0])
      return {meta: {changes: 1}}
    }
    if (/^INSERT INTO chat_messages/.test(sql)) {
      const role = sql.includes("'assistant'") ? 'assistant' : 'user'
      const row = {id: nextMessageId++, conversation_id: args[0], role, content: args[1], sources: '[]'}
      chatMessages.push(row)
      return {meta: {last_row_id: row.id, changes: 1}}
    }
    if (/^INSERT INTO password_resets/.test(sql)) {
      const [user_id, token_hash, expires_at] = args
      passwordResets.push({id: passwordResets.length + 1, user_id, token_hash, expires_at, used_at: null})
      return {meta: {changes: 1, last_row_id: passwordResets.length}}
    }
    if (/^UPDATE password_resets SET used_at=\? WHERE user_id=\? AND used_at IS NULL$/.test(sql)) {
      let changes = 0
      for (const row of passwordResets) if (row.user_id === args[1] && row.used_at === null) { row.used_at = args[0]; changes += 1 }
      return {meta: {changes}}
    }
    const renamed = sql.match(/^UPDATE conversations SET title=\?(?:,updated_at=CURRENT_TIMESTAMP)? WHERE id=\?$/)
    if (renamed) {
      const conversation = conversations.find(item => item.id === args[1])
      if (conversation) conversation.title = args[0]
      return {meta: {changes: conversation ? 1 : 0}}
    }
    return {meta: {changes: 0}} // CREATE TABLE, ALTER, UPDATE conversations, INSERT OR IGNORE em sectors etc.
  }

  return {
    users,
    conversations,
    passwordResets,
    chatMessages,
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...args) { this.args = args; return this },
        async first() { return query(this.sql, this.args) },
        async all() {
          if (/FROM conversations c WHERE c\.user_id=\?/.test(this.sql)) {
            // Mesma filtragem da rota: só conversas com mensagens, com a primeira pergunta do usuário.
            return {results: conversations
              .filter(item => item.user_id === this.args[0] && chatMessages.some(message => message.conversation_id === item.id))
              .map(item => ({
                id: item.id,
                title: item.title,
                created_at: item.created_at ?? null,
                updated_at: item.updated_at ?? null,
                first_prompt: chatMessages.find(message => message.conversation_id === item.id && message.role === 'user')?.content ?? null,
              }))}
          }
          return {results: []}
        },
        async run() { return exec(this.sql, this.args) },
      }
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()))
    },
  }
}

export async function setup(extra = {}) {
  const db = createDb(await seedUsers())
  return {env: {DB: db, SECRET_KEY, ...extra}, db}
}

export async function call(env, method, path, body, token, ip) {
  const headers = {'content-type': 'application/json'}
  if (token) headers.authorization = `Bearer ${token}`
  if (ip) headers['cf-connecting-ip'] = ip
  const request = new Request(`https://soph.test/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return onRequest({request, env, params: {path: path.replace(/^\//, '').split('/')}})
}

// Faz login pela própria rota, para que o token seja o gerado pelo Worker.
export async function loginAs(env, email, password) {
  const res = await call(env, 'POST', '/auth/login', {email, password})
  const data = await res.json()
  if (res.status !== 200) throw new Error(`login de ${email} falhou: ${data.detail}`)
  return data.access_token
}
