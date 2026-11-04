// Regras de permissão, senha e login do Worker. Executar com:
// node --test frontend/tests/permissions.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, GERENTE, SEGUNDO_ADMIN, call, loginAs, setup} from './helpers.mjs'

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

const EMAIL = ADMIN[0]
const RIGHT = ADMIN[1]
const WRONG = 'senha-errada'

test('bloqueia a conta após 5 senhas erradas, mesmo com a senha correta', async () => {
  const {env} = await setup()
  const ip = '203.0.113.10'
  for (let i = 0; i < 5; i++) {
    assert.equal((await call(env, 'POST', '/auth/login', {email: EMAIL, password: WRONG}, undefined, ip)).status, 401)
  }
  assert.equal((await call(env, 'POST', '/auth/login', {email: EMAIL, password: RIGHT}, undefined, ip)).status, 429)
})

test('o bloqueio não revela se o e-mail existe', async () => {
  const {env} = await setup()
  const ip = '203.0.113.11'
  const missing = 'inexistente@soph.ro.gov.br'
  for (let i = 0; i < 5; i++) {
    assert.equal((await call(env, 'POST', '/auth/login', {email: missing, password: WRONG}, undefined, ip)).status, 401)
  }
  assert.equal((await call(env, 'POST', '/auth/login', {email: missing, password: WRONG}, undefined, ip)).status, 429)
})

test('login correto zera o contador da conta', async () => {
  const {env} = await setup()
  const ip = '203.0.113.12'
  for (let i = 0; i < 4; i++) await call(env, 'POST', '/auth/login', {email: EMAIL, password: WRONG}, undefined, ip)
  assert.equal((await call(env, 'POST', '/auth/login', {email: EMAIL, password: RIGHT}, undefined, ip)).status, 200)
  for (let i = 0; i < 4; i++) await call(env, 'POST', '/auth/login', {email: EMAIL, password: WRONG}, undefined, ip)
  assert.equal((await call(env, 'POST', '/auth/login', {email: EMAIL, password: RIGHT}, undefined, ip)).status, 200)
})

test('o bloqueio expira após 15 minutos', async () => {
  const {env} = await setup()
  const ip = '203.0.113.14'
  const realNow = Date.now
  let fake = realNow()
  Date.now = () => fake
  try {
    for (let i = 0; i < 5; i++) await call(env, 'POST', '/auth/login', {email: EMAIL, password: WRONG}, undefined, ip)
    assert.equal((await call(env, 'POST', '/auth/login', {email: EMAIL, password: RIGHT}, undefined, ip)).status, 429)
    fake += 16 * 60 * 1000
    assert.equal((await call(env, 'POST', '/auth/login', {email: EMAIL, password: RIGHT}, undefined, ip)).status, 200)
  } finally {
    Date.now = realNow
  }
})

test('limite por origem bloqueia tentativas espalhadas por várias contas', async () => {
  const {env} = await setup()
  const attacker = '203.0.113.15'
  for (let i = 0; i < 50; i++) {
    await call(env, 'POST', '/auth/login', {email: `conta${i}@soph.ro.gov.br`, password: WRONG}, undefined, attacker)
  }
  assert.equal((await call(env, 'POST', '/auth/login', {email: EMAIL, password: RIGHT}, undefined, attacker)).status, 429)
  assert.equal((await call(env, 'POST', '/auth/login', {email: EMAIL, password: RIGHT}, undefined, '198.51.100.5')).status, 200)
})
