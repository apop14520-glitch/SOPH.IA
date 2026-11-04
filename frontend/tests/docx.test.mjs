// Exportação para .docx sem bibliotecas externas: CRC, conversão do markdown e estrutura do zip. Executar com:
// node --test frontend/tests/docx.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildDocx, crc32, markdownParagraphs} from '../src/docx.js'

// Leitor mínimo de zip: confere assinaturas e CRC de cada entrada, como um leitor de DOCX faria.
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  assert.equal(view.getUint32(end, true), 0x06054b50, 'fim do diretório central ausente')
  const count = view.getUint16(end + 10, true)
  let position = view.getUint32(end + 16, true)
  const entries = {}
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(position, true), 0x02014b50, 'entrada do diretório central inválida')
    const crc = view.getUint32(position + 16, true)
    const size = view.getUint32(position + 24, true)
    const nameLength = view.getUint16(position + 28, true)
    const localOffset = view.getUint32(position + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(position + 46, position + 46 + nameLength))
    assert.equal(view.getUint32(localOffset, true), 0x04034b50, `cabeçalho local inválido em ${name}`)
    const localNameLength = view.getUint16(localOffset + 26, true)
    const start = localOffset + 30 + localNameLength
    const data = bytes.subarray(start, start + size)
    assert.equal(crc32(data), crc, `CRC incorreto em ${name}`)
    entries[name] = new TextDecoder().decode(data)
    position += 46 + nameLength
  }
  return entries
}

test('CRC-32 bate com o valor de referência', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926)
})

test('markdown vira parágrafos: títulos marcados, negrito e marcadores tratados', () => {
  const paragraphs = markdownParagraphs('## Objeto\n\n**Prazo:** 30 dias\n- item um\n---\nfim')
  assert.deepEqual(paragraphs, [
    {text: 'Objeto', heading: true},
    {text: '', heading: false},
    {text: 'Prazo: 30 dias', heading: false},
    {text: '• item um', heading: false},
    {text: 'fim', heading: false},
  ])
})

test('o .docx tem as três partes obrigatórias e o texto escapado', () => {
  const bytes = buildDocx('## Termo de Referência\n\nArt. 1º A & B <teste>')
  const entries = readZip(bytes)
  assert.deepEqual(Object.keys(entries).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'])
  assert.match(entries['word/document.xml'], /<w:t xml:space="preserve">Termo de Referência<\/w:t>/)
  assert.match(entries['word/document.xml'], /Art\. 1º A &amp; B &lt;teste&gt;/)
  assert.match(entries['word/document.xml'], /<w:b\/>/)
  assert.match(entries['[Content_Types].xml'], /wordprocessingml\.document\.main\+xml/)
})

test('texto vazio gera um documento válido', () => {
  const entries = readZip(buildDocx(''))
  assert.match(entries['word/document.xml'], /<w:body>.*<w:sectPr>/)
})
