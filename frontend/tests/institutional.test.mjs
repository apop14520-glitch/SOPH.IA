// Base institucional no chat: o modelo recebe os trechos relevantes do documento, não o documento inteiro. Executar com:
// node --test frontend/tests/institutional.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, call, loginAs, setup} from './helpers.mjs'

function fakeAI() {
  const calls = []
  return {
    calls,
    run: async (model, {messages}) => {
      calls.push(messages)
      return {response: 'Estudo gerado com base na base institucional.'}
    },
  }
}

// Documento com 20 seções; só a seção 3 trata de dragagem. Cada seção traz um marcador próprio.
const modelo = Array.from({length: 20}, (_, index) => {
  const n = index + 1
  const body = n === 3
    ? 'Serviço de dragagem do canal de acesso ao terminal, com medição mensal e relatório técnico.'
    : `Procedimento administrativo de rotina e prazos internos. MARCADOR-${n} `.repeat(40)
  return `## Seção ${n}\n\n${body}`
}).join('\n\n')

test('pedido sobre dragagem recebe a seção relevante e não o modelo inteiro', async () => {
  const ai = fakeAI()
  const {env, db} = await setup({AI: ai})
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  db.conversations.push({id: 1, user_id: 1, title: 'Teste'})
  db.knowledge.push({id: 1, title: 'Modelo de ETP', category: 'Modelo de ETP', filename: 'modelo-etp.pdf', mime_type: 'application/pdf', storage_key: null, content: modelo, owner_id: null})

  const res = await call(env, 'POST', '/conversations/1/messages', {content: 'Elabore um ETP sobre dragagem do canal de acesso'}, token)
  assert.equal(res.status, 201)

  const last = ai.calls[0].at(-1).content
  assert.match(last, /dragagem do canal de acesso/, 'a seção relevante deveria estar no contexto')
  assert.doesNotMatch(last, /MARCADOR-20/, 'seção sem relação com o pedido não deveria estar no contexto')
  assert.ok(last.length < 4000, `contexto com ${last.length} caracteres: o documento inteiro estaria sendo enviado`)
})
