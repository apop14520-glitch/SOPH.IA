// Conversão de PDF e DOCX para texto: upload e reprocessamento da base institucional. Executar com:
// node --test frontend/tests/knowledge.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ADMIN, GERENTE, call, loginAs, onRequest, setup} from './helpers.mjs'

const bytes = new TextEncoder().encode('%PDF-1.4 documento de teste')

// Workers AI simulado: responde com o texto que o teste definir e registra os arquivos recebidos.
function fakeAI(respond) {
  const calls = []
  return {
    calls,
    toMarkdown: async (file, options) => {
      calls.push(file.name)
      return respond(file, options)
    },
  }
}

// R2 simulado: devolve o conteúdo guardado por chave.
const fakeR2 = objects => ({
  get: async key => (objects[key] ? {arrayBuffer: async () => objects[key].buffer} : null),
})

async function upload(env, token, file, fields = {}) {
  const form = new FormData()
  form.append('file', file)
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  const request = new Request('https://soph.test/api/knowledge/upload', {
    method: 'POST',
    headers: {authorization: `Bearer ${token}`},
    body: form,
  })
  return onRequest({request, env, params: {path: ['knowledge', 'upload']}})
}

test('upload de PDF guarda o texto convertido junto do documento', async () => {
  const ai = fakeAI(file => ({format: 'markdown', name: file.name, data: 'Art. 1º Texto da norma'}))
  const {env, db} = await setup({AI: ai})
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  const res = await upload(env, token, new File([bytes], 'rilc.pdf', {type: 'application/pdf'}), {title: 'RILC', category: 'Regulamento'})
  assert.equal(res.status, 201)
  assert.equal(db.knowledge.length, 1)
  assert.equal(db.knowledge[0].content, 'Art. 1º Texto da norma')
  assert.deepEqual(ai.calls, ['rilc.pdf'])
})

test('PDF sem texto extraído é recusado e nada é salvo', async () => {
  const {env, db} = await setup({AI: fakeAI(() => ({format: 'error', data: ''}))})
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  const res = await upload(env, token, new File([bytes], 'digitalizado.pdf', {type: 'application/pdf'}), {title: 'Digitalizado', category: 'Regulamento'})
  assert.equal(res.status, 422)
  assert.equal(db.knowledge.length, 0)
})

test('reprocessamento converte documentos antigos, ignora anexos e informa as falhas', async () => {
  const ai = fakeAI(file => {
    if (file.name === 'quebrado.pdf') throw new Error('falha do modelo')
    return {format: 'markdown', name: file.name, data: `Texto de ${file.name}`}
  })
  const {env, db} = await setup({AI: ai, DOCUMENTS: fakeR2({k1: bytes, k2: bytes})})
  db.knowledge.push({id: 1, title: 'ETP', category: 'Modelo de ETP', filename: 'etp.pdf', mime_type: 'application/pdf', storage_key: 'k1', content: '', owner_id: null})
  db.knowledge.push({id: 2, title: 'Quebrado', category: 'Modelo de ETP', filename: 'quebrado.pdf', mime_type: 'application/pdf', storage_key: 'k2', content: '', owner_id: null})
  db.knowledge.push({id: 3, title: 'Anexo', category: 'anexo de conversa', filename: 'anexo.pdf', mime_type: 'application/pdf', storage_key: 'k1', content: '', owner_id: 1})
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  const res = await call(env, 'POST', '/admin/knowledge/reprocess', undefined, token)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {total: 2, convertidos: 1, falhas: ['quebrado.pdf']})
  assert.equal(db.knowledge[0].content, 'Texto de etp.pdf')
  assert.equal(db.knowledge[1].content, '', 'documento que falhou continua sem texto')
  assert.equal(db.knowledge[2].content, '', 'anexo de conversa não é reprocessado')
})

test('reprocessamento é restrito ao admin', async () => {
  const {env} = await setup({AI: fakeAI(() => ({data: 'x'})), DOCUMENTS: fakeR2({})})
  const gerente = await loginAs(env, GERENTE[0], GERENTE[1])
  assert.equal((await call(env, 'POST', '/admin/knowledge/reprocess', undefined, gerente)).status, 403)
})

test('reprocessamento exige conversão e armazenamento configurados', async () => {
  const {env} = await setup()
  const token = await loginAs(env, ADMIN[0], ADMIN[1])
  assert.equal((await call(env, 'POST', '/admin/knowledge/reprocess', undefined, token)).status, 503)
})
