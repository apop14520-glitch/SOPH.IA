// Recuperação de trechos da base institucional (frontend/lib/retrieval.js). Executar com:
// node --test frontend/tests/retrieval.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {CHUNK_SIZE, CONTEXT_BUDGET, CHUNKS_PER_DOCUMENT, chunkDocument, selectExcerpts} from '../lib/retrieval.js'

const filler = (label, times = 30) => `${label}. ${'Procedimento administrativo de rotina e prazos internos. '.repeat(times)}`

test('trechos respeitam o tamanho máximo e guardam o título da seção', () => {
  const longParagraph = 'Texto administrativo sobre prazos e procedimentos. '.repeat(60)
  const text = `## Objeto\n\n${longParagraph}\n\nSegundo parágrafo curto.\n\nGARANTIAS\n\nCinco por cento do valor.`
  const chunks = chunkDocument(text)
  assert.ok(chunks.length >= 2)
  assert.ok(chunks.every(chunk => chunk.text.length <= CHUNK_SIZE))
  assert.equal(chunks[0].heading, 'Objeto')
  assert.equal(chunks.find(chunk => chunk.text.includes('Cinco por cento')).heading, 'GARANTIAS')
})

test('pedido com termo relevante envia só o trecho relevante, não o documento inteiro', () => {
  const content = Array.from({length: 20}, (_, index) => {
    const n = index + 1
    const body = n === 3 ? 'Serviço de dragagem do canal de acesso, com medição mensal.' : filler(`Marcador ${n}`)
    return `## Seção ${n}\n\n${body}`
  }).join('\n\n')
  const [result] = selectExcerpts([{id: 1, title: 'Modelo', content}], 'Elabore um ETP sobre dragagem do canal')
  assert.match(result.content, /dragagem do canal/)
  assert.match(result.content, /\[Seção 3\]/)
  assert.doesNotMatch(result.content, /Marcador 15/)
  assert.ok(result.content.length <= CONTEXT_BUDGET)
  assert.equal(result.id, 1, 'o documento mantém o id para as fontes consultadas')
})

test('um documento envia no máximo o número de trechos definido', () => {
  const content = Array.from({length: 10}, (_, index) => `## Item ${index + 1}\n\n${filler(`Item ${index + 1} com dragagem`, 40)}`).join('\n\n')
  const [result] = selectExcerpts([{id: 2, title: 'Doc', content}], 'dragagem')
  const separators = result.content.split('[...]').length - 1
  assert.ok(separators <= CHUNKS_PER_DOCUMENT - 1, `${separators + 1} trechos de um mesmo documento`)
})

test('o total respeita o limite de caracteres da base, mesmo com muitos documentos relevantes', () => {
  const docs = Array.from({length: 4}, (_, index) => ({
    id: index + 1,
    title: `Doc ${index + 1}`,
    content: Array.from({length: 6}, (_, section) => `## Seção ${section + 1}\n\n${filler(`dragagem ${section}`, 50)}`).join('\n\n'),
  }))
  const result = selectExcerpts(docs, 'dragagem')
  const total = result.reduce((sum, doc) => sum + doc.content.length, 0)
  assert.ok(total <= CONTEXT_BUDGET + 500, `total de ${total} caracteres`)
})

test('sem nenhum termo relevante, envia o início de cada documento, sem excesso', () => {
  const docs = [
    {id: 1, title: 'A', content: `## Abertura\n\n${filler('Abertura A', 20)}`},
    {id: 2, title: 'B', content: `## Abertura\n\n${filler('Abertura B', 20)}`},
  ]
  const result = selectExcerpts(docs, 'xyzzy')
  assert.equal(result.length, 2)
  assert.ok(result.every(doc => doc.content.length <= CHUNK_SIZE + 50))
})

test('documento sem texto não entra na seleção', () => {
  assert.deepEqual(selectExcerpts([{id: 3, title: 'Vazio', content: ''}], 'dragagem'), [])
})
