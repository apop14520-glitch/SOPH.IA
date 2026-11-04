// Histórico enviado ao modelo: respostas longas não voltam integrais, perguntas são limitadas e a janela é curta. Executar com:
// node --test frontend/tests/history.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, call, loginAs, setup} from './helpers.mjs'

// Workers AI simulado: registra as mensagens recebidas e responde um texto curto.
function fakeAI() {
  const calls = []
  return {
    calls,
    run: async (model, {messages}) => {
      calls.push(messages)
      return {response: 'Memorando gerado agora.'}
    },
  }
}

async function seededConversation(messages) {
  const ai = fakeAI()
  const {env, db} = await setup({AI: ai})
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  db.conversations.push({id: 1, user_id: 1, title: 'Teste'})
  messages.forEach((item, index) => db.chatMessages.push({id: index + 1, conversation_id: 1, sources: '[]', ...item}))
  return {ai, env, token}
}

test('a resposta anterior longa chega ao modelo resumida, não integral', async () => {
  const documento = 'Estudo Técnico Preliminar sobre dragagem do canal. '.repeat(200)
  const {ai, env, token} = await seededConversation([
    {role: 'user', content: 'Elabore um ETP sobre dragagem'},
    {role: 'assistant', content: documento},
  ])
  const res = await call(env, 'POST', '/conversations/1/messages', {content: 'Elabore um memorando sobre o Porto de Porto Velho'}, token)
  assert.equal(res.status, 201)
  const sent = ai.calls[0]
  const answer = sent.find((item, index) => index > 0 && index < sent.length - 1 && item.role === 'assistant')
  assert.ok(answer, 'a resposta anterior deveria estar no histórico')
  assert.ok(answer.content.length < 400, `resposta anterior foi enviada com ${answer.content.length} caracteres`)
  assert.match(answer.content, /não reutilize seu conteúdo/)
  assert.match(sent.at(-1).content, /memorando sobre o Porto de Porto Velho/, 'o pedido atual deve ir íntegro no fim')
})

test('pergunta anterior muito longa é limitada no histórico', async () => {
  const pergunta = 'contexto da demanda. '.repeat(400)
  const {ai, env, token} = await seededConversation([{role: 'user', content: pergunta}])
  await call(env, 'POST', '/conversations/1/messages', {content: 'Pedido atual'}, token)
  const history = ai.calls[0].slice(1, -1)
  assert.equal(history.length, 1)
  assert.ok(history[0].content.length <= 2000)
})

test('histórico usa no máximo 8 turnos anteriores', async () => {
  const messages = Array.from({length: 20}, (_, index) => ({role: index % 2 ? 'assistant' : 'user', content: `turno ${index + 1}`}))
  const {ai, env, token} = await seededConversation(messages)
  await call(env, 'POST', '/conversations/1/messages', {content: 'Pedido atual'}, token)
  const history = ai.calls[0].slice(1, -1)
  assert.equal(history.length, 8)
  assert.equal(history.at(-1).content, 'turno 20')
})
