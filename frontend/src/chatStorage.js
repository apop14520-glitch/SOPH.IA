function ownerId(){
  try{
    const user=JSON.parse(localStorage.getItem('sophia_current_user')||'{}')
    return String(user.id||user.email||user.username||'local').toLowerCase().replace(/[^a-z0-9@._-]/g,'_')
  }catch{return'local'}
}

const storageKey=()=>`sophia_chats_${ownerId()}`

export function loadLocalChats(){
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey())||'[]')
    if(Array.isArray(saved)&&saved.length)return saved
    const legacy=JSON.parse(localStorage.getItem('sophia_local_conversation')||'null')
    if(legacy){
      const migrated={...legacy,id:legacy.id&&legacy.id!=='local'?legacy.id:`local-${Date.now()}`,updated_at:new Date().toISOString()}
      localStorage.setItem(storageKey(),JSON.stringify([migrated]))
      return[migrated]
    }
  }catch{}
  return[]
}

export function getLocalChat(id){
  return loadLocalChats().find(chat=>String(chat.id)===String(id))||null
}

export function saveLocalChat(chat){
  const normalized={...chat,updated_at:new Date().toISOString()}
  const current=loadLocalChats().filter(item=>String(item.id)!==String(normalized.id))
  localStorage.setItem(storageKey(),JSON.stringify([normalized,...current].slice(0,100)))
  return normalized
}

export function createLocalChat(title='Nova conversa'){
  return saveLocalChat({id:`local-${Date.now()}`,title,messages:[]})
}
