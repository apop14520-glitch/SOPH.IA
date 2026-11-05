// Recuperação de trechos da base institucional: cada documento é dividido em trechos e o modelo recebe
// só os trechos mais relevantes para o pedido, dentro de um limite de caracteres.

export const CONTEXT_BUDGET = 12000 // caracteres de base institucional por pedido
export const CHUNKS_PER_DOCUMENT = 4 // trechos de um mesmo documento, no máximo
export const CHUNK_SIZE = 1800 // tamanho máximo de cada trecho

export const normalizeText = value => String(value || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '')
export const searchWords = value => [...new Set(normalizeText(value).match(/[a-z0-9]{3,}/g) || [])]

// Um bloco é título se começa com #, ou se é curto, em maiúsculas e sem pontuação final.
function isHeading(block) {
  if (/^#{1,6}\s+\S/.test(block)) return true
  return block.length >= 4 && block.length <= 90 && !/[.;:,]$/.test(block) && block === block.toLocaleUpperCase('pt-BR') && /[A-ZÀ-Ý]/.test(block)
}

// Divide o texto em trechos de até `size` caracteres, cortando nas quebras de parágrafo e nos títulos.
// Cada trecho guarda o último título visto, para o modelo saber de que seção ele vem.
export function chunkDocument(text, size = CHUNK_SIZE) {
  const chunks = []
  let heading = ''
  let buffer = ''
  let bufferHeading = ''
  const flush = () => {
    if (buffer.trim()) chunks.push({heading: bufferHeading, text: buffer.trim()})
    buffer = ''
  }
  for (const block of String(text || '').split(/\n\s*\n/)) {
    const trimmed = block.trim()
    if (!trimmed) continue
    if (isHeading(trimmed)) {
      flush()
      heading = trimmed.replace(/^#{1,6}\s+/, '').split('\n')[0].slice(0, 120)
    }
    if (trimmed.length > size) {
      flush()
      for (let start = 0; start < trimmed.length; start += size) {
        const piece = trimmed.slice(start, start + size).trim()
        if (piece) chunks.push({heading, text: piece})
      }
      bufferHeading = heading
      continue
    }
    if (buffer && buffer.length + trimmed.length + 2 > size) flush()
    if (!buffer) bufferHeading = heading
    buffer = buffer ? `${buffer}\n\n${trimmed}` : trimmed
  }
  flush()
  return chunks
}

// Escolhe os trechos mais relevantes para o pedido. Ordem: relevância, depois documento e posição.
// Respeita o limite total de caracteres e o máximo de trechos por documento. Sem nenhum trecho relevante,
// envia o início de cada documento, para o modelo ao menos conhecer o material disponível.
export function selectExcerpts(documents, prompt, {budget = CONTEXT_BUDGET, perDocument = CHUNKS_PER_DOCUMENT} = {}) {
  const words = searchWords(prompt)
  const pool = []
  documents.forEach((doc, docIndex) => {
    chunkDocument(doc.content).forEach((chunk, position) => {
      const headingText = normalizeText(chunk.heading)
      const body = normalizeText(chunk.text)
      const score = words.reduce((total, word) => total + (headingText.includes(word) ? 6 : 0) + (body.includes(word) ? 1 : 0), 0)
      pool.push({doc, docIndex, position, chunk, score})
    })
  })
  const ranked = pool.filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.docIndex - b.docIndex || a.position - b.position)
  const source = ranked.length ? ranked : pool.filter(item => item.position === 0).sort((a, b) => a.docIndex - b.docIndex)
  const limit = ranked.length ? perDocument : 1

  const chosen = []
  const perDoc = new Map()
  let used = 0
  for (const item of source) {
    const count = perDoc.get(item.doc.id) || 0
    if (count >= limit) continue
    const cost = item.chunk.text.length + item.chunk.heading.length + 20
    if (used + cost > budget) continue
    chosen.push(item)
    perDoc.set(item.doc.id, count + 1)
    used += cost
  }
  return groupByDocument(chosen)
}

// Um documento por entrada, com os trechos escolhidos em ordem de leitura. Mantém id, título e categoria,
// para que as fontes consultadas continuem apontando para o documento.
function groupByDocument(items) {
  const byDoc = new Map()
  for (const item of items) {
    if (!byDoc.has(item.doc.id)) byDoc.set(item.doc.id, {doc: item.doc, parts: []})
    byDoc.get(item.doc.id).parts.push(item)
  }
  return [...byDoc.values()].map(({doc, parts}) => {
    parts.sort((a, b) => a.position - b.position)
    const content = parts.map(({chunk}) => (chunk.heading ? `[${chunk.heading}]\n` : '') + chunk.text).join('\n\n[...]\n\n')
    return {...doc, content}
  })
}
