// Confere as respostas já geradas: node evals/run-checks.mjs [pasta-das-respostas]
// Pedido simples: <id>.txt. Sequência de conversa: <id>.t1.txt, <id>.t2.txt, ... (cada turno é conferido
// como um pedido, e cada resposta é comparada com as anteriores da mesma conversa). Padrão: evals/out.
import {existsSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {checkRepetition, checkResponse} from './checks.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const cases = JSON.parse(readFileSync(join(here, 'requests.json'), 'utf8'))
const dir = process.argv[2] || join(here, 'out')

// Cada item vira uma linha do relatório: um pedido simples ou um turno de sequência.
function units(testCase) {
  if (!testCase.turns) return [{label: testCase.id, file: `${testCase.id}.txt`, pedido: testCase}]
  return testCase.turns.map((turn, index) => ({
    label: `${testCase.id} (turno ${index + 1} de ${testCase.turns.length})`,
    file: `${testCase.id}.t${index + 1}.txt`,
    pedido: {id: `${testCase.id}.t${index + 1}`, kind: turn.kind, prompt: turn.prompt, must: turn.must},
  }))
}

let failedCases = 0
let warningCount = 0
for (const testCase of cases) {
  const list = units(testCase)
  const texts = []
  let caseFailed = false
  for (const unit of list) {
    const file = join(dir, unit.file)
    if (!existsSync(file)) {
      console.log(`FALTA   ${unit.label}: ${file} não existe`)
      caseFailed = true
      continue
    }
    const text = readFileSync(file, 'utf8')
    const result = checkResponse(unit.pedido, text)
    const repetition = testCase.turns && texts.length ? checkRepetition(texts.join('\n'), text) : null
    if (repetition?.failure) result.failures.push(repetition.failure)
    if (repetition?.warning) result.warnings.push(repetition.warning)
    texts.push(text)

    const failed = result.failures.length > 0
    console.log(`${failed ? 'FALHOU' : 'OK    '}  ${unit.label}`)
    for (const failure of result.failures) console.log(`          - ${failure}`)
    for (const warning of result.warnings) console.log(`          ? ${warning}`)
    if (failed) caseFailed = true
    warningCount += result.warnings.length
  }
  if (caseFailed) failedCases++
}

console.log(`\n${cases.length - failedCases}/${cases.length} casos sem falhas. ${warningCount} aviso(s) para revisão humana.`)
process.exitCode = failedCases ? 1 : 0
