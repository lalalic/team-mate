const {initConf, getConf, buy, makePredictAPI} = require("./util");

initConf({
    author:"",  apiKey:"", token:"",

    enabledSuggestion:true, 
    suggestionPrompt: chrome.i18n.getMessage("suggestionPrompt"),
    enabledRephrasing:true,
    rephrasePrompt: chrome.i18n.getMessage("rephrasePrompt"),

    enabledLanguageFlag:false,
    enabledMeetingFlag:false,

    quickPrompts: chrome.i18n.getMessage("quickPrompts")
})

function sanitizeFileName(name) {
    // Define invalid characters for filenames (e.g., for Windows)
    const invalidChars = /[\/\\:*?"<>|]/g;
    
    // Remove invalid characters
    name = name.replace(invalidChars, '_');

    // Truncate the file name to avoid exceeding OS filename limits (255 characters)
    if (name.length > 255) {
        name = name.substring(0, 255);
    }

    return name;
}


function save({transcripts, extras, name, author}) {
    name=`${name}/${new Date().toISOString().split("T")[0].replace(/-/g,"")}`
    if(author){
        name=`${name}-${author}`
        author=author.split(",").map(a=>a.trim())
        transcripts=transcripts.filter(a=>author.indexOf(a.Name)!=-1)
    }
    if(!transcripts?.length)
        return 

    // Build time-indexed extras lookup (translations + suggestions)
    const extrasByTime = {}
    if (Array.isArray(extras)) {
        for (const e of extras) {
            if (!e.Time) continue
            const key = e.Time.slice(0, 8) // group by HH:MM:SS
            if (!extrasByTime[key]) extrasByTime[key] = []
            extrasByTime[key].push(e)
        }
    }
    const flushed = new Set()

    const parts = []
    for (let i = 0; i < transcripts.length; i++) {
        const entry = transcripts[i]
        const nextTime = transcripts[i+1]?.Time || entry.Time
        parts.push(`${entry.Time} --> ${nextTime}\n${entry.Name}: ${entry.Text}\n`)
        // Flush any extras for this timestamp
        const key = (entry.Time || '').slice(0, 8)
        if (key && extrasByTime[key] && !flushed.has(key)) {
            flushed.add(key)
            for (const e of extrasByTime[key]) {
                if (e.type === 'translation') {
                    parts.push(`NOTE translation\n${e.speaker}: ${e.text}\n`)
                } else if (e.type === 'suggestion') {
                    parts.push(`NOTE ${e.kind || 'AI'}\n${e.text}\n`)
                }
            }
        }
    }
    // Flush remaining extras not matched to any caption timestamp
    for (const [key, items] of Object.entries(extrasByTime)) {
        if (flushed.has(key)) continue
        for (const e of items) {
            if (e.type === 'translation') {
                parts.push(`NOTE translation @ ${e.Time}\n${e.speaker}: ${e.text}\n`)
            } else if (e.type === 'suggestion') {
                parts.push(`NOTE ${e.kind || 'AI'} @ ${e.Time}\n${e.text}\n`)
            }
        }
    }

    const content = `WEBVTT\n\n` + parts.join('\n')

    chrome.downloads.download({
        url:"data:text/vtt;charset=utf-8," + encodeURIComponent(content),
        filename:`${sanitizeFileName(name)}.vtt`,
    })
}

async function saveChat({history, transcripts, name}){
    if(!transcripts?.length || !history?.length)
        return 

    const {quickPrompts}=await getConf()
    Object.assign(transcripts,{
        toString(){
            return this.map(({Name,Text})=>`${Name} : ${Text}`).join("\n")
        }
    })

    const postActions=quickPrompts.split("\n").filter(a=>a.trim().startsWith("*"))
    if(postActions.length){
        const service=await makePredictAPI()
        for(const action of postActions){
            const [,question]=action.split(":")
            history.push({role:"user", content: question})
            const response=await service.suggest({
                history, 
                transcripts, 
                name
            })
            history.push({role:"assistant", content: response})
        }
    }

    name=`${name}/${new Date().toISOString().split("T")[0].replace(/-/g,"")}`
    const content=history.map(a=>`${a.role}:\n${a.content}\n`).join("\n")
    chrome.downloads.download({
        url:"data:plain/text;charset=utf-8," + encodeURIComponent(content),
        filename:`${name}-chat.txt`,
    })
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    const sendMessage=m=>chrome.tabs.sendMessage(sender.tab.id, {type:'message',data:m});
    switch(request.message){
        case 'update_transcripts': {
            console.log('update_transcripts received!');
            chrome.action.setBadgeText({ text:  (request.count||"")+""})
            break
        } 
        case 'start_capture': {
            sendMessage('start capture captions!')
            let iconPath="icon-enable.png"
            chrome.action.setIcon({ path: { "16": iconPath, "48": iconPath, "128": iconPath } });
            chrome.action.setBadgeText({ text:  ""})
            break
        }
        case 'stop_capture': {
            console.log('stop_capture received!');
            save(request)
            const conf=await getConf()
            if(conf.author){
                save({...request, author:conf.author})
            }

            if(conf.token){
                saveChat(request)
            }
            const iconPath="icon.png"
            chrome.action.setIcon({ path: { "16": iconPath, "48": iconPath, "128": iconPath } });
            chrome.action.setBadgeText({ text:  ""})
            break
        }
        case "buy":{
            buy();
            break
        }
    }
})