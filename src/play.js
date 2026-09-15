//https://opentextcorporation-my.sharepoint.com/*
const { rephrase } = require("./util")

const ID='OneTranscript'
let enabled=false

function checkStatus(mutationList, observer){
    if(!enabled){
        if(!!document.getElementById(ID)?.getClientRects().length){
            enabled=true
            startTranscription()
        }
    }else{
        if(!document.getElementById(ID)?.getClientRects().length){
            enabled=false
            stopTranscription()
        }
    }
}

function startTranscription(){ 
    chrome.runtime.sendMessage({message:"start_capture"})

    const responseEl=document.createElement('pre')
    responseEl.id="rephraseContainer"
    responseEl.style="position:absolute;z-index:99998; top:10px; right:10px; border: solid 1px gray;background:white;padding:10px; max-height:200px; width:400px;white-space: break-spaces;"
    document.body.appendChild(responseEl)

    const actionElHeight=32
    const actionEl=document.createElement('button')
    actionEl.id="rephraseButton"
    actionEl.textContent="Check"
    actionEl.style=`position:absolute;z-index:99999;display:none;height:${actionElHeight}px;background:white;border:0px;border-radius:5px;`
    document.body.appendChild(actionEl)
    
    actionEl.addEventListener('click', async function(){
        responseEl.textContent="think..."
        const message=this.getAttribute('message')
        if(!message)
            return 
        try{
            const response=await rephrase(message)
            if(response){
                responseEl.textContent=response;
            }
        }catch(e){
            responseEl.textContent="Error: "+e.message
        }
    })

    const container=document.querySelector('#OneTranscript')
    container.addEventListener('mouseover', function(event){
        console.log('enter: '+Array.from(event.target.classList).join(",")+' id='+event.target.id)
        if(event.target.id?.startsWith('text-')){
            actionEl.style.display='block'
            const item=event.target.parentElement.parentElement
            const {top,right}=item.getBoundingClientRect()
            actionEl.style.top=(top-actionElHeight)+"px"
            actionEl.style.left=(right-130)+"px"

            actionEl.setAttribute('message', event.target.textContent.split(":")[1])
        }
    })
}

function stopTranscription(){
    chrome.runtime.sendMessage({message:"stop_capture"})
    document.getElementById('rephraseContainer').remove()
    document.getElementById('rephraseButton').remove()
}


const observer = new MutationObserver(checkStatus);
observer.observe(document.body, { childList: true, subtree: true });
