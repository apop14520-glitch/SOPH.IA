// Gera as respostas no ambiente publicado e grava em evals/out/<id>.txt.
// Uso (defina as variáveis só no terminal, nunca no código):
//   SOPH_EVAL_URL=https://soph-ia.pages.dev SOPH_EVAL_EMAIL=... SOPH_EVAL_PASSWORD=... node evals/run-live.mjs
// Cria uma conversa "Avaliação <id>" por pedido na conta informada.
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cases = JSON.parse(readFileSync(join(here, 'requests.json'), 'utf8'))
// SOPH_EVAL_ONLY=seq-05,etp-01 gera só os casos listados (útil para acrescentar um caso sem refazer tudo).
const only = String(process.env.SOPH_EVAL_ONLY || '').split(',').map(item => item.trim()).filter(Boolean)
const selected = only.length ? cases.filter(item => only.includes(item.id)) : cases
if (only.length && !selected.length) {
  console.error(`Nenhum caso com os ids informados em SOPH_EVAL_ONLY: ${only.join(', ')}`)
  process.exit(2)
}
const outDir = join(here, 'out')
const base = String(process.env.SOPH_EVAL_URL || '').replace(/\/$/, '')
const email = process.env.SOPH_EVAL_EMAIL
const password = process.env.SOPH_EVAL_PASSWORD

if (!base || !email || !password) {
  console.error('Defina SOPH_EVAL_URL, SOPH_EVAL_EMAIL e SOPH_EVAL_PASSWORD.')
  process.exit(2)
}

async function api(method, path, body, token) {
  const headers = {'content-type': 'application/json'}
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${base}/api${path}`, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)})
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data.detail || 'sem detalhe'}`)
  return data
}

const {access_token: token} = await api('POST', '/auth/login', {email, password})
mkdirSync(outDir, {recursive: true})

for (const testCase of selected) {
  const conversation = await api('POST', '/conversations', {title: `Avaliação ${testCase.id}`}, token)
  // Sequências enviam os turnos na mesma conversa, na ordem, como um usuário faria no chat.
  const turns = testCase.turns || [testCase]
  for (const [index, turn] of turns.entries()) {
    const reply = await api('POST', `/conversations/${conversation.id}/messages`, {content: turn.prompt, attachment_ids: [], web_search: false}, token)
    const file = testCase.turns ? `${testCase.id}.t${index + 1}.txt` : `${testCase.id}.txt`
    writeFileSync(join(outDir, file), reply.content || '')
    console.log(`gerado  ${file}`)
  }
}

console.log(`\nRespostas gravadas em ${outDir}. Confira com: node evals/run-checks.mjs`)
