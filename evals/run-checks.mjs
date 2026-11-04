// Confere as respostas já geradas: node evals/run-checks.mjs [pasta-das-respostas]
// Cada caso precisa de um arquivo <id>.txt na pasta. Padrão: evals/out.
import {existsSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {checkResponse} from './checks.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const cases = JSON.parse(readFileSync(join(here, 'requests.json'), 'utf8'))
const dir = process.argv[2] || join(here, 'out')

let failedCases = 0
let warningCount = 0
for (const testCase of cases) {
  const file = join(dir, `${testCase.id}.txt`)
  if (!existsSync(file)) {
    console.log(`FALTA   ${testCase.id}: ${file} não existe`)
    failedCases++
    continue
  }
  const result = checkResponse(testCase, readFileSync(file, 'utf8'))
  const failed = result.failures.length > 0
  console.log(`${failed ? 'FALHOU' : 'OK    '}  ${testCase.id}`)
  for (const failure of result.failures) console.log(`          - ${failure}`)
  for (const warning of result.warnings) console.log(`          ? ${warning}`)
  if (failed) failedCases++
  warningCount += result.warnings.length
}

console.log(`\n${cases.length - failedCases}/${cases.length} casos sem falhas. ${warningCount} aviso(s) para revisão humana.`)
process.exitCode = failedCases ? 1 : 0
