// Pesquisa web indisponível: a resposta segue com a base institucional e avisa a pessoa. Executar com:
// node --test frontend/tests/web-notice.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, call, loginAs, setup} from './helpers.mjs'
import {WEB_UNAVAILABLE_NOTE} from '../lib/behavior.js'

test('sem pesquisa web disponível, a resposta traz o aviso e não some', async () => {
  const {env, db} = await setup({AI: {run: async () => ({response: 'Texto elaborado com a base institucional.'})}})
  db.conversations.push({id: 1, title: 'Teste', user_id: 1})
  const token = await loginAs(env, ...ADMIN)
  const res = await call(env, 'POST', '/conversations/1/messages', {content: 'Pesquise na web a norma sobre contratação direta', attachment_ids: [], web_search: true}, token)
  assert.equal(res.status, 201)
  const content = (await res.json()).content
  assert.match(content, /Texto elaborado com a base institucional/)
  assert.ok(content.includes(WEB_UNAVAILABLE_NOTE), 'o aviso de pesquisa indisponível deveria aparecer')
})
