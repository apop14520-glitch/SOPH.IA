// Redefinição de senha por e-mail: link de uso único, com validade, sem revelar quem tem conta. Executar com:
// node --test frontend/tests/reset.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, call, setup} from './helpers.mjs'

const mailbox = () => {
  const sent = []
  return {sent, send: async (to, link) => { sent.push({to, link}) }}
}
const tokenFrom = link => new URL(link.replace('/#/', '/')).searchParams.get('token')

test('pedido para e-mail cadastrado envia link com token; resposta é genérica', async () => {
  const box = mailbox()
  const {env, db} = await setup({SEND_EMAIL: box.send})
  const res = await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})
  assert.equal(res.status, 200)
  assert.equal(box.sent.length, 1)
  assert.equal(box.sent[0].to, ADMIN[0])
  assert.ok(tokenFrom(box.sent[0].link), 'link sem token')
  assert.equal(db.passwordResets.length, 1)
  assert.notEqual(db.passwordResets[0].token_hash, tokenFrom(box.sent[0].link), 'o banco guardou o token em texto')
})

test('pedido para e-mail inexistente tem a mesma resposta e não envia nada', async () => {
  const box = mailbox()
  const {env} = await setup({SEND_EMAIL: box.send})
  const known = await (await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})).json()
  const unknown = await call(env, 'POST', '/auth/forgot', {email: 'ninguem@soph.ro.gov.br'})
  assert.equal(unknown.status, 200)
  assert.deepEqual(await unknown.json(), known)
  assert.equal(box.sent.length, 1)
})

test('redefinição pelo link troca a senha e a antiga deixa de funcionar', async () => {
  const box = mailbox()
  const {env} = await setup({SEND_EMAIL: box.send})
  await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})
  const token = tokenFrom(box.sent[0].link)
  const newPassword = 'Nova@Senha2026'
  const reset = await call(env, 'POST', '/auth/reset', {token, password: newPassword})
  assert.equal(reset.status, 200)
  const withNew = await call(env, 'POST', '/auth/login', {email: ADMIN[0], password: newPassword})
  assert.equal(withNew.status, 200)
  const withOld = await call(env, 'POST', '/auth/login', {email: ADMIN[0], password: ADMIN[1]})
  assert.equal(withOld.status, 401)
})

test('o link só funciona uma vez', async () => {
  const box = mailbox()
  const {env} = await setup({SEND_EMAIL: box.send})
  await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})
  const token = tokenFrom(box.sent[0].link)
  assert.equal((await call(env, 'POST', '/auth/reset', {token, password: 'Primeira@Senha1'})).status, 200)
  assert.equal((await call(env, 'POST', '/auth/reset', {token, password: 'Segunda@Senha2'})).status, 400)
})

test('link expirado é recusado', async () => {
  const box = mailbox()
  const {env, db} = await setup({SEND_EMAIL: box.send})
  await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})
  db.passwordResets[0].expires_at = 1
  const res = await call(env, 'POST', '/auth/reset', {token: tokenFrom(box.sent[0].link), password: 'Nova@Senha2026'})
  assert.equal(res.status, 400)
})

test('senha fraca é recusada e o link continua válido', async () => {
  const box = mailbox()
  const {env} = await setup({SEND_EMAIL: box.send})
  await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})
  const token = tokenFrom(box.sent[0].link)
  assert.equal((await call(env, 'POST', '/auth/reset', {token, password: 'fraca'})).status, 400)
  assert.equal((await call(env, 'POST', '/auth/reset', {token, password: 'Forte@Senha2026'})).status, 200)
})

test('sem envio configurado, o pedido responde 503 com orientação', async () => {
  const {env} = await setup()
  const res = await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})
  assert.equal(res.status, 503)
  assert.match((await res.json()).detail, /administrador/)
})

test('falha no envio não quebra a resposta nem revela a conta', async () => {
  const {env} = await setup({SEND_EMAIL: async () => { throw new Error('provedor fora do ar') }})
  const res = await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})
  assert.equal(res.status, 200)
  assert.match((await res.json()).message, /Se o e-mail/)
})
