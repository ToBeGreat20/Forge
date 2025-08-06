// Listen for screenshot capture requests from content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
  if(msg && msg.type === 'CAPTURE_VISIBLE_TAB'){
    chrome.tabs.captureVisibleTab(sender.tab.windowId, {format:'png'}, dataUrl=>{
      sendResponse({dataUrl});
    });
    // Must return true to indicate async response
    return true;
  }
});

chrome.commands.onCommand.addListener(cmd => {
  console.log('Command received:', cmd);
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    const tab = tabs[0];
    
    // Skip restricted URLs (chrome://, chrome-extension://, etc.)
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('moz-extension://') ||
        tab.url.startsWith('edge://')) {
      console.log('Cannot run on restricted URL:', tab.url);
      return;
    }
    
    if (cmd === "start-selection") {
      console.log('Executing start-selection script on tab:', tab.id, tab.url);
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: () => {
          console.log('Script injected, checking for function:', typeof window.__startRegionSelection);
          if (window.__startRegionSelection) {
            window.__startRegionSelection();
          } else {
            console.error('__startRegionSelection function not found!');
          }
        }
      }).then(result => {
        console.log('Script execution result:', result);
      }).catch(error => {
        console.error('Failed to execute script:', error);
      });
    } else if (cmd === "clear-all-overlays") {
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: () => window.__clearAllOverlays && window.__clearAllOverlays()
      }).catch(error => {
        console.error('Failed to execute script:', error);
      });
    }
  });
});
