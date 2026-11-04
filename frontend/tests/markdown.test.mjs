// Renderização das respostas do chat com react-markdown e remark-gfm (mesma configuração do Chat.jsx). Executar com:
// node --test frontend/tests/markdown.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const render = text => renderToStaticMarkup(React.createElement(ReactMarkdown, {remarkPlugins: [remarkGfm]}, text))

test('tabela em markdown vira <table>, sem barras cruas no texto', () => {
  const html = render('| Item | Valor |\n|---|---|\n| A | 10 |')
  assert.match(html, /<table>/)
  assert.match(html, /<th>Item<\/th>/)
  assert.match(html, /<td>10<\/td>/)
  assert.doesNotMatch(html, /\|---\|/)
})

test('listas numeradas, marcadores, títulos # e itálico viram elementos HTML', () => {
  const html = render('# Título\n\n1. Primeiro\n2. Segundo\n\n- um\n- dois\n\n*itálico*')
  assert.match(html, /<h1>Título<\/h1>/)
  assert.match(html, /<ol>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<em>itálico<\/em>/)
})

test('HTML bruto da resposta não é executado', () => {
  const html = render('Texto <script>alert(1)</script> fim')
  assert.doesNotMatch(html, /<script/)
})
