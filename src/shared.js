export const storageKey="conf"

export async function initConf(conf){
    return new Promise(resolve=>{
        chrome.storage.local.get([storageKey],result=>{
            if(!result[storageKey]){
                chrome.storage.local.set({[storageKey]:conf}, resolve)
            } else{
                const stored=result[storageKey]
                // Merge: stored values win, defaults only fill in missing keys.
                // Never drop stored keys — they may hold deviceId / baseURL /
                // relayModel or settings owned by other code paths.
                const merged={...conf, ...stored}
                Object.assign(conf, merged)
                const missing=Object.keys(merged).some(key=>!(key in stored))
                if(missing){
                    chrome.storage.local.set({[storageKey]:merged}, resolve)
                }else{
                    resolve()
                }
            }
        })
    })
}

export async function getConf(){
    return new Promise((resolve)=>{
        chrome.storage.local.get([storageKey],result=>{
            resolve(result[storageKey])
        })
    })
}

export function prompt(template="", variables={}){
    return template.replace(/\{(.*?)\}/g, function (matched, $1) {
        if(!($1 in variables))
            return `[]`
        return variables[$1] 
    })
}

export async function changeConf(change){
    const conf=await getConf()
    const data={...conf, ...change}
    chrome.storage.local.set({[storageKey]:data})
    notifyConfChange(Object.keys(change)[0], data)
}

export function notifyConfChange(key, conf){
    // Guard for service-worker context where `document` is undefined.
    if(typeof document!=='undefined'){
        document.dispatchEvent(new CustomEvent('confChange', {detail:{key, conf}}))
    }
}

export async function initSetupPage(){
    Array.from(document.querySelectorAll("[data-i18n]"))
        .forEach(el=>{
            const key=el.dataset.i18n
            console.log(`set i18n key = ${key}`)
            el[key.split("_")[1]||"textContent"]=chrome.i18n.getMessage(key)||key
        })
    document.body.style.display=""

    const conf=await getConf()

    Object.keys(conf).forEach(id=>{
        const el=document.getElementById(id)
        if(el){
            if(id === "modelName") return
            el.addEventListener('change',function(){
                conf[id]=this.type=="checkbox" ? this.checked : this.value

                
                chrome.storage.local.set({[storageKey]:conf})
                notifyConfChange?.(id, conf)
            })

            el[el.type=="checkbox" ? 'checked' : 'value']=conf[id]
        }
    })

    return conf
}
