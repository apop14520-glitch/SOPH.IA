// Pós-processamento das respostas da IA no Worker. A IA é simulada: devolve o texto que o modelo
// produziu, e o teste confere o que a rota de mensagens salva e retorna. Executar com:
// node --test frontend/tests/postprocess.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, call, loginAs, setup} from './helpers.mjs'

const PEDIDO = 'Elabore um memorando à Recursos Humanos solicitando a lista de férias do setor de TI até 30 de novembro.'

async function answerWith(modelText) {
  const {env, db} = await setup({AI: {run: async () => ({response: modelText})}})
  db.conversations.push({id: 1, title: 'Teste', user_id: 1})
  const token = await loginAs(env, ...ADMIN)
  const res = await call(env, 'POST', '/conversations/1/messages', {content: PEDIDO, attachment_ids: [], web_search: false}, token)
  assert.equal(res.status, 201)
  return (await res.json()).content
}

test('remove a seção "Observação" e o texto interno', async () => {
  const content = await answerWith('## Memorando\n\nSolicita-se a lista de férias até 30 de novembro.\n\nAtenciosamente.\n\n## Observação\n\nRevise o texto antes de usar.')
  assert.ok(!/observa[çc][ãa]o/i.test(content), content)
  assert.ok(content.includes('Solicita-se a lista de férias'))
  assert.ok(content.includes('Atenciosamente.'))
})

test('remove colchetes e as linhas que ficariam vazias', async () => {
  const content = await answerWith('Solicito a lista de férias até 30 de novembro.\n\n[Assinatura e cargo, se necessário]\n\n**[Nome da autoridade]**  \n[Cargo]\n\n[INFORMAÇÃO A COMPLETAR]')
  assert.ok(!content.includes('['), content)
  assert.ok(content.includes('Solicito a lista de férias até 30 de novembro.'))
})

test('converte títulos em caixa alta para formato de frase, preservando siglas', async () => {
  const content = await answerWith('**ESTUDO TÉCNICO PRELIMINAR**\n\n1. IDENTIFICAÇÃO DA DEMANDA\n\n## DESPACHO DO SETOR DFD\n\nCNPJ: 00.000.000/0001-00')
  assert.ok(content.includes('**Estudo técnico preliminar**'), content)
  assert.ok(content.includes('1. Identificação da demanda'), content)
  assert.ok(content.includes('## Despacho do setor DFD'), content)
  assert.ok(content.includes('CNPJ: 00.000.000/0001-00'), content)
})

test('o prompt enviado ao modelo exige as seções obrigatórias de ETP e Termo de Referência', async () => {
  let enviado = ''
  const {env, db} = await setup({AI: {run: async (_model, options) => {
    enviado = options.messages.map(message => message.content).join('\n')
    return {response: 'Texto de resposta.'}
  }}})
  db.conversations.push({id: 1, title: 'Teste', user_id: 1})
  const token = await loginAs(env, ...ADMIN)
  const res = await call(env, 'POST', '/conversations/1/messages', {content: 'Elabore um ETP para aquisição de licenças de software.', attachment_ids: [], web_search: false}, token)
  assert.equal(res.status, 201)
  for (const termo of ['alternativas de mercado', 'riscos', 'quantitativos', 'memória de cálculo', 'gestão e fiscalização do contrato', 'fiscal designado', 'Termo de Referência']) {
    assert.ok(enviado.includes(termo), `prompt sem a exigência: "${termo}"`)
  }
})

test('não altera o corpo do texto nem nomes escritos em caixa alta', async () => {
  const text = 'JOÃO DA SILVA assina a presente.\n\nO processo segue para a Assessoria Jurídica.'
  assert.equal(await answerWith(text), text)
})

test('remove a frase que cita a Lei nº 8.666/1993 e mantém o restante', async () => {
  const content = await answerWith('A contratação observa a Lei nº 8.666/1993 e os prazos usuais.\n\nO memorando solicita a lista de férias do setor de TI até 30 de novembro, conforme a Lei nº 13.303/2016.')
  assert.doesNotMatch(content, /8\.?666/)
  assert.match(content, /13\.303\/2016/)
  assert.match(content, /lista de férias/)
})

test('não remove valores em reais que tenham o número 8.666', async () => {
  const content = await answerWith('O valor estimado para o período é de R$ 8.666,00, conforme a pesquisa de preços.\n\nO memorando solicita a lista de férias do setor de TI até 30 de novembro.')
  assert.match(content, /R\$ 8\.666,00/)
})

test('marcador de pendência [PENDENTE: ...] é preservado; outros colchetes saem', async () => {
  const content = await answerWith('O despacho trata do processo [PENDENTE: informar número do processo], com fundamento em [referência interna].')
  assert.match(content, /\[PENDENTE: informar número do processo\]/)
  assert.doesNotMatch(content, /referência interna/)
})

test('marcador [inserir ...] é preservado como pendência', async () => {
  const content = await answerWith('A quantidade prevista é [inserir quantitativo] unidades, conforme [fonte interna].')
  assert.match(content, /\[inserir quantitativo\]/)
  assert.doesNotMatch(content, /fonte interna/)
})
