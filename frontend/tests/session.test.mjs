// Sessão em cookie HttpOnly: login grava o cookie, /auth/me aceita só o cookie, logout o expira. Executar com:
// node --test frontend/tests/session.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, call, onRequest, setup} from './helpers.mjs'

const withCookie = (env, method, path, cookie) => onRequest({
  request: new Request(`https://soph.test/api${path}`, {method, headers: cookie ? {cookie} : {}}),
  env,
  params: {path: path.replace(/^\//, '').split('/')},
})

test('login grava o token em cookie HttpOnly, Secure e SameSite=Strict', async () => {
  const {env} = await setup()
  const res = await call(env, 'POST', '/auth/login', {email: ADMIN[0], password: ADMIN[1]})
  assert.equal(res.status, 200)
  const setCookie = res.headers.get('set-cookie') || ''
  assert.match(setCookie, /^sophia_session=[^;]+/)
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) {
    assert.ok(setCookie.includes(attribute), `cookie sem ${attribute}: ${setCookie.slice(0, 40)}`)
  }
})

test('/auth/me aceita apenas o cookie de sessão', async () => {
  const {env} = await setup()
  const login = await call(env, 'POST', '/auth/login', {email: ADMIN[0], password: ADMIN[1]})
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const res = await withCookie(env, 'GET', '/auth/me', cookie)
  assert.equal(res.status, 200)
  assert.equal((await res.json()).email, ADMIN[0])
})

test('sem cookie nem Bearer, /auth/me é recusado', async () => {
  const {env} = await setup()
  const res = await withCookie(env, 'GET', '/auth/me', null)
  assert.equal(res.status, 403) // sessão inválida: mesma resposta de antes da mudança
})

test('cookie com assinatura inválida é recusado', async () => {
  const {env} = await setup()
  const res = await withCookie(env, 'GET', '/auth/me', 'sophia_session=aaa.bbb.ccc')
  assert.equal(res.status, 403) // sessão inválida: mesma resposta de antes da mudança
})

test('logout expira o cookie de sessão', async () => {
  const {env} = await setup()
  const res = await call(env, 'POST', '/auth/logout')
  assert.equal(res.status, 200)
  assert.ok((res.headers.get('set-cookie') || '').includes('Max-Age=0'))
})
