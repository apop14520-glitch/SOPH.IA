// Envio do link de redefinição pelo Gmail (SMTP com senha de app), com socket simulado. Executar com:
// node --test frontend/tests/smtp.test.mjs
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {ADMIN, call, loginAs, setup} from './helpers.mjs'

const GMAIL = 'soph.ia.teste@gmail.com'
const SENHA_DE_APP = randomBytes(12).toString('base64url')
const MAIL_FROM = `SOPH.IA <${GMAIL}>`

// Servidor SMTP simulado: cada comando recebido dispara a resposta seguinte do roteiro.
function fakeSmtp({rcptReply = '250 2.1.5 OK\r\n', authReply = '235 2.7.0 Accepted\r\n'} = {}) {
  const sent = []
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const script = [
    '220 smtp.gmail.com ESMTP\r\n',
    '250-smtp.gmail.com at your service\r\n250-AUTH LOGIN PLAIN\r\n250 SIZE 35882577\r\n',
    authReply,
    '250 2.1.0 OK\r\n',
    rcptReply,
    '354 Go ahead\r\n',
    '250 2.0.0 OK\r\n',
    '221 2.0.0 closing\r\n',
  ]
  let controller
  const readable = new ReadableStream({
    start(c) { controller = c; controller.enqueue(encoder.encode(script.shift())) },
  })
  const writable = new WritableStream({
    write(chunk) {
      sent.push(decoder.decode(chunk))
      const next = script.shift()
      if (next) controller.enqueue(encoder.encode(next))
    },
  })
  const calls = []
  const connect = (address, options) => {
    calls.push({address, options})
    return {readable, writable}
  }
  return {sent, calls, connect}
}

const commandOf = (sent, prefix) => sent.find(chunk => chunk.startsWith(prefix))
const messageOf = sent => sent.find(chunk => chunk.startsWith('From: '))
const decodeBody = message => {
  const body = message.slice(message.indexOf('\r\n\r\n') + 4).replace(/\r\n\.\r\n$/, '')
  return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8')
}

test('envia pelo Gmail com senha de app e o link chega no corpo da mensagem', async () => {
  const smtp = fakeSmtp()
  const {env, db} = await setup({SMTP_CONNECT: smtp.connect, SMTP_USER: GMAIL, SMTP_PASS: SENHA_DE_APP, MAIL_FROM})
  const res = await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})
  assert.equal(res.status, 200)

  assert.deepEqual(smtp.calls[0].address, {hostname: 'smtp.gmail.com', port: 465})
  assert.equal(smtp.calls[0].options.secureTransport, 'on')

  const auth = commandOf(smtp.sent, 'AUTH PLAIN ')
  assert.equal(auth.trim(), `AUTH PLAIN ${Buffer.from(`\0${GMAIL}\0${SENHA_DE_APP}`).toString('base64')}`)
  assert.equal(commandOf(smtp.sent, 'MAIL FROM:')?.trim(), `MAIL FROM:<${GMAIL}>`)
  assert.equal(commandOf(smtp.sent, 'RCPT TO:')?.trim(), `RCPT TO:<${ADMIN[0]}>`)

  const message = messageOf(smtp.sent)
  assert.ok(message, 'mensagem não foi enviada')
  assert.match(message, new RegExp(`^From: ${MAIL_FROM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\r\n`))
  assert.match(message, new RegExp(`\r\nTo: ${ADMIN[0].replace('.', '\\.')}\r\n`))
  assert.ok(message.includes(`Subject: =?UTF-8?B?${Buffer.from('Redefinição de senha da SOPH.IA', 'utf8').toString('base64')}?=`))
  assert.ok(message.includes('Content-Type: text/html; charset=UTF-8'))

  const html = decodeBody(message)
  const token = html.match(/redefinir\?token=([A-Za-z0-9_-]+)/)?.[1]
  assert.ok(token, 'link de redefinição ausente no corpo')
  assert.equal(db.passwordResets.length, 1)

  // O token do e-mail é o que o Worker aceita, uma única vez.
  const reset = await call(env, 'POST', '/auth/reset', {token, password: 'Gmail@Senha2026'})
  assert.equal(reset.status, 200)
  assert.equal((await call(env, 'POST', '/auth/login', {email: ADMIN[0], password: 'Gmail@Senha2026'})).status, 200)
})

test('Gmail recusa o destinatário: a resposta continua genérica e nada vaza', async () => {
  const smtp = fakeSmtp({rcptReply: '550 5.1.1 The email account does not exist\r\n'})
  const {env} = await setup({SMTP_CONNECT: smtp.connect, SMTP_USER: GMAIL, SMTP_PASS: SENHA_DE_APP, MAIL_FROM})
  const res = await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})
  assert.equal(res.status, 200)
  assert.match((await res.json()).message, /Se o e-mail/)
  assert.equal(messageOf(smtp.sent), undefined, 'a mensagem não deveria ser enviada após a recusa')
})

test('servidor SMTP pode ser trocado por variável, sem alterar o padrão do Gmail', async () => {
  const smtp = fakeSmtp()
  const {env} = await setup({SMTP_CONNECT: smtp.connect, SMTP_USER: GMAIL, SMTP_PASS: SENHA_DE_APP, MAIL_FROM, SMTP_HOST: 'smtp.exemplo.test', SMTP_PORT: '587'})
  await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})
  assert.deepEqual(smtp.calls[0].address, {hostname: 'smtp.exemplo.test', port: 587})
})

test('teste de envio: admin recebe confirmação e o destinatário é a própria conta de envio', async () => {
  const smtp = fakeSmtp()
  const {env} = await setup({SMTP_CONNECT: smtp.connect, SMTP_USER: GMAIL, SMTP_PASS: SENHA_DE_APP, MAIL_FROM})
  const admin = await loginAs(env, ADMIN[0], ADMIN[1])
  const res = await call(env, 'POST', '/admin/mail/test', undefined, admin)
  assert.equal(res.status, 200)
  assert.match((await res.json()).message, new RegExp(GMAIL.replace('.', '\\.')))
  assert.equal(commandOf(smtp.sent, 'RCPT TO:')?.trim(), `RCPT TO:<${GMAIL}>`)
})

test('teste de envio mostra a recusa exata do Gmail (senha de app rejeitada)', async () => {
  const smtp = fakeSmtp({authReply: '535 5.7.8 Username and Password not accepted\r\n'})
  const {env} = await setup({SMTP_CONNECT: smtp.connect, SMTP_USER: GMAIL, SMTP_PASS: SENHA_DE_APP, MAIL_FROM})
  const admin = await loginAs(env, ADMIN[0], ADMIN[1])
  const res = await call(env, 'POST', '/admin/mail/test', undefined, admin)
  assert.equal(res.status, 502)
  assert.match((await res.json()).detail, /535 5\.7\.8/)
})

test('teste de envio é restrito ao admin e exige SMTP configurado', async () => {
  const smtp = fakeSmtp()
  const {env} = await setup({SMTP_CONNECT: smtp.connect, SMTP_USER: GMAIL, SMTP_PASS: SENHA_DE_APP, MAIL_FROM})
  const admin = await loginAs(env, ADMIN[0], ADMIN[1])
  assert.equal((await call(env, 'POST', '/users', {name: 'Padrão', email: 'padrao.teste@gmail.com', password: 'Novo@12345', role: 'padrao', sector_id: 1}, admin)).status, 201)
  const padrao = await loginAs(env, 'padrao.teste@gmail.com', 'Novo@12345')
  assert.equal((await call(env, 'POST', '/admin/mail/test', undefined, padrao)).status, 403)
  const semSmtp = await setup()
  const adminSemSmtp = await loginAs(semSmtp.env, ADMIN[0], ADMIN[1])
  assert.equal((await call(semSmtp.env, 'POST', '/admin/mail/test', undefined, adminSemSmtp)).status, 503)
})

test('usuário SMTP sem remetente configurado não habilita o envio', async () => {
  const smtp = fakeSmtp()
  const {env} = await setup({SMTP_CONNECT: smtp.connect, SMTP_USER: GMAIL, SMTP_PASS: SENHA_DE_APP})
  const res = await call(env, 'POST', '/auth/forgot', {email: ADMIN[0]})
  assert.equal(res.status, 503)
  assert.equal(smtp.calls.length, 0)
})
