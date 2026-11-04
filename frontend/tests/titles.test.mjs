// Títulos de conversa: o nome escolhido pelo usuário não pode ser cortado nem reescrito. Executar com:
// node --test frontend/tests/titles.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, call, loginAs, setup} from './helpers.mjs'

const LONG = 'Despacho sobre prorrogação de contrato de manutenção predial'

test('renomear mantém o nome completo e a grafia escolhida', async () => {
  const {env, db} = await setup()
  const token = await loginAs(env, ...ADMIN)
  db.conversations.push({id: 10, user_id: 1, title: 'Nova conversa'})
  const res = await call(env, 'PATCH', '/conversations/10', {title: `  ${LONG}  `}, token)
  const data = await res.json()
  assert.equal(res.status, 200)
  assert.equal(data.title, LONG)
  assert.equal(db.conversations[0].title, LONG)
})

test('renomear aceita até 120 caracteres e corta apenas o excesso', async () => {
  const {env, db} = await setup()
  const token = await loginAs(env, ...ADMIN)
  db.conversations.push({id: 10, user_id: 1, title: 'Nova conversa'})
  const res = await call(env, 'PATCH', '/conversations/10', {title: 'A'.repeat(150)}, token)
  const data = await res.json()
  assert.equal(data.title.length, 120)
})

test('renomear recusa nome vazio ou genérico', async () => {
  const {env, db} = await setup()
  const token = await loginAs(env, ...ADMIN)
  db.conversations.push({id: 10, user_id: 1, title: 'Nova conversa'})
  for (const title of ['', '   ', 'Nova conversa']) {
    const res = await call(env, 'PATCH', '/conversations/10', {title}, token)
    assert.equal(res.status, 400, `aceitou "${title}"`)
  }
})

test('listar conversas não reescreve títulos já salvos', async () => {
  const {env, db} = await setup()
  const token = await loginAs(env, ...ADMIN)
  db.conversations.push({id: 10, user_id: 1, title: LONG, updated_at: '2026-11-03'})
  db.chatMessages.push({id: 1, conversation_id: 10, role: 'user', content: 'Preciso do despacho'})
  const res = await call(env, 'GET', '/conversations', undefined, token)
  const data = await res.json()
  assert.equal(data[0].title, LONG)
  assert.equal(db.conversations[0].title, LONG)
})

test('conversa sem título recebe título automático de até oito palavras', async () => {
  const {env, db} = await setup()
  const token = await loginAs(env, ...ADMIN)
  db.conversations.push({id: 11, user_id: 1, title: 'Nova conversa', updated_at: '2026-11-03'})
  db.chatMessages.push({id: 1, conversation_id: 11, role: 'user', content: 'Preciso de um despacho sobre a prorrogação do contrato de manutenção predial do prédio sede'})
  const res = await call(env, 'GET', '/conversations', undefined, token)
  const data = await res.json()
  assert.equal(data[0].title, 'Preciso de um despacho sobre a prorrogação do')
})
