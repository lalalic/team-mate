const {getUsage, getBilling, getWalletBalanceCents}=require("./util")
document.addEventListener('DOMContentLoaded', async ()=>{
    // Open Teams in an existing tab if one is open, otherwise a new one.
    document.querySelector("#openTeams").addEventListener('click', () => {
        const teamsUrl = "https://teams.microsoft.com/v2/"
        chrome.tabs.query({ url: "https://teams.microsoft.com/*" }, (tabs) => {
            if (tabs && tabs.length) {
                chrome.tabs.update(tabs[0].id, { active: true })
                if (tabs[0].windowId != null) chrome.windows?.update?.(tabs[0].windowId, { focused: true })
            } else {
                chrome.tabs.create({ url: teamsUrl })
            }
            window.close()
        })
    })
    document.querySelector("#topup").addEventListener('click',()=>chrome.runtime.sendMessage({message:'buy'}))
    document.querySelector("#setup").addEventListener('click',()=>{
        const url = chrome.runtime.getURL("setup.html")
        chrome.tabs.query({url}, function(tabs) {
            if(!tabs.length){
                chrome.tabs.create({ url })
            }else{
                chrome.tabs.update(tabs[0].id, { active: true });
            }
        })
    })
    try {
        const serverCents = await getWalletBalanceCents()
        if (serverCents != null) {
            document.querySelector("#balance").textContent = `$${(serverCents / 100).toFixed(2)}`
        } else {
            const [u, b] = await Promise.all([getUsage(), getBilling()])
            const balance = (b.credits || 0) - (u.cost || 0)
            document.querySelector("#balance").textContent = `$${balance.toFixed(2)}`
        }
    } catch(_) {}
})