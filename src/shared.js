export const storageKey="conf"

export async function initConf(conf){
    return new Promise(resolve=>{
        chrome.storage.local.get([storageKey],result=>{
            if(!result[storageKey]){
                chrome.storage.local.set({[storageKey]:conf}, resolve)
            } else{
                const data={...result[storageKey]}
                //clear unused
                Object.keys(data).forEach(key=>{
                    if(!(key in conf)){
                        delete data[key]
                    }
                })
    
                Object.assign(conf, data)
                //apply new
                if(Object.keys(data).length!=Object.keys(conf).length){
                    chrome.storage.local.set({[storageKey]:conf}, resolve)
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

// Top-up entry point. Opens the settings page where the user picks a
// Stripe Payment Link tier ($1 / $10 / $100). Stripe redirects back to
// setup.html?session=<CHECKOUT_SESSION_ID> which calls applyCredit.
export function buy() {
    chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') })
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

export const Qili_Icon_Svg=`
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    viewBox="-100 -100 1180 1180"
    stroke="black" stroke-width="30" fill="red"
    xml:space="preserve" overflow="hidden">
    <g transform="translate(-146 -146)">
        <g>
            <path
                d="M184.046 183.987C278.925 89.1076 554.707 211.06 800.022 456.376 1045.34 701.691 1167.29 977.473 1072.41 1072.35 977.533 1167.23 701.751 1045.28 456.435 799.963 211.12 554.647 89.1671 278.865 184.046 183.987Z"
                stroke-linecap="butt" stroke-linejoin="miter"
                stroke-miterlimit="8" stroke-opacity="1" fill="none" fill-rule="evenodd" />
            <path
                d="M183.987 1072.36C89.1076 977.482 211.06 701.7 456.376 456.385 701.691 211.07 977.473 89.1169 1072.35 183.996 1167.23 278.875 1045.28 554.657 799.963 799.972 554.647 1045.29 278.865 1167.24 183.987 1072.36Z"
                stroke-linecap="butt" stroke-linejoin="miter"
                stroke-miterlimit="8" stroke-opacity="1" fill="none" fill-rule="evenodd" />
            <path
                d="M372 627.986 457.904 542.082 457.904 585.034 505.065 585.034 505.065 516.348 585.548 516.348 585.548 481.905 542.596 481.905 628.5 396 714.405 481.905 671.452 481.905 671.452 516.348 751.935 516.348 751.935 585.034 799.096 585.034 799.096 542.082 885 627.986 799.096 713.89 799.096 670.938 751.935 670.938 751.935 739.625 671.452 739.625 671.452 774.067 714.405 774.067 628.5 859.972 542.596 774.067 585.548 774.067 585.548 739.625 505.065 739.625 505.065 670.938 457.904 670.938 457.904 713.89Z"
                stroke-width="0" fill-rule="evenodd" fill-opacity="1" />
        </g>
    </g>
</svg>
`