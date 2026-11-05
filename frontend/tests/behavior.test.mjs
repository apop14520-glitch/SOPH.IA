// Comportamento da SOPH.IA: modo, especialidade, prompt de sistema e pergunta quando o modo não está claro. Executar com:
// node --test frontend/tests/behavior.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, call, loginAs, setup} from './helpers.mjs'
import {CLARIFICATION, buildSystemPrompt, detectMode, detectSpecialty} from '../lib/behavior.js'

test('verbo inicial define o modo; cortesias antes do verbo são ignoradas', () => {
  assert.equal(detectMode('Elabore um ETP para dragagem'), 'elaborar')
  assert.equal(detectMode('Agora elabore um despacho'), 'elaborar')
  assert.equal(detectMode('Por favor, revise o documento anexado'), 'revisar')
  assert.equal(detectMode('Compare o ETP e o TR anexados'), 'comparar')
  assert.equal(detectMode('Analise as lacunas e os riscos do TR'), 'analisar')
  assert.equal(detectMode('Quais normas tratam de contratação direta?'), 'consultar')
})

test('pedido sem modo claro retorna null, e modo explícito tem prioridade', () => {
  assert.equal(detectMode('ETP dragagem do canal de acesso'), null)
  assert.equal(detectMode('oi'), null)
  assert.equal(detectMode('ETP dragagem do canal de acesso', 'revisar'), 'revisar')
})

test('especialidade vem do tipo de documento citado', () => {
  assert.equal(detectSpecialty('Elabore um Termo de Referência para limpeza'), 'etp_tr')
  assert.equal(detectSpecialty('Elabore um memorando à Presidência'), 'despacho_memorando')
  assert.equal(detectSpecialty('Elabore uma portaria de designação de fiscal'), 'portaria_oficio')
  assert.equal(detectSpecialty('Quais normas tratam de licitação?', 'consultar'), 'consulta_normativa')
})

test('prompt de sistema traz regras, modo e especialidade, sem as instruções que conflitavam com a especificação', () => {
  const text = buildSystemPrompt({mode: 'revisar', specialty: 'revisao'})
  assert.match(text, /Regras obrigatórias/)
  assert.match(text, /Modo REVISAR/)
  assert.match(text, /PENDENTE: informar/)
  assert.match(text, /Lei nº 13\.303\/2016/)
  assert.doesNotMatch(text, /sem perguntas nem formulários/)
  assert.doesNotMatch(text, /nunca escreva colchetes/)
})

test('regras de lacuna: despacho sem cabeçalho inventado; ETP sem valor inventado; sem afirmar aprovação', () => {
  assert.match(buildSystemPrompt({mode: 'elaborar', specialty: 'despacho_memorando'}), /Não monte cabeçalho/)
  assert.match(buildSystemPrompt({mode: 'elaborar', specialty: 'etp_tr'}), /\[PENDENTE: informar estimativa de valor/)
  assert.match(buildSystemPrompt({mode: 'elaborar', specialty: 'etp_tr'}), /condição futura/)
})

test('pedido sem modo claro recebe a pergunta e não chama a IA', async () => {
  let calls = 0
  const {env, db} = await setup({AI: {run: async () => { calls++; return {response: 'texto'} }}})
  db.conversations.push({id: 1, title: 'Teste', user_id: 1})
  const token = await loginAs(env, ...ADMIN)
  const res = await call(env, 'POST', '/conversations/1/messages', {content: 'ETP dragagem do canal de acesso', attachment_ids: [], web_search: false}, token)
  assert.equal(res.status, 201)
  assert.equal((await res.json()).content, CLARIFICATION)
  assert.equal(calls, 0)
})
