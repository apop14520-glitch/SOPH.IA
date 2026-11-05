// Verificações automáticas das respostas da IA.
// Cada regra é objetiva: a resposta reprova com o motivo indicado. Avisos apontam itens para revisão humana.

export const MIN_WORDS = {etp: 300, tr: 300, despacho: 40, memorando: 40, revisao: 40, pergunta: 15}

// "a completar" só conta como marcador quando é a expressão isolada, não parte de "deverá completar" (sem acento: "devera completar").
const PLACEHOLDER = /\[[^\]\n]{0,120}\]|informacao a completar|(?<![a-z])a completar\b/
const INTERNAL_SECTION = /^[#*\s]*(observacao|observacoes|validacao necessaria|criterio de resposta|nota do assistente|analise interna)\b/m
const AI_META = /\b(sou (uma|um) (ia|inteligencia artificial)|como (uma )?(ia|inteligencia artificial|modelo de linguagem)|modelo de linguagem|gerad[oa] por (ia|inteligencia artificial))\b/
const SEI_FIELDS = /(local e data|nome d[oa] (autoridade|responsavel|servidor)|\bcargo\s*:|n[ºo°]\s*\d+\s*\/\s*\d{4})/
const DOCUMENT_HEADING = /^#{1,6}\s*(despacho|memorando|termo de referencia|estudo tecnico preliminar)\b/m
const REFERENCE = /\b(lei|decreto|portaria|resolucao|instrucao normativa)\s*(n[ºo°]\s*)?(\d[\d.]*(?:\/\d{2,4})?)/g
// Normas que se aplicam à SOPH.IA: citar sem aviso. Leis revogadas: citar sem o pedido mencionar reprova.
const APPLICABLE_LAWS = new Set(['13.303/2016'])
const REVOKED_LAWS = [
  {prefix: '8.666', name: 'a Lei nº 8.666/1993'},
  {prefix: '10.520', name: 'a Lei nº 10.520/2002'},
]

// Remove acentos e põe em minúsculas, para comparar termos sem depender da grafia.
export function normalize(text) {
  return String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

// Linhas inteiras em caixa alta com ao menos três palavras (títulos ou nomes escritos em maiúsculas).
function capsLines(text) {
  return text.split('\n').filter(line => {
    const cleaned = line.replace(/[#*_>`\-–—:;.,()\[\]"'«»/]/g, ' ').replace(/\s+/g, ' ').trim()
    const words = cleaned.split(' ').filter(word => /[A-Za-zÀ-ÿ]/.test(word))
    return words.length >= 3 && cleaned.length >= 12 && /[A-ZÀ-Ý]/.test(cleaned) && cleaned === cleaned.toLocaleUpperCase('pt-BR')
  })
}

export function checkResponse(testCase, text) {
  const body = String(text || '')
  const failures = []
  const warnings = []
  if (!body.trim()) return {id: testCase.id, failures: ['sem resposta'], warnings}

  const plain = normalize(body)
  const prompt = normalize(testCase.prompt)

  if (PLACEHOLDER.test(plain)) failures.push('placeholder: colchetes ou "informação a completar" na resposta')
  for (const line of capsLines(body)) failures.push(`caixa alta em título ou linha: "${line.trim().slice(0, 80)}"`)
  if (INTERNAL_SECTION.test(plain)) failures.push('seção interna (ex.: Observação, Validação necessária)')
  if (AI_META.test(plain)) failures.push('comentário sobre a IA ou sobre o processo de geração')
  if (['despacho', 'memorando'].includes(testCase.kind) && SEI_FIELDS.test(plain)) {
    failures.push('campos de cabeçalho ou assinatura não solicitados (texto deve ser copiável para o SEI)')
  }
  if (testCase.kind === 'pergunta' && DOCUMENT_HEADING.test(plain)) {
    failures.push('respondeu com uma minuta quando o pedido era uma pergunta')
  }

  const words = body.trim().split(/\s+/).length
  const minimum = MIN_WORDS[testCase.kind] ?? 40
  if (words < minimum) failures.push(`resposta curta: ${words} palavras (mínimo ${minimum})`)

  for (const pattern of testCase.must || []) {
    if (!new RegExp(pattern).test(plain)) failures.push(`não trata do pedido: falta o termo /${pattern}/`)
  }

  for (const match of plain.matchAll(REFERENCE)) {
    const number = match[3]
    if (prompt.includes(number)) continue
    const revoked = REVOKED_LAWS.find(law => number.split('/')[0] === law.prefix)
    if (revoked) {
      failures.push(`cita ${revoked.name}, revogada; a SOPH.IA segue a Lei nº 13.303/2016`)
      continue
    }
    if (APPLICABLE_LAWS.has(number)) continue
    warnings.push(`referência não citada no pedido, conferir: "${match[0].trim()}"`)
  }
  return {id: testCase.id, failures, warnings}
}

// Repetição entre respostas da mesma conversa: parte das sequências de 8 palavras da resposta atual que já aparece
// nas respostas anteriores. Medido sobre palavras normalizadas (sem acento, sem pontuação), então grafia não engana.
export const REPETITION = {warn: 0.15, fail: 0.3}
const wordsOf = text => normalize(text).match(/[a-z0-9]+/g) || []

export function overlapRatio(previous, current, size = 8) {
  const before = wordsOf(previous)
  const now = wordsOf(current)
  if (before.length < size || now.length < size) return 0
  const known = new Set()
  for (let i = 0; i + size <= before.length; i++) known.add(before.slice(i, i + size).join(' '))
  let total = 0
  let shared = 0
  for (let i = 0; i + size <= now.length; i++) {
    total++
    if (known.has(now.slice(i, i + size).join(' '))) shared++
  }
  return total ? shared / total : 0
}

export function checkRepetition(previousText, text) {
  const ratio = overlapRatio(previousText, text)
  const percent = `${Math.round(ratio * 100)}%`
  if (ratio > REPETITION.fail) return {ratio, failure: `repete ${percent} de trechos das respostas anteriores da conversa`, warning: null}
  if (ratio > REPETITION.warn) return {ratio, failure: null, warning: `repete ${percent} de trechos das respostas anteriores, conferir`}
  return {ratio, failure: null, warning: null}
}
