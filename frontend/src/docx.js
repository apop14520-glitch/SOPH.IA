// Gera um .docx sem bibliotecas externas: um arquivo DOCX é um zip com três partes XML.
// O zip usa o método "sem compressão", que todo leitor de DOCX aceita.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes) {
  let c = 0xFFFFFFFF
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function zip(files, date = new Date()) {
  const encoder = new TextEncoder()
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const parts = []
  const central = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = file.data
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // nomes em UTF-8
    lv.setUint16(8, 0, true) // método 0: sem compressão
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)
    parts.push(local, data)

    const header = new Uint8Array(46 + name.length)
    const hv = new DataView(header.buffer)
    hv.setUint32(0, 0x02014b50, true)
    hv.setUint16(4, 20, true)
    hv.setUint16(6, 20, true)
    hv.setUint16(8, 0x0800, true)
    hv.setUint16(10, 0, true)
    hv.setUint16(12, dosTime, true)
    hv.setUint16(14, dosDate, true)
    hv.setUint32(16, crc, true)
    hv.setUint32(20, data.length, true)
    hv.setUint32(24, data.length, true)
    hv.setUint16(28, name.length, true)
    hv.setUint32(42, offset, true)
    header.set(name, 46)
    central.push(header)
    offset += local.length + data.length
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const all = [...parts, ...central, end]
  const out = new Uint8Array(all.reduce((total, part) => total + part.length, 0))
  let position = 0
  for (const part of all) {
    out.set(part, position)
    position += part.length
  }
  return out
}

const escapeXml = value => String(value)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

// Converte o markdown das respostas em parágrafos simples: títulos em negrito, listas com marcador, sem marcas de formatação.
export function markdownParagraphs(markdown = '') {
  return String(markdown).split(/\r?\n/).flatMap(line => {
    if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) return []
    const heading = /^#{1,6}\s+/.test(line)
    const text = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\s*[-•*]\s+/, '• ')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .trimEnd()
    return [{text, heading}]
  })
}

function paragraphXml({text, heading}) {
  const spacing = heading ? '<w:spacing w:before="240" w:after="120"/>' : '<w:spacing w:after="120"/>'
  const run = text ? `<w:r>${heading ? '<w:rPr><w:b/><w:sz w:val="26"/></w:rPr>' : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>` : ''
  return `<w:p><w:pPr>${spacing}</w:pPr>${run}</w:p>`
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'

// Devolve os bytes de um .docx com o conteúdo markdown informado.
export function buildDocx(markdown) {
  const body = markdownParagraphs(markdown).map(paragraphXml).join('')
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1134" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
  const encoder = new TextEncoder()
  return zip([
    {name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES)},
    {name: '_rels/.rels', data: encoder.encode(ROOT_RELS)},
    {name: 'word/document.xml', data: encoder.encode(document)},
  ])
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
