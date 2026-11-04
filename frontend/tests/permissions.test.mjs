// Testa as regras de permissão e de senha do Worker com um D1 simulado em memória.
// Executar com: node --test frontend/tests/permissions.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'

const {onRequest} = await import(new URL('../functions/api/[[path]].js', import.meta.url).href)

const SECRET_KEY = 'chave-de-teste-com-mais-de-32-caracteres'
const encoder = new TextEncoder()

function base64url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

// Mesmo formato de hash usado pelo Worker (PBKDF2-SHA256, 100 mil iterações).
async function passwordHash(password, salt = 'salt-de-teste-0001') {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000}, material, 256)
  return `pbkdf2$100000$${salt}$${base64url(new Uint8Array(bits))}`
}

async function seedUsers() {
  return [
    {id: 1, name: 'Administrador', email: 'admin@soph.ro.gov.br', role: 'admin', active: 1, sector_id: 1, password_hash: await passwordHash('Admin@1234')},
    {id: 2, name: 'Segundo Admin', email: 'segundo@soph.ro.gov.br', role: 'admin', active: 1, sector_id: 1, password_hash: await passwordHash('Segundo@1234')},
    {id: 3, name: 'Servidor', email: 'servidor@soph.ro.gov.br', role: 'padrao', active: 1, sector_id: 1, password_hash: await passwordHash('Servidor@1234')},
    {id: 4, name: 'Gerente de TI', email: 'gerente@soph.ro.gov.br', role: 'gerente', active: 1, sector_id: 1, password_hash: await passwordHash('Gerente@1234')},
  ]
}

// D1 simulado: cobre apenas as instruções SQL usadas pelas rotas testadas.
function createDb(initialUsers) {
  const users = initialUsers.map(user => ({...user}))
  const sectors = [{id: 1, name: 'Tecnologia da Informação'}]
  let nextId = Math.max(...users.map(user => user.id)) + 1

  function query(sql, args) {
    if (/SELECT COUNT\(\*\) count FROM users/.test(sql)) return {count: users.length}
    if (/WHERE u\.id=\? AND u\.active=1/.test(sql)) {
      const user = users.find(item => item.id === args[0] && item.active)
      return user ? {...user, sector_name: null} : null
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
    throw new Error(`SQL não suportado no teste: ${sql}`)
  }

  function exec(sql, args) {
    if (/^INSERT INTO users/.test(sql)) {
      const [name, email, password_hash, role, sector_id] = args
      const row = {id: nextId++, name, email, password_hash, role, active: 1, sector_id}
      users.push(row)
      return {meta: {last_row_id: row.id, changes: 1}}
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
    return {meta: {changes: 0}} // CREATE TABLE, ALTER, INSERT OR IGNORE em sectors etc.
  }

  return {
    users,
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...args) { this.args = args; return this },
        async first() { return query(this.sql, this.args) },
        async all() { return {results: []} },
        async run() { return exec(this.sql, this.args) },
      }
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()))
    },
  }
}

async function setup() {
  const db = createDb(await seedUsers())
  return {env: {DB: db, SECRET_KEY}, db}
}

async function call(env, method, path, body, token) {
  const headers = {'content-type': 'application/json'}
  if (token) headers.authorization = `Bearer ${token}`
  const request = new Request(`https://soph.test/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return onRequest({request, env, params: {path: path.replace(/^\//, '').split('/')}})
}

// Faz login pela própria rota, para que o token seja o gerado pelo Worker.
async function loginAs(env, email, password) {
  const res = await call(env, 'POST', '/auth/login', {email, password})
  const data = await res.json()
  assert.equal(res.status, 200, `login de ${email} falhou: ${data.detail}`)
  return data.access_token
}

const GERENTE = ['gerente@soph.ro.gov.br', 'Gerente@1234']
const ADMIN = ['admin@soph.ro.gov.br', 'Admin@1234']
const SEGUNDO_ADMIN = ['segundo@soph.ro.gov.br', 'Segundo@1234']

test('gerente não cria contas administrativas', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ...GERENTE)
  for (const role of ['admin', 'gerente']) {
    const res = await call(env, 'POST', '/users', {name: 'Novo', email: `novo-${role}@soph.ro.gov.br`, password: 'Novo@12345', role, sector_id: 1}, token)
    assert.equal(res.status, 403, `gerente conseguiu criar perfil ${role}`)
  }
})

test('gerente cria conta comum com senha forte', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ...GERENTE)
  const res = await call(env, 'POST', '/users', {name: 'Novo', email: 'novo@soph.ro.gov.br', password: 'Novo@12345', role: 'padrao', sector_id: 1}, token)
  assert.equal(res.status, 201)
})

test('criação de usuário recusa senha fraca ou vazia', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ...ADMIN)
  for (const password of ['', '123', 'semmaiuscula1!', 'SemSimbolo123']) {
    const res = await call(env, 'POST', '/users', {name: 'Novo', email: 'novo@soph.ro.gov.br', password, role: 'padrao', sector_id: 1}, token)
    assert.equal(res.status, 400, `senha aceita indevidamente: "${password}"`)
  }
})

test('gerente não promove conta comum a administrador ou gerente', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ...GERENTE)
  for (const role of ['admin', 'gerente']) {
    const res = await call(env, 'PATCH', '/users/3', {role}, token)
    assert.equal(res.status, 403, `gerente promoveu conta comum a ${role}`)
  }
})

test('gerente não altera, redefine senha ou desativa administrador', async () => {
  const {env, db} = await setup()
  const token = await loginAs(env, ...GERENTE)
  assert.equal((await call(env, 'PATCH', '/users/1', {active: false}, token)).status, 403)
  assert.equal((await call(env, 'PUT', '/users/1/password', {password: 'Troca@12345'}, token)).status, 403)
  assert.equal((await call(env, 'DELETE', '/users/1', undefined, token)).status, 403)
  assert.equal(db.users.find(user => user.id === 1).active, 1, 'administrador foi desativado por gerente')
})

test('gerente gerencia contas comuns normalmente', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ...GERENTE)
  assert.equal((await call(env, 'PATCH', '/users/3', {sector_id: 1}, token)).status, 200)
  assert.equal((await call(env, 'DELETE', '/users/3', undefined, token)).status, 200)
})

test('administrador promove conta comum e desativa outro administrador', async () => {
  const {env, db} = await setup()
  const token = await loginAs(env, ...ADMIN)
  assert.equal((await call(env, 'PATCH', '/users/3', {role: 'gerente'}, token)).status, 200)
  assert.equal(db.users.find(user => user.id === 3).role, 'gerente')
  assert.equal((await call(env, 'DELETE', '/users/2', undefined, token)).status, 200)
  assert.equal(db.users.find(user => user.id === 2).active, 0)
})

test('administrador não desativa nem rebaixa a própria conta', async () => {
  const {env, db} = await setup()
  const token = await loginAs(env, ...ADMIN)
  assert.equal((await call(env, 'DELETE', '/users/1', undefined, token)).status, 403)
  assert.equal((await call(env, 'PATCH', '/users/1', {role: 'padrao'}, token)).status, 403)
  assert.equal(db.users.find(user => user.id === 1).role, 'admin')
})

test('perfil inválido é recusado', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ...ADMIN)
  const res = await call(env, 'PATCH', '/users/3', {role: 'superusuario'}, token)
  assert.equal(res.status, 400)
})

test('administrador redefine senha só com política forte', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ...ADMIN)
  assert.equal((await call(env, 'PUT', '/users/3/password', {password: '123'}, token)).status, 400)
  assert.equal((await call(env, 'PUT', '/users/3/password', {password: 'Nova@12345'}, token)).status, 200)
})

test('gerente não redefine senha de outro gerente ou administrador', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ...ADMIN)
  await call(env, 'PATCH', '/users/3', {role: 'gerente'}, token)
  const managerToken = await loginAs(env, ...GERENTE)
  const res = await call(env, 'PUT', '/users/3/password', {password: 'Troca@12345'}, managerToken)
  assert.equal(res.status, 403)
})

test('cadastro público exige senha forte e setor válido', async () => {
  const {env} = await setup()
  const base = {name: 'Nova Pessoa', email: 'nova@soph.ro.gov.br', sector: 'Tecnologia da Informação'}
  assert.equal((await call(env, 'POST', '/auth/register', {...base, password: '123'})).status, 400)
  assert.equal((await call(env, 'POST', '/auth/register', {...base, password: 'semmaiuscula1!'})).status, 400)
  assert.equal((await call(env, 'POST', '/auth/register', {...base, password: 'Forte@1234', sector: 'Setor inexistente'})).status, 400)
  assert.equal((await call(env, 'POST', '/auth/register', {...base, password: 'Forte@1234'})).status, 201)
})

test('segundo administrador tem os mesmos poderes do primeiro', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ...SEGUNDO_ADMIN)
  assert.equal((await call(env, 'PATCH', '/users/1', {sector_id: 1}, token)).status, 200)
})
