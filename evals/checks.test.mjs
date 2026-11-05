// Testa o verificador com respostas de exemplo. Executar com: node --test evals/checks.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {checkResponse} from './checks.mjs'

const cases = JSON.parse(readFileSync(new URL('./requests.json', import.meta.url), 'utf8'))
const byId = id => cases.find(item => item.id === id)

const PARAGRAPH = 'A necessidade decorre do volume de projetos da unidade. As alternativas de mercado foram comparadas com a solução proposta. Os riscos de não contratação e de atraso foram identificados. O valor estimado depende de pesquisa de preços atualizada. '
const longBody = (times = 30) => Array(times).fill(PARAGRAPH).join('\n\n')
const SAFE_ETP = `## Estudo técnico preliminar\n\n### Objeto\n\nLicenças anuais do software Revit para doze usuários.\n\n${longBody()}`

test('resposta limpa e completa passa sem falhas', () => {
  const result = checkResponse(byId('etp-01'), SAFE_ETP)
  assert.deepEqual(result.failures, [])
})

test('reprova colchetes e "informação a completar"', () => {
  const text = SAFE_ETP + '\n\n### Justificativa\n\n[INFORMAÇÃO A COMPLETAR]'
  const result = checkResponse(byId('etp-01'), text)
  assert.ok(result.failures.some(item => item.startsWith('placeholder')))
})

test('não confunde "deverá completar" com o marcador "a completar"', () => {
  const text = SAFE_ETP + '\n\nA unidade demandante deverá completar os dados pendentes do local.'
  const result = checkResponse(byId('etp-01'), text)
  assert.ok(!result.failures.some(item => item.startsWith('placeholder')), result.failures.join(' | '))
})

test('reprova título inteiro em caixa alta', () => {
  const text = SAFE_ETP + '\n\n1. IDENTIFICAÇÃO DA DEMANDA\n\nTexto.'
  const result = checkResponse(byId('etp-01'), text)
  assert.ok(result.failures.some(item => item.startsWith('caixa alta')))
})

test('não confunde siglas e números com caixa alta de título', () => {
  const text = SAFE_ETP + '\n\nCNPJ: 00.000.000/0001-00\n\nSEI 2026'
  const result = checkResponse(byId('etp-01'), text)
  assert.ok(!result.failures.some(item => item.startsWith('caixa alta')), result.failures.join(' | '))
})

test('reprova seção interna como Observação', () => {
  const text = SAFE_ETP + '\n\n## Observação\n\nRevise antes de usar.'
  const result = checkResponse(byId('etp-01'), text)
  assert.ok(result.failures.some(item => item.startsWith('seção interna')))
})

test('reprova comentário sobre a própria IA', () => {
  const text = SAFE_ETP + '\n\nComo modelo de linguagem, não tenho acesso ao processo.'
  const result = checkResponse(byId('etp-01'), text)
  assert.ok(result.failures.some(item => item.startsWith('comentário sobre a IA')))
})

test('reprova campos de SEI não solicitados em despacho', () => {
  const text = '## Despacho\n\nEncaminhem-se os autos à Assessoria Jurídica para análise da multa contratual aplicada. ' + PARAGRAPH + '\n\nLocal e data: Porto Velho'
  const result = checkResponse(byId('desp-01'), text)
  assert.ok(result.failures.some(item => item.startsWith('campos de cabeçalho')))
})

test('reprova minuta quando o pedido era uma pergunta', () => {
  const text = '## Despacho\n\nA dispensa e a inexigibilidade diferem na hipótese legal. ' + PARAGRAPH
  const result = checkResponse(byId('pergunta-01'), text)
  assert.ok(result.failures.some(item => item.startsWith('respondeu com uma minuta')))
})

test('reprova resposta curta', () => {
  const result = checkResponse(byId('etp-01'), 'Revit. Licenças. Risco. Valor. Alternativas.')
  assert.ok(result.failures.some(item => item.startsWith('resposta curta')))
})

test('reprova resposta que não trata dos termos do pedido', () => {
  const semRevit = SAFE_ETP.replace(/Revit/g, 'software')
  const result = checkResponse(byId('etp-01'), semRevit)
  assert.ok(result.failures.some(item => item.includes('revit')), result.failures.join(' | '))
})

test('referência legal não citada no pedido gera aviso, não falha', () => {
  const text = SAFE_ETP + '\n\nA contratação observa a Lei nº 9.999/2020.'
  const result = checkResponse(byId('etp-01'), text)
  assert.deepEqual(result.failures, [])
  assert.ok(result.warnings.some(item => item.includes('9.999/2020')))
})

test('resposta vazia é reprovada', () => {
  const result = checkResponse(byId('etp-01'), '   ')
  assert.deepEqual(result.failures, ['sem resposta'])
})

test('requests.json tem 22 pedidos simples e 5 sequências, ids únicos e tipos válidos', () => {
  const single = cases.filter(item => !item.turns)
  assert.equal(single.length, 22)
  assert.equal(cases.filter(item => item.turns).length, 5)
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length)
  const kinds = new Set(['etp', 'tr', 'despacho', 'memorando', 'revisao', 'pergunta'])
  for (const item of single) {
    assert.ok(kinds.has(item.kind), `tipo inválido em ${item.id}`)
    assert.ok(item.prompt.length > 20, `pedido curto em ${item.id}`)
    assert.ok(Array.isArray(item.must) && item.must.length > 0, `sem termos obrigatórios em ${item.id}`)
  }
})

import {checkRepetition, overlapRatio} from './checks.mjs'

const DOC_A = 'A necessidade decorre do volume de projetos da unidade e das alternativas de mercado comparadas com a solução proposta pela equipe técnica responsável'
const DOC_B = 'O despacho encaminha o processo à diretoria competente para análise, com prazo de cinco dias úteis e indicação do servidor responsável pelo acompanhamento'

test('repetição: texto idêntico chega a 100%, texto diferente fica perto de 0%', () => {
  assert.equal(overlapRatio(DOC_A, DOC_A), 1)
  assert.equal(overlapRatio(DOC_A, DOC_B), 0)
})

test('repetição: resposta que copia trechos da anterior reprova; resposta nova passa', () => {
  const copied = `${DOC_A}. Nova introdução do pedido atual.`
  assert.match(checkRepetition(DOC_A, copied).failure, /repete/)
  assert.equal(checkRepetition(DOC_A, DOC_B).failure, null)
  assert.equal(checkRepetition(DOC_A, DOC_B).warning, null)
})

test('repetição: textos curtos não geram falso positivo', () => {
  assert.equal(overlapRatio('sim', 'sim'), 0)
})

test('sequências do conjunto têm turnos com tipo, pedido e termos', () => {
  const sequences = cases.filter(item => item.turns)
  assert.ok(sequences.length >= 4)
  for (const sequence of sequences) {
    assert.ok(sequence.turns.length >= 2, `${sequence.id} precisa de ao menos dois turnos`)
    for (const turn of sequence.turns) {
      assert.ok(turn.kind && turn.prompt && Array.isArray(turn.must), `${sequence.id} com turno incompleto`)
    }
  }
})

test('Lei 13.303/2016, aplicável à SOPH.IA, é citada sem aviso', () => {
  const text = SAFE_ETP + '\n\nA contratação observa a Lei nº 13.303/2016.'
  const result = checkResponse(byId('etp-01'), text)
  assert.deepEqual(result.failures, [])
  assert.deepEqual(result.warnings, [])
})

test('lei revogada (8.666/1993) citada sem o pedido mencioná-la reprova', () => {
  const text = 'A contratação segue a Lei nº 8.666/1993 e o procedimento usual da administração pública, com os prazos e documentos exigidos pela norma aplicável ao caso concreto analisado.'
  const result = checkResponse(byId('pergunta-01'), text)
  assert.ok(result.failures.some(item => /revogada/.test(item)), 'deveria reprovar a citação da lei revogada')
})

test('lei revogada mencionada pelo próprio pedido não reprova', () => {
  const testCase = {id: 'x', kind: 'pergunta', prompt: 'A Lei 8.666/1993 ainda vale para a SOPH.IA?', must: []}
  const text = 'A Lei nº 8.666/1993 foi revogada e não se aplica à SOPH.IA, que segue a Lei nº 13.303/2016 para licitações e contratos, com as normas internas aplicáveis ao caso.'
  const result = checkResponse(testCase, text)
  assert.ok(!result.failures.some(item => /revogada/.test(item)))
})

test('marcador de pendência não reprova, mas colchete comum reprova', () => {
  const ok = checkResponse(byId('etp-01'), SAFE_ETP + '\n\nO valor estimado segue pendente. [PENDENTE: informar valor estimado]')
  assert.ok(!ok.failures.some(item => item.startsWith('placeholder')))
  const bad = checkResponse(byId('etp-01'), SAFE_ETP + '\n\nO valor é [valor].')
  assert.ok(bad.failures.some(item => item.startsWith('placeholder')))
})

test('afirmação proibida reprova; negação ("não foi aprovado") não reprova', () => {
  const testCase = {id: 'x', kind: 'despacho', prompt: 'Elabore um despacho.', must: [], forbid: ['(?<!nao )foi aprovad']}
  const bad = checkResponse(testCase, 'Elabore um despacho. Este despacho foi aprovado pela diretoria e encaminhado ao setor responsável pelas providências cabíveis.')
  assert.ok(bad.failures.some(item => item.includes('afirma o que não pode')))
  const good = checkResponse(testCase, 'Elabore um despacho. Este despacho não foi aprovado e segue para análise do setor responsável pelas providências cabíveis.')
  assert.ok(!good.failures.some(item => item.includes('afirma o que não pode')))
})
