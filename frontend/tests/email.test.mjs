// E-mail sem restrição de domínio: criação, troca pelo painel e cadastro público. Executar com:
// node --test frontend/tests/email.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, call, loginAs, setup} from './helpers.mjs'

const SENHA = 'Novo@12345'

test('admin cria usuário com Gmail e a pessoa entra com esse e-mail', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  const res = await call(env, 'POST', '/users', {name: 'Pessoa Teste', email: 'Pessoa.Teste@Gmail.com', password: SENHA, role: 'padrao', sector_id: 1}, token)
  assert.equal(res.status, 201)
  assert.equal((await res.json()).email, 'pessoa.teste@gmail.com')
  assert.equal((await call(env, 'POST', '/auth/login', {email: 'pessoa.teste@gmail.com', password: SENHA})).status, 200)
})

test('e-mail sem formato válido é recusado na criação e na troca', async () => {
  const {env, db} = await setup()
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  const created = await call(env, 'POST', '/users', {name: 'Sem Arroba', email: 'sem-arroba', password: SENHA, role: 'padrao', sector_id: 1}, token)
  assert.equal(created.status, 400)
  const changed = await call(env, 'PATCH', '/users/3', {email: 'nada'}, token)
  assert.equal(changed.status, 400)
  assert.equal(db.users.find(user => user.id === 3).email, 'servidor@soph.ro.gov.br')
})

test('admin troca o e-mail de um usuário existente; o antigo deixa de entrar e o novo passa', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  assert.equal((await call(env, 'PUT', '/users/3/password', {password: SENHA}, token)).status, 200)
  const res = await call(env, 'PATCH', '/users/3', {email: 'Servidor.Pessoal@Gmail.com'}, token)
  assert.equal(res.status, 200)
  assert.equal((await call(env, 'POST', '/auth/login', {email: 'servidor@soph.ro.gov.br', password: SENHA})).status, 401)
  assert.equal((await call(env, 'POST', '/auth/login', {email: 'servidor.pessoal@gmail.com', password: SENHA})).status, 200)
})

test('e-mail já usado por outra conta é recusado; salvar o mesmo e-mail na própria conta é aceito', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  assert.equal((await call(env, 'PATCH', '/users/3', {email: ADMIN[0].toUpperCase()}, token)).status, 409)
  assert.equal((await call(env, 'PATCH', '/users/1', {email: ADMIN[0]}, token)).status, 200)
})

test('perfil padrão não altera e-mail de outras contas', async () => {
  const {env} = await setup()
  const admin = await loginAs(env, ADMIN[0], ADMIN[1])
  assert.equal((await call(env, 'POST', '/users', {name: 'Padrão', email: 'padrao@gmail.com', password: SENHA, role: 'padrao', sector_id: 1}, admin)).status, 201)
  const padrao = await loginAs(env, 'padrao@gmail.com', SENHA)
  assert.equal((await call(env, 'PATCH', '/users/3', {email: 'invasao@gmail.com'}, padrao)).status, 403)
})

test('cadastro público cria conta inativa até o admin ativar', async () => {
  const {env, db} = await setup()
  const res = await call(env, 'POST', '/auth/register', {name: 'Pessoa Gmail', email: 'pessoa@gmail.com', password: SENHA, sector: 'Tecnologia da Informação'})
  assert.equal(res.status, 201)
  const pending = db.users.find(user => user.email === 'pessoa@gmail.com')
  assert.equal(pending.active, 0)
  const blocked = await call(env, 'POST', '/auth/login', {email: 'pessoa@gmail.com', password: SENHA})
  assert.equal(blocked.status, 403)
  assert.match((await blocked.json()).detail, /inativa/)
  assert.equal((await call(env, 'POST', '/auth/login', {email: 'pessoa@gmail.com', password: 'Errada@Senha1'})).status, 401)
  const admin = await loginAs(env, ADMIN[0], ADMIN[1])
  assert.equal((await call(env, 'PATCH', `/users/${pending.id}`, {active: true}, admin)).status, 200)
  assert.equal((await call(env, 'POST', '/auth/login', {email: 'pessoa@gmail.com', password: SENHA})).status, 200)
})

test('esqueci a senha envia para o e-mail cadastrado, inclusive Gmail; conta pendente não recebe', async () => {
  const sent = []
  const {env} = await setup({SEND_EMAIL: async (to, link) => { sent.push({to, link}) }})
  const admin = await loginAs(env, ADMIN[0], ADMIN[1])
  assert.equal((await call(env, 'POST', '/users', {name: 'Pessoa', email: 'Pessoa.Teste@Gmail.com', password: SENHA, role: 'padrao', sector_id: 1}, admin)).status, 201)
  assert.equal((await call(env, 'POST', '/auth/forgot', {email: 'PESSOA.teste@gmail.com'})).status, 200)
  assert.deepEqual(sent.map(item => item.to), ['pessoa.teste@gmail.com'])
  await call(env, 'POST', '/auth/register', {name: 'Pendente', email: 'pendente@gmail.com', password: SENHA, sector: 'Tecnologia da Informação'})
  assert.equal((await call(env, 'POST', '/auth/forgot', {email: 'pendente@gmail.com'})).status, 200)
  assert.equal(sent.length, 1, 'conta pendente não deveria receber link')
})
