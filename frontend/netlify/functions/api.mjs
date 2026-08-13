import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import postgres from 'postgres'

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {'content-type':'application/json; charset=utf-8'},
})
const fail = (detail, status = 400) => json({detail}, status)
const secret = () => new TextEncoder().encode(process.env.SECRET_KEY || '')
if (!process.env.NETLIFY_DB_URL) throw new Error('NETLIFY_DB_URL não configurada. Ative o Netlify Database no projeto.')
const sql = postgres(process.env.NETLIFY_DB_URL, {max: 1})

let initialized
async function init() {
  if (initialized) return initialized
  initialized = (async () => {
    if (!process.env.SECRET_KEY || process.env.SECRET_KEY.length < 32) throw new Error('SECRET_KEY ausente ou insegura')
    await sql`create table if not exists sectors (id serial primary key, name text unique not null, acronym text unique not null)`
    await sql`create table if not exists users (id serial primary key, name text not null, email text unique not null, password_hash text not null, role text not null default 'padrao', active boolean not null default true, sector_id integer references sectors(id))`
    await sql`create table if not exists conversations (id serial primary key, title text not null default 'Nova conversa', user_id integer not null references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now())`
    await sql`create table if not exists chat_messages (id serial primary key, conversation_id integer not null references conversations(id) on delete cascade, role text not null, content text not null, sources jsonb not null default '[]', attachment_ids jsonb not null default '[]', created_at timestamptz not null default now())`
    const sectors = [['Tecnologia da Informação','TI'],['Presidência','PRES'],['Diretoria Administrativa e Financeira','DAF'],['Diretoria Técnica e Operacional','DTO'],['Assessoria Jurídica','ASJUR'],['Recursos Humanos','RH'],['Licitações e Contratos','LIC']]
    for (const [name, acronym] of sectors) await sql`insert into sectors (name, acronym) values (${name}, ${acronym}) on conflict do nothing`
    const [{count}] = await sql`select count(*)::int as count from users`
    if (!count && process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
      const [sector] = await sql`select id from sectors where acronym='TI'`
      const hash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12)
      await sql`insert into users (name,email,password_hash,role,sector_id) values ('Administrador',${process.env.SEED_ADMIN_EMAIL.toLowerCase()},${hash},'admin',${sector?.id || null})`
    }
  })()
  return initialized
}

async function tokenFor(user) {
  return new SignJWT({sub:String(user.id),role:user.role}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('8h').sign(secret())
}
async function currentUser(req) {
  const raw = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')
  if (!raw) return null
  try {
    const {payload} = await jwtVerify(raw, secret())
    const [user] = await sql`select u.id,u.name,u.email,u.role,u.active,u.sector_id,s.name sector_name from users u left join sectors s on s.id=u.sector_id where u.id=${Number(payload.sub)} and u.active=true`
    return user || null
  } catch { return null }
}
const publicUser = u => ({id:u.id,name:u.name,email:u.email,role:u.role,active:u.active,sector_id:u.sector_id,sector_name:u.sector_name})
const titleCase = text => String(text).trim().replace(/\s+/g,' ').slice(0,70).replace(/^./, c=>c.toUpperCase())

async function gemini(prompt, history=[]) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return 'A inteligência artificial ainda não foi configurada. Cadastre GEMINI_API_KEY nas variáveis de ambiente do Netlify.'
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const system = `Você é a SOPH.IA, assistente institucional da Sociedade de Portos e Hidrovias de Rondônia. Responda em português brasileiro, com texto claro, formal e bem estruturado. Para minutas administrativas, entregue diretamente um texto útil, pronto para copiar e revisar, sem inventar nomes, números de processo, leis ou fatos. Não use caixa alta integral em títulos. Quando faltar dado indispensável, sinalize-o de forma breve ao final.`
  const contents = [...history.slice(-10).map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),{role:'user',parts:[{text:prompt}]}]
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,generationConfig:{temperature:.45,maxOutputTokens:8192}})})
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || 'Falha ao consultar o Gemini')
  return data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim() || 'Não foi possível gerar uma resposta.'
}

export default async (req) => {
  try {
    await init()
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/\.netlify\/functions\/api/,'').replace(/^\/api/,'') || '/'
    const method = req.method
    const body = ['POST','PUT','PATCH'].includes(method) ? await req.json().catch(()=>({})) : {}

    if (path==='/health') return json({status:'ok',platform:'netlify'})
    if (path==='/auth/login' && method==='POST') {
      const [u] = await sql`select u.*,s.name sector_name from users u left join sectors s on s.id=u.sector_id where lower(u.email)=lower(${body.email||''})`
      if (!u || !u.active || !await bcrypt.compare(body.password||'',u.password_hash)) return fail('E-mail ou senha inválidos',401)
      return json({access_token:await tokenFor(u),token_type:'bearer',user:publicUser(u)})
    }
    if (path==='/auth/register' && method==='POST') {
      const email=String(body.email||'').trim().toLowerCase()
      if(!/@sophi?a?\.ro\.gov\.br$/i.test(email)) return fail('Use um e-mail institucional da SOPH.')
      if(String(body.password||'').length<8) return fail('A senha deve possuir ao menos 8 caracteres.')
      const [sector]=await sql`select id from sectors where lower(name)=lower(${body.sector||''})`
      if(!sector) return fail('Setor inválido.')
      try { const hash=await bcrypt.hash(body.password,12); await sql`insert into users(name,email,password_hash,role,sector_id) values(${body.name},${email},${hash},'padrao',${sector.id})` }
      catch { return fail('Já existe um usuário com esse e-mail.',409) }
      return json({message:'Cadastro concluído.'},201)
    }
    const user=await currentUser(req)
    if(!user) return fail('Sessão inválida ou expirada.',403)
    if(path==='/auth/me') return json(publicUser(user))
    if(path==='/sectors' && method==='GET') return json(await sql`select * from sectors order by name`)
    if(path==='/conversations' && method==='GET') return json(await sql`select id,title,created_at,updated_at from conversations where user_id=${user.id} order by updated_at desc`)
    if(path==='/conversations' && method==='POST') {
      const [c]=await sql`insert into conversations(title,user_id) values(${body.title||'Nova conversa'},${user.id}) returning *`; return json(c,201)
    }
    let match=path.match(/^\/conversations\/(\d+)$/)
    if(match && method==='GET') {
      const [c]=await sql`select * from conversations where id=${Number(match[1])} and user_id=${user.id}`; if(!c)return fail('Conversa não encontrada.',404)
      c.messages=await sql`select id,role,content,sources,attachment_ids,created_at from chat_messages where conversation_id=${c.id} order by created_at`; return json(c)
    }
    match=path.match(/^\/conversations\/(\d+)\/messages$/)
    if(match && method==='POST') {
      const id=Number(match[1]); const [c]=await sql`select * from conversations where id=${id} and user_id=${user.id}`; if(!c)return fail('Conversa não encontrada.',404)
      const prompt=String(body.content||'').trim(); if(!prompt)return fail('Escreva uma mensagem.')
      await sql`insert into chat_messages(conversation_id,role,content,attachment_ids) values(${id},'user',${prompt},${sql.json(body.attachment_ids||[])})`
      const history=await sql`select role,content from chat_messages where conversation_id=${id} order by created_at desc limit 12`
      const answer=await gemini(prompt,history.reverse().slice(0,-1))
      const [message]=await sql`insert into chat_messages(conversation_id,role,content) values(${id},'assistant',${answer}) returning *`
      if(c.title==='Nova conversa') await sql`update conversations set title=${titleCase(prompt)},updated_at=now() where id=${id}`
      else await sql`update conversations set updated_at=now() where id=${id}`
      return json(message,201)
    }
    if(path==='/users' && method==='GET') {
      if(!['admin','gerente'].includes(user.role))return fail('Acesso restrito.',403)
      return json(await sql`select u.id,u.name,u.email,u.role,u.active,u.sector_id,s.name sector_name from users u left join sectors s on s.id=u.sector_id order by u.name`)
    }
    if(path==='/users' && method==='POST') {
      if(!['admin','gerente'].includes(user.role))return fail('Acesso restrito.',403)
      const hash=await bcrypt.hash(body.password||'',12)
      try { const [created]=await sql`insert into users(name,email,password_hash,role,sector_id) values(${body.name},${String(body.email||'').toLowerCase()},${hash},${body.role||'padrao'},${body.sector_id||null}) returning id,name,email,role,active,sector_id`; return json(created,201) }
      catch{return fail('Não foi possível criar o usuário; verifique se o e-mail já existe.',409)}
    }
    match=path.match(/^\/users\/(\d+)\/password$/)
    if(match && method==='PUT') {
      if(!['admin','gerente'].includes(user.role))return fail('Acesso restrito.',403)
      const hash=await bcrypt.hash(body.password||'',12); await sql`update users set password_hash=${hash} where id=${Number(match[1])}`; return json({message:'Senha alterada.'})
    }
    return fail('Recurso ainda não migrado para o Netlify.',404)
  } catch (error) {
    console.error(error)
    return fail(process.env.CONTEXT==='production'?'Falha interna da SOPH.IA. Consulte os logs das Functions.':String(error?.message||error),500)
  }
}
