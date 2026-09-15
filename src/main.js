document.addEventListener('DOMContentLoaded', async () => {
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
    document.querySelector("#setup").addEventListener('click', () => {
        const url = chrome.runtime.getURL("setup.html")
        chrome.tabs.query({ url }, (tabs) => {
            if (!tabs.length) chrome.tabs.create({ url })
            else chrome.tabs.update(tabs[0].id, { active: true })
        })
    })
})
