// Exclusão de conversas pelo dono: mensagens e anexos exclusivos saem; anexos usados em outra conversa ficam. Executar com:
// node --test frontend/tests/delete-chat.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, GERENTE, call, loginAs, setup} from './helpers.mjs'

const ATTACHMENT = 'anexo de conversa'

function fakeR2() {
  const deleted = []
  return {deleted, get: async () => null, delete: async key => { deleted.push(key) }}
}

function seed(db) {
  db.conversations.push({id: 1, user_id: 1, title: 'Conversa a excluir'})
  db.conversations.push({id: 2, user_id: 1, title: 'Conversa que fica'})
  db.chatMessages.push({id: 1, conversation_id: 1, role: 'user', content: 'Veja o anexo', sources: '[]', attachment_ids: '[10,11]'})
  db.chatMessages.push({id: 2, conversation_id: 1, role: 'assistant', content: 'Resposta', sources: '[]', attachment_ids: '[]'})
  db.chatMessages.push({id: 3, conversation_id: 2, role: 'user', content: 'Outra conversa', sources: '[]', attachment_ids: '[11]'})
  db.knowledge.push({id: 10, title: 'Anexo exclusivo', category: ATTACHMENT, filename: 'exclusivo.pdf', mime_type: 'application/pdf', storage_key: 'k10', content: '', owner_id: 1})
  db.knowledge.push({id: 11, title: 'Anexo compartilhado', category: ATTACHMENT, filename: 'compartilhado.pdf', mime_type: 'application/pdf', storage_key: 'k11', content: '', owner_id: 1})
}

test('dono exclui a conversa: mensagens somem, e a outra conversa continua', async () => {
  const {env, db} = await setup({DOCUMENTS: fakeR2()})
  seed(db)
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  const res = await call(env, 'DELETE', '/conversations/1', undefined, token)
  assert.equal(res.status, 200)
  assert.equal(db.conversations.some(item => item.id === 1), false)
  assert.equal(db.chatMessages.some(item => item.conversation_id === 1), false)
  assert.equal(db.conversations.some(item => item.id === 2), true)
  assert.equal(db.chatMessages.some(item => item.conversation_id === 2), true)
})

test('anexo exclusivo da conversa sai do banco e do R2; anexo de outra conversa fica', async () => {
  const r2 = fakeR2()
  const {env, db} = await setup({DOCUMENTS: r2})
  seed(db)
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  await call(env, 'DELETE', '/conversations/1', undefined, token)
  assert.deepEqual(r2.deleted, ['k10'])
  assert.deepEqual(db.knowledge.map(item => item.id), [11])
})

test('outro usuário não consegue excluir a conversa', async () => {
  const {env, db} = await setup({DOCUMENTS: fakeR2()})
  seed(db)
  const gerente = await loginAs(env, GERENTE[0], GERENTE[1])
  const res = await call(env, 'DELETE', '/conversations/1', undefined, gerente)
  assert.equal(res.status, 404)
  assert.equal(db.conversations.some(item => item.id === 1), true)
  assert.equal(db.chatMessages.filter(item => item.conversation_id === 1).length, 2)
})
