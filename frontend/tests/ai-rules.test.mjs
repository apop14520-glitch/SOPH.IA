// Teste de conexão da IA e regras do prompt de produção. Executar com:
// node --test frontend/tests/ai-rules.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ADMIN, call, loginAs, setup} from './helpers.mjs'

const fakeAI = reply => {
  const calls = []
  return {calls, AI: {run: async (model, input) => { calls.push({model, input}); return reply(calls.length) }}}
}

test('teste de conexão deixa espaço para modelos de raciocínio responderem', async () => {
  const ai = fakeAI(() => ({response: 'Conexão ativa.'}))
  const {env} = await setup({AI: ai.AI})
  const token = await loginAs(env, ...ADMIN)
  const res = await call(env, 'POST', '/admin/ai/test', {provider: 'cloudflare', model: '@cf/qwen/qwen3-30b-a3b-fp8'}, token)
  assert.equal(res.status, 200)
  assert.ok(ai.calls[0].input.max_tokens >= 256, `max_tokens ${ai.calls[0].input.max_tokens}`)
})

test('resposta vazia no teste devolve mensagem clara', async () => {
  const ai = fakeAI(() => ({response: ''}))
  const {env} = await setup({AI: ai.AI})
  const token = await loginAs(env, ...ADMIN)
  const res = await call(env, 'POST', '/admin/ai/test', {provider: 'cloudflare', model: '@cf/qwen/qwen3-30b-a3b-fp8'}, token)
  assert.equal(res.status, 422)
  assert.match((await res.json()).detail, /não devolveu texto/)
})

test('o prompt de produção aplica só a Lei 13.303/2016 e proíbe citar a 8.666/1993', () => {
  const source = readFileSync(new URL('../functions/api/[[path]].js', import.meta.url), 'utf8')
  assert.ok(source.includes('Para a SOPH, a norma aplicável a licitações e contratos é a Lei nº 13.303/2016 (Lei das Estatais).'))
  assert.ok(source.includes('Não cite a Lei nº 8.666/1993, que está revogada'))
})
