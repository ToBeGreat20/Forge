(() => {
  console.log('Sticky Region Overlay content script loaded!');
  
  // Dynamically load html2canvas once for screenshot capture
  let html2canvasPromise = null;
  // Load html2canvas in the *content-script realm* so we can call it (DOM <script> tags run in the page realm, which is isolated).
function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = new Promise((resolve, reject) => {
      const localUrl = chrome.runtime.getURL('html2canvas.min.js');
    // Attempt to fetch and eval the bundled copy (runs in the same JS context)
    fetch(localUrl)
      .then(r => {
        if (!r.ok) throw new Error('Local fetch failed');
        return r.text();
      })
      .then(codeTxt => {
        try {
          eval(codeTxt); // expose html2canvas to the content-script world
          if (window.html2canvas) {
            console.log('html2canvas loaded from extension bundle');
            resolve(window.html2canvas);
            return;
          }
          throw new Error('html2canvas eval produced no global');
        } catch (e) {
          console.warn('Local eval failed', e);
          throw e;
        }
      })
      .catch(() => {
        // Fallback: fetch minified build as text and eval (works within CSP)
        fetch('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
          .then(r => r.text())
          .then(txt => {
            try {
              eval(txt);
              if (window.html2canvas) {
                resolve(window.html2canvas);
              } else {
                reject(new Error('html2canvas eval failed'));
              }
            } catch (e) {
              console.warn('CDN eval failed, falling back to stub html2canvas');
              createStub();
              resolve(window.html2canvas);
            }
          })
          .catch((err)=>{
            console.warn('CDN fetch failed', err, 'falling back to stub html2canvas');
            createStub();
            resolve(window.html2canvas);
          });
      });
    function createStub(){
        if (window.html2canvas) return;
        window.html2canvas = function(element, options){
          return new Promise(res=>{
            const canvas=document.createElement('canvas');
            canvas.width = options?.width || 1;
            canvas.height = options?.height || 1;
            res(canvas);
          });
        };
      }
    });
    return html2canvasPromise;
  }

  // Array to track all overlays
  let overlays = [];
  let overlayIdCounter = 0;
  let isAnimationLoopRunning = false;

  // Apple Intelligence Chat Panel class
  class AppleIntelligenceChatPanel {
    // Direct screenshot injection with retry mechanism
    injectScreenshotThumbnail(retryCount = 0) {
      if (!this.parentOverlay) {
        console.log('🚀 No parent overlay found');
        return;
      }
      
      // Only inject once - check if already injected
      if (this.screenshotInjected) {
        console.log('🚀 Screenshot already injected, skipping');
        return;
      }
      
      if (!this.parentOverlay.regionScreenshot) {
        if (retryCount < 10) {
          console.log(`🚀 Screenshot not ready, retry ${retryCount + 1}/10`);
          setTimeout(() => this.injectScreenshotThumbnail(retryCount + 1), 500);
          return;
        } else {
          console.log('🚀 Screenshot injection failed after 10 retries');
          return;
        }
      }

      const screenshot = this.parentOverlay.regionScreenshot;
      console.log('🚀 Injecting screenshot directly, length:', screenshot.length);

      // Create image object
      const imgObj = {
        data: screenshot,
        type: 'image/png',
        name: `overlay-screenshot-${Date.now()}.png`
      };

      // Add to currentImages if not already there
      if (!this.currentImages.some(img => img.data === screenshot)) {
        this.currentImages.push(imgObj);
      }

      // Force create preview container if it doesn't exist
      let previewContainer = this.element.querySelector('.ai-image-preview');
      if (!previewContainer) {
        previewContainer = document.createElement('div');
        previewContainer.className = 'ai-image-preview';
        Object.assign(previewContainer.style, {
          display: 'flex',
          padding: '8px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexWrap: 'wrap',
          gap: '8px'
        });
        const inputArea = this.element.querySelector('.ai-input-area');
        if (inputArea) {
          this.element.insertBefore(previewContainer, inputArea);
        }
      }

      // Force create thumbnail
      const item = document.createElement('div');
      item.className = 'ai-preview-item';
      Object.assign(item.style, {
        position: 'relative',
        width: '60px',
        height: '60px'
      });

      const img = document.createElement('img');
      img.src = screenshot;
      Object.assign(img.style, {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.2)'
      });
      item.appendChild(img);

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '-8px',
        right: '-8px',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        border: 'none',
        background: 'rgba(255,255,255,0.9)',
        color: '#000',
        fontSize: '12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      });
      
      closeBtn.onclick = () => {
        item.remove();
        const index = this.currentImages.findIndex(img => img.data === screenshot);
        if (index > -1) this.currentImages.splice(index, 1);
        if (previewContainer.children.length === 0) {
          previewContainer.style.display = 'none';
        }
      };
      
      item.appendChild(closeBtn);
      previewContainer.appendChild(item);
      previewContainer.style.display = 'flex';

      console.log('🚀 Screenshot thumbnail injected successfully');
      
      // Mark as injected so it doesn't happen again
      this.screenshotInjected = true;
    }

    constructor(parentOverlay) {
      console.log('AppleIntelligenceChatPanel constructor called with:', parentOverlay);
      this.parentOverlay = parentOverlay;
      this.isVisible = false;
      this.isConnected = false;
      this.currentMessage = null;
      this.messages = [];
      // Array to hold any pasted/dropped images waiting to be sent
      this.currentImages = [];
      this.currentImage = null; // DEPRECATED – kept for backward compatibility
      this.screenshotInjected = false; // Track if screenshot has been injected
      console.log('Creating element...');
      this.createElement();
      console.log('Setting up event listeners...');
      this.setupEventListeners();
      console.log('Testing connection...');
      this.testConnection();
      console.log('AppleIntelligenceChatPanel constructor complete');
      // Screenshot injection will happen after element is properly set
    }

    createElement() {
      this.element = document.createElement('div');
      this.element.className = 'apple-intelligence-panel';
      this.element.innerHTML = `
        <div class="ai-header">
          <button class="ai-pin" aria-label="Pin">pin</button>
          <button class="ai-close" aria-label="Close chat">✕</button>
        </div>
        <div class="ai-messages"></div>
        <div class="ai-image-preview" style="display: none; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);"></div>
        <div class="ai-input-area">
          <textarea class="ai-input" placeholder="Ask me anything... (Paste images with Ctrl+V)" rows="1"></textarea>
          <button class="ai-send" aria-label="Send"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 18V6M8 10l4-4 4 4" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></button>
        </div>
      `;
      document.body.appendChild(this.element);
    }

    setupEventListeners() {
      const closeBtn = this.element.querySelector('.ai-close');
      const pinBtn = this.element.querySelector('.ai-pin');
      const input = this.element.querySelector('.ai-input');
      const sendBtn = this.element.querySelector('.ai-send');
      
      closeBtn.addEventListener('click', () => this.chatPanel.hide());
      

      
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && this.isConnected) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      
      sendBtn.addEventListener('click', () => {
        if (this.isConnected) {
          this.sendMessage();
        }
      });
      
      // Image paste functionality - listen on input with capture
      input.addEventListener('paste', (e) => {
        this.handlePaste(e);
      }, true); // Use capture phase
      
      // Also listen for paste on the entire panel (capture) so we catch paste even if focus isn't in textarea
      this.element.addEventListener('paste', (e) => {
        this.handlePaste(e);
      }, true);

      // Fallback: capture paste events at window level but ONLY process if target is within this panel
      this.windowPasteListener = (e) => {
        if (this.element.contains(e.target)) {
          this.handlePaste(e);
        }
      };
      window.addEventListener('paste', this.windowPasteListener, true);
      
      // Add drag and drop support
      const inputArea = this.element.querySelector('.ai-input-area');
      
      // Prevent default drag behaviors
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        inputArea.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      });
      
      // Handle drag over visual feedback
      inputArea.addEventListener('dragover', (e) => {
        inputArea.style.backgroundColor = 'rgba(0, 122, 255, 0.1)';
        inputArea.style.border = '2px dashed rgba(0, 122, 255, 0.5)';
      });
      
      inputArea.addEventListener('dragleave', (e) => {
        inputArea.style.backgroundColor = '';
        inputArea.style.border = '';
      });
      
      // Handle file drop
      inputArea.addEventListener('drop', (e) => {
        inputArea.style.backgroundColor = '';
        inputArea.style.border = '';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
            // Convert dropped image to base64
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target.result;
              const imgObj = {
                data: base64,
                type: file.type,
                name: file.name || `dropped-image-${Date.now()}`
              };
              this.currentImages.push(imgObj);
        this.showImagePreview(imgObj);
            };
            reader.readAsDataURL(file);
          }
        }
      });

      // Click outside handler removed per user request
    }

    async testConnection() {
      try {
        const response = await fetch('http://localhost:8000/health', {
          method: 'GET',
          mode: 'cors'
        });
        
        this.isConnected = response.ok;
      } catch (error) {
        console.error('Apple Intelligence connection failed:', error);
        this.isConnected = false;
      }
    }

    async handlePaste(e) {
  console.log('handlePaste fired, event:', e);
      const input = this.element.querySelector('.ai-input');
      const clipboard = e.clipboardData;
      const files = clipboard?.files || [];
      const items = clipboard?.items || [];
      if (!items) return;
      
      // Detect image either in files list or items list
      let imageFile = null;
      if (files.length) {
        // Prefer files list (more reliable for images)
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith('image/')) {
            imageFile = files[i];
            break;
          }
        }
      }
      if (!imageFile) {
        // Fallback: check items list
        for (let i = 0; i <items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            imageFile = items[i].getAsFile();
            break;
          }
        }
      }
      // Fallback: try async clipboard read (Chrome requires permission)
  if (!imageFile && navigator.clipboard && navigator.clipboard.read) {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const types = item.types;
        for (const type of types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            imageFile = new File([blob], `pasted-image-${Date.now()}.${type.split('/')[1]}`, { type });
            break;
          }
        }
        if (imageFile) break;
      }
    } catch(err) {
      console.warn('navigator.clipboard.read failed:', err);
    }
  }
  if (!imageFile) return; // still no image
      
      // Block default paste and clear any inserted text
      e.preventDefault();
      e.stopPropagation();
      if (input) input.value = '';
      
      // Convert image to base64 and preview
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        const imgObj = {
          data: base64,
          type: imageFile.type,
          name: imageFile.name || `pasted-image-${Date.now()}`
        };
        this.currentImages.push(imgObj);
        this.showImagePreview(imgObj);
      };
      reader.readAsDataURL(imageFile);
    }

    clearImagePreview() {
      const previewContainer = this.element.querySelector('.ai-image-preview');
      if (previewContainer) {
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'none';
      }
      this.currentImages = [];
      this.currentImage = null; // legacy
    }

    // Display preview thumbnails for pasted/dropped images
    showImagePreview(imageObj) {
      if (!imageObj || !imageObj.data) return;

      // Push to currentImages if not already present
      if (!this.currentImages.includes(imageObj)) {
        this.currentImages.push(imageObj);
      }
      const base64 = imageObj.data;

      // Ensure preview container exists
      let previewContainer = this.element.querySelector('.ai-image-preview');
      if (!previewContainer) {
        previewContainer = document.createElement('div');
        previewContainer.className = 'ai-image-preview';
        Object.assign(previewContainer.style, {
          display: 'none',
          padding: '8px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexWrap: 'wrap',
          gap: '8px'
        });
        this.element.insertBefore(previewContainer, this.element.querySelector('.ai-input-area'));
      }

      // Create preview item
      const item = document.createElement('div');
      item.className = 'ai-preview-item';
      Object.assign(item.style, {
        position: 'relative',
        width: '60px',
        height: '60px'
      });

      const img = document.createElement('img');
      img.src = base64;
      Object.assign(img.style, {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.2)'
      });
      item.appendChild(img);

      // Close (remove) button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '-6px',
        right: '-6px',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        border: 'none',
        cursor: 'pointer',
        fontSize: '12px',
        lineHeight: '18px',
        padding: '0'
      });
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        item.remove();
        // Remove from images array
        this.currentImages = this.currentImages.filter(imgObj => imgObj !== imageObj);
        if (!previewContainer.children.length) {
          previewContainer.style.display = 'none';
        }
      });
      item.appendChild(closeBtn);

      previewContainer.appendChild(item);
      previewContainer.style.display = 'flex';
    }

    show() {
      console.log('AppleIntelligenceChatPanel show() called');
      console.log('Current isVisible:', this.isVisible);
      console.log('Element:', this.element);
      
      if (this.isVisible) {
        console.log('Already visible, returning');
        return;
      }
      
      // Restore display if hidden
      this.element.style.display = 'flex';
      console.log('Set display to flex');
      
      // Position near the parent overlay
      const parentRect = this.parentOverlay.element.getBoundingClientRect();
      console.log('Parent overlay rect:', parentRect);
      const panelWidth = 340; 
      const panelHeight = 500;
      
      // Try to position to the right of the overlay, fallback to left
      let left = parentRect.right + 15;
      if (left + panelWidth > window.innerWidth) {
        left = parentRect.left - panelWidth - 15;
      }
      
      // Keep within viewport vertically
      let top = parentRect.top;
      if (top + panelHeight > window.innerHeight) {
        top = window.innerHeight - panelHeight - 20;
      }
      if (top < 20) top = 20;
      
      console.log('Positioning at:', left, top);
      this.element.style.left = left + 'px';
      this.element.style.top = top + 'px';
      
      this.isVisible = true;
      console.log('Set isVisible to true, adding visible class');
      setTimeout(() => {
        this.element.classList.add('visible');
        console.log('Added visible class');
      }, 180);
      
      // Focus input
      setTimeout(() => {
        const input = this.element.querySelector('.ai-input');
        console.log('Found input element:', input);
        if (!input.disabled) input.focus();
      }, 400);
    }

    hide() {
      if (!this.isVisible) return;
      
      this.element.classList.remove('visible');
      this.isVisible = false;
      
      // Don't remove from DOM, just hide visually
      setTimeout(() => {
        if (!this.isVisible) {
          this.element.style.display = 'none';
        }
      }, 400);
    }

    addMessage(content, isUser = false, images = []) {
      const messagesContainer = this.element.querySelector('.ai-messages');
      const messageDiv = document.createElement('div');
      messageDiv.className = `ai-message ${isUser ? 'user' : 'assistant'}`;
      
      // Apply light blue blurred background for user messages
      if (isUser) {
        Object.assign(messageDiv.style, {
          background: 'rgba(0, 122, 255, 0.15)',
          backdropFilter: 'blur(20px) saturate(150%)',
          color: 'rgba(255, 255, 255, 0.95)',
          border: '0.5px solid rgba(0, 122, 255, 0.2)',
          boxShadow: '0 2px 12px rgba(0, 122, 255, 0.15)'
        });
      }
      
      if (content) {
        const textSpan = document.createElement('span');
        textSpan.textContent = content;
        messageDiv.appendChild(textSpan);
      }
      // Append any image thumbnails
      if (images && images.length) {
        const imgWrapper = document.createElement('div');
        imgWrapper.style.marginTop = '8px';
        imgWrapper.style.display = 'flex';
        imgWrapper.style.gap = '8px';
        imgWrapper.innerHTML = images.map(img => `
          <img src="${img.data}" style="max-width: 120px; max-height: 120px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2);" />
        `).join('');
        messageDiv.appendChild(imgWrapper);
      }
      
      messagesContainer.appendChild(messageDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      this.messages.push({ content, images, isUser, timestamp: Date.now() });
      return messageDiv;
    }

    async sendMessage() {
      const imagesToSend = this.currentImages.slice();
  const hasImages = imagesToSend.length > 0;
      const input = this.element.querySelector('.ai-input');
      const sendBtn = this.element.querySelector('.ai-send');
      const message = input.value.trim();
      
      if ((!message && !hasImages) || this.currentMessage) return;
      
      // Create user message content
      let userMessageContent = message;
      if (hasImages) {
        // Add image preview thumbnails to user message (no placeholder text)
        const userMessageDiv = this.addMessage(message || '', true, imagesToSend);

      } else {
        // Add text-only user message
        this.addMessage(message, true);
      }
      
      input.value = '';
      sendBtn.disabled = true;
      
      // Visually clear preview thumbnails immediately
      const previewContainer = this.element.querySelector('.ai-image-preview');
      if (previewContainer) {
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'none';
      }
      // Reset currentImages for next message (we stored a copy in imagesToSend)
      this.currentImages = [];
      
      // Start streaming response
      this.currentMessage = this.addMessage('', false);
      this.currentMessage.classList.add('streaming');
      
      try {
        await this.streamResponse(message, imagesToSend);
      } catch (error) {
        console.error('Error during streaming:', error);
        if (this.currentMessage) {
          this.currentMessage.textContent = 'Error: Failed to get response';
          this.currentMessage.classList.remove('streaming');
        }
      } finally {
        // Update the messages array with the final streamed content
        const finalContent = this.currentMessage?.textContent || '';
        const lastMessage = this.messages[this.messages.length - 1];
        if (lastMessage && !lastMessage.isUser) {
          lastMessage.content = finalContent;
        }
        
        this.currentMessage = null;
        sendBtn.disabled = false;
        
        // Capture imagesToSend before clearing, reset currentImages to allow new batch
        const capturedImages = imagesToSend;
        this.currentImages = [];
        this.clearImagePreview();
      }
    }

    async streamResponse(prompt, images = []) {
  console.log('streamResponse called with images:', images.length);
      // Prepare the user message content
      let userContent;
      
      if (images && images.length) {
        // For vision models, send image and text together
        userContent = [
          {
            "type": "text",
            "text": prompt || "What do you see in this image?"
          },
          // Append all images
        ...images.map(img => ({
          type: "image_url",
          image_url: { url: img.data }
        }))
        ];
      } else {
        // Text-only message
        userContent = prompt;
      }
      
      const response = await fetch('http://localhost:8000/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "unused-model-name",
          messages: [
            {"role": "system", "content": "You are a helpful AI assistant."},
            {"role": "user", "content": userContent}
          ],
          max_tokens: 1024,
          temperature: 0.7,
          top_p: 0.95,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            
            try {
              const parsed = JSON.parse(data);
              // Handle OpenAI-compatible streaming format
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                this.currentMessage.textContent += content;
                
                // Smart auto-scroll: only scroll if user is already at the bottom
                const messagesContainer = this.element.querySelector('.ai-messages');
                const isAtBottom = messagesContainer.scrollTop >= messagesContainer.scrollHeight - messagesContainer.clientHeight - 50;
                if (isAtBottom) {
                  messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
              }
            } catch (e) {
              // Skip malformed JSON
              console.warn('Malformed JSON:', data);
            }
          }
        }
      }
    }
    

    destroy() {
      if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    }
  }

  


// Overlay class to manage individual overlays
class StickyOverlay {
  // Capture screenshot of overlay region using chrome.tabs.captureVisibleTab
    captureRegionScreenshot() {
      console.log('🔍 captureRegionScreenshot called');
      if (this.regionScreenshot) {
        console.log('🔍 Screenshot already exists, skipping capture');
        return;
      }
      const rect = this.element.getBoundingClientRect();
      console.log('🔍 Overlay rect:', rect);
      const prevVis = this.element.style.visibility;
      this.element.style.visibility = 'hidden';

      chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' }, (resp) => {
        console.log('🔍 Chrome capture response:', resp ? 'success' : 'failed');
        const dataUrl = resp && resp.dataUrl;
        if (!dataUrl) {
          console.error('🔍 captureVisibleTab failed');
          this.element.style.visibility = prevVis;
          return;
        }

        const img = new Image();
        img.onload = () => {
          console.log('🔍 Image loaded, creating canvas crop');
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(rect.width);
          canvas.height = Math.ceil(rect.height);
          const ctx = canvas.getContext('2d');
          // captureVisibleTab is viewport-only, so offsets are viewport-relative
          const sx = rect.left;
          const sy = rect.top;
          ctx.drawImage(img, -sx, -sy);
          this.regionScreenshot = canvas.toDataURL('image/png');
          console.log('🔍 Overlay screenshot captured, length:', this.regionScreenshot.length);
          console.log('🔍 Screenshot data preview:', this.regionScreenshot.substring(0, 100) + '...');
          
          // Immediately trigger preload if chat panel exists
          if (this.chatPanel && this.chatPanel.preloadOverlayScreenshot) {
            console.log('🔍 Chat panel exists, triggering preload immediately');
            this.chatPanel.preloadOverlayScreenshot();
          } else {
            console.log('🔍 No chat panel exists yet, screenshot will be loaded when panel opens');
          }
          this.element.style.visibility = prevVis;
        };
        img.onerror = (e) => {
          console.error('🔍 Image load failed', e);
          this.element.style.visibility = prevVis;
        };
        img.src = dataUrl;
      });
    }
      
    constructor(selRect) {
      this.id = overlayIdCounter++;
      this.element = document.createElement("div");
      this.element.className = "sticky-overlay";
      this.element.dataset.overlayId = this.id;
      // Empty overlay - no content needed
      this.chatPanel = null;
      
      // Create resize handles
    this.addResizeHandles();
    // Create overlay menu (initially hidden)
      this.overlayMenu = this.createOverlayMenu();
      
      // Touch-hold and click handlers
      let holdTimer = null;
      let isHolding = false;
      
      // Mouse/touch events for hold gesture
      this.element.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left click
        e.preventDefault();
        isHolding = false;
        
        holdTimer = setTimeout(() => {
          isHolding = true;
          this.showOverlayMenu(e.clientX, e.clientY);
        }, 750); // 750ms hold time
      });
      
      this.element.addEventListener('mouseup', (e) => {
        // Ignore mouseup coming from resize handles
        if (e.target.classList && e.target.classList.contains('resize-handle')) return;
        // Skip if resizing or just finished resizing
        if (this.isResizing || this.justResized) return;
        
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        
        // If not holding, check if menu is visible
        if (!isHolding) {
          if (this.overlayMenu && this.overlayMenu.classList.contains('visible')) {
            // If menu is visible, hide it
            this.hideOverlayMenu();
          } else {
            // If menu is not visible, spawn LLM
            this.toggleChat();
          }
        }
        
        isHolding = false;
      });
      
      this.element.addEventListener('mouseleave', () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        isHolding = false;
      });
      
      // Touch events for mobile
      this.element.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isHolding = false;
        const touch = e.touches[0];
        
        holdTimer = setTimeout(() => {
          isHolding = true;
          this.showOverlayMenu(touch.clientX, touch.clientY);
        }, 500);
      });
      
      this.element.addEventListener('touchend', (e) => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        
        if (!isHolding) {
          if (this.overlayMenu && this.overlayMenu.classList.contains('visible')) {
            // If menu is visible, hide it
            this.hideOverlayMenu();
          } else {
            // If menu is not visible, spawn LLM
            this.toggleChat();
          }
        }
        
        isHolding = false;
      });
      
      // Enable pointer events for clicking
      this.element.style.pointerEvents = 'auto';
      
      document.body.appendChild(this.element);
      
      // Set up dynamic color adaptation
      this.setupDynamicColorAdaptation();

      // Detect if we're in a PDF context early so we can condition logic before anchor selection
      const isPDF = this.detectPDFContext();

      // Find anchor element with PDF support
      const centerX = selRect.left + selRect.width / 2;
      const centerY = selRect.top + selRect.height / 2;
      // Attempt to find a usable anchor element at the selection center
      this.anchorEl = document.elementFromPoint(centerX, centerY);

      // Chrome PDF viewer special handling - it's a plugin, not regular DOM
      if (isPDF) {
        console.log('🔍 Chrome PDF detected - using document-relative positioning');
        
        // For Chrome's PDF viewer, we can't anchor to DOM elements inside the plugin
        // Instead, we use absolute positioning relative to the document and track scroll
        this.anchorEl = document.documentElement; // Use document as anchor
        this.useViewportAnchoring = false; // Use DOM anchoring, but to the document
        
        // Store the initial scroll position to calculate relative positioning
        this.initialScrollX = window.scrollX || document.documentElement.scrollLeft;
        this.initialScrollY = window.scrollY || document.documentElement.scrollTop;
        
        // Store absolute position relative to document
        this.documentRelativePos = {
          x: selRect.left + this.initialScrollX,
          y: selRect.top + this.initialScrollY,
          w: selRect.width,
          h: selRect.height
        };
        
        console.log('🔍 PDF Document Anchoring:', {
          initialScroll: { x: this.initialScrollX, y: this.initialScrollY },
          documentPos: this.documentRelativePos,
          viewportPos: { x: selRect.left, y: selRect.top, w: selRect.width, h: selRect.height }
        });
      }
      
      // At this point isPDF is already defined above; now evaluate anchor usability
      console.log('🔍 Final Anchor Decision:', {
        anchorEl: this.anchorEl,
        anchorTag: this.anchorEl?.tagName,
        anchorClass: this.anchorEl?.className,
        isUnusable: this.anchorEl ? this.isUnusableAnchor(this.anchorEl) : 'null',
        willUseViewportAnchoring: !this.anchorEl || this.isUnusableAnchor(this.anchorEl)
      });
      
      // Only fallback to viewport anchoring if we truly lack a usable anchor element.
      // For PDFs, if the element under the selection is valid, treat it like a normal DOM anchor
      // so that the overlay follows the PDF content while scrolling.
      if (!this.anchorEl || this.isUnusableAnchor(this.anchorEl)) {
        console.log("Using viewport-based anchoring for PDF or unusable anchor");
        // Use viewport-based anchoring for PDFs and fallback cases
        this.useViewportAnchoring = true;
        this.anchorEl = document.body; // Use body as fallback anchor
        
        // For PDFs, use simple viewport-relative positioning (no scroll tracking)
        this.viewportPos = {
          x: selRect.left,
          y: selRect.top,
          w: selRect.width,
          h: selRect.height
        };
        
        console.log('🔍 PDF Mode: Using fixed viewport positioning at:', this.viewportPos);
      } else {
        console.log("Using DOM element anchoring");
        this.useViewportAnchoring = false;
        
        // Compute normalized coordinates relative to anchor element
        const anchorRect = this.anchorEl.getBoundingClientRect();
        this.rel = {
          x: (selRect.left - anchorRect.left) / anchorRect.width,
          y: (selRect.top - anchorRect.top) / anchorRect.height,
          w: selRect.width / anchorRect.width,
          h: selRect.height / anchorRect.height
        };
      }
      
      // Screenshot data placeholder
  this.regionScreenshot = null;

  // Store original spawn position for swoosh animation
      this.originalSpawnPosition = {
        left: selRect.left,
        top: selRect.top,
        width: selRect.width,
        height: selRect.height
      };

      // Add to tracking array
      overlays.push(this);
      
      // Start animation loop if not running
      if (!isAnimationLoopRunning) {
        startAnimationLoop();
      }

      // Initial position update
      this.updatePosition();
      // Capture screenshot for LLM preview
      this.captureRegionScreenshot();
    }

    createOverlayMenu() {
      const menu = document.createElement('div');
      menu.className = 'overlay-menu';
      
      // Close option
      const closeOption = document.createElement('button');
      closeOption.className = 'menu-option close';
      closeOption.textContent = 'Close';
      closeOption.addEventListener('click', (e) => {
        console.log('Close button clicked!');
        e.stopPropagation();
        e.preventDefault();
        this.hideOverlayMenu();
        this.remove();
      });
      
      // Also add mousedown listeners as backup
      closeOption.addEventListener('mousedown', (e) => {
        console.log('Close mousedown!');
        e.stopPropagation();
        e.preventDefault();
        this.hideOverlayMenu();
        this.remove();
      });
      
      menu.appendChild(closeOption);
      
      document.body.appendChild(menu);
      return menu;
    }
    
    showOverlayMenu(x, y) {
      if (!this.overlayMenu) return;
      
      // Position the menu directly above the overlay
      const overlayRect = this.element.getBoundingClientRect();
      const menuWidth = 120;
      const menuHeight = 44; // 1 option * 44px
      
      // Center horizontally above the overlay
      let left = overlayRect.left + (overlayRect.width / 2) - (menuWidth / 2);
      let top = overlayRect.top - menuHeight - 8; // 8px gap above overlay
      
      // Keep within viewport (fallback positioning)
      if (left < 8) left = 8;
      if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
      if (top < 8) top = overlayRect.bottom + 8; // Show below if no space above
      if (top + menuHeight > window.innerHeight - 8) top = window.innerHeight - menuHeight - 8;
      
      this.overlayMenu.style.left = left + 'px';
      this.overlayMenu.style.top = top + 'px';
      
      // Show the menu
      this.overlayMenu.classList.add('visible');
      
      // Hide menu when clicking outside overlay or menu
      const hideOnOutsideClick = (e) => {
        if (!this.overlayMenu.contains(e.target) && !this.element.contains(e.target)) {
          this.hideOverlayMenu();
          document.removeEventListener('click', hideOnOutsideClick);
        }
      };
      
      // Add the outside click listener after a short delay
      setTimeout(() => {
        document.addEventListener('click', hideOnOutsideClick);
      }, 100);
      
      // Auto-hide menu after 10 seconds as fallback
      setTimeout(() => {
        if (this.overlayMenu && this.overlayMenu.classList.contains('visible')) {
          this.hideOverlayMenu();
          document.removeEventListener('click', hideOnOutsideClick);
        }
      }, 10000);
    }
    
    hideOverlayMenu() {
      if (this.overlayMenu) {
        this.overlayMenu.classList.remove('visible');
        // Re-enable overlay pointer events
        this.element.style.pointerEvents = 'auto';
      }
    }

    toggleChat() {
      console.log('toggleChat called!');
      console.log('Current chatPanel:', this.chatPanel);
      
      if (this.chatPanel && this.chatPanel.isVisible) {
        console.log('Hiding existing chat panel');
        this.chatPanel.hide();
        this.swooshBack();
      } else {
        this.swooshToSpawn();
      }
    }
    
    swooshToSpawn() {
      console.log('Starting iPhone-style expansion animation');
      
      // Use original spawn position instead of current overlay position
      const spawnRect = this.originalSpawnPosition;
      const panelWidth = 280;
      const panelHeight = 400;
      
      // Position panel centered on original spawn location, but keep within viewport
      const spawnCenterX = spawnRect.left + spawnRect.width / 2;
      const spawnCenterY = spawnRect.top + spawnRect.height / 2;
      
      let targetLeft = spawnCenterX - panelWidth / 2;
      let targetTop = spawnCenterY - panelHeight / 2;
      
      // Keep within viewport bounds
      if (targetLeft < 20) targetLeft = 20;
      if (targetLeft + panelWidth > window.innerWidth - 20) targetLeft = window.innerWidth - panelWidth - 20;
      if (targetTop < 20) targetTop = 20;
      if (targetTop + panelHeight > window.innerHeight - 20) targetTop = window.innerHeight - panelHeight - 20;
      
      // Store positions for reverse animation (use original spawn position)
      this.originalPosition = {
        left: spawnRect.left,
        top: spawnRect.top,
        width: spawnRect.width,
        height: spawnRect.height
      };
      
      this.targetPosition = {
        left: targetLeft,
        top: targetTop,
        width: panelWidth,
        height: panelHeight
      };
      
      // Create the expanding element that will become the LLM panel
      const expandingPanel = document.createElement('div');
      expandingPanel.style.position = 'fixed';
      expandingPanel.style.left = spawnRect.left + 'px';
      expandingPanel.style.top = spawnRect.top + 'px';
      expandingPanel.style.width = spawnRect.width + 'px';
      expandingPanel.style.height = spawnRect.height + 'px';
      expandingPanel.style.borderRadius = '12px';
      expandingPanel.style.background = 'rgba(28, 28, 30, 0.45)';
      expandingPanel.style.backdropFilter = 'blur(40px) saturate(180%)';
      expandingPanel.style.border = '0.5px solid rgba(255, 255, 255, 0.1)';
      expandingPanel.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.4), 0 8px 25px rgba(0, 0, 0, 0.2), 0 0 0 0.5px rgba(255, 255, 255, 0.1) inset';
      expandingPanel.style.zIndex = '2147483647';
      expandingPanel.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      expandingPanel.style.transformOrigin = 'center center';
      document.body.appendChild(expandingPanel);
      
      // Hide original overlay immediately
      this.element.style.opacity = '0';
      this.element.style.pointerEvents = 'none';
      
      // Start expansion animation
      requestAnimationFrame(() => {
        expandingPanel.style.left = targetLeft + 'px';
        expandingPanel.style.top = targetTop + 'px';
        expandingPanel.style.width = panelWidth + 'px';
        expandingPanel.style.height = panelHeight + 'px';
        expandingPanel.style.borderRadius = '20px';
      });
      
      // After expansion completes, inject LLM UI
      setTimeout(() => {
        // Add LLM panel content
        expandingPanel.innerHTML = `
          <div class="ai-header">
             <button class="ai-pin" aria-label="Pin">pin</button>
             <button class="ai-close" aria-label="Close chat">✕</button>
           </div>
          <div class="ai-messages"></div>
          <div class="ai-input-area">
            <input type="text" class="ai-input" placeholder="Ask me anything...">
            <button class="ai-send" aria-label="Send"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 18V6M8 10l4-4 4 4" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></button>
          </div>
        `;
        
        // Style as chat panel with complete CSS isolation
        expandingPanel.style.display = 'flex';
        expandingPanel.style.flexDirection = 'column';
        expandingPanel.style.fontFamily = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';
        expandingPanel.style.overflow = 'hidden';
        expandingPanel.style.pointerEvents = 'auto';
        
        // Force exact dimensions - override any website CSS inheritance
        expandingPanel.style.setProperty('width', '280px', 'important');
        expandingPanel.style.setProperty('height', '400px', 'important');
        expandingPanel.style.setProperty('min-width', '280px', 'important');
        expandingPanel.style.setProperty('min-height', '400px', 'important');
        expandingPanel.style.setProperty('max-width', '280px', 'important');
        expandingPanel.style.setProperty('max-height', '400px', 'important');
        expandingPanel.style.setProperty('box-sizing', 'border-box', 'important');
        expandingPanel.style.setProperty('transform', 'none', 'important');
        expandingPanel.style.setProperty('zoom', '1', 'important');
        expandingPanel.style.setProperty('font-size', '14px', 'important');
        
        // Store reference for closing
        this.expandedPanel = expandingPanel;
        
        // Initialize pin state - expanded panels start pinned (fixed position)
        this.expandedPanelPinned = true;
        
        // Initialize chat functionality
        if (!this.chatPanel) {
          this.chatPanel = new AppleIntelligenceChatPanel(this);
        }
        
        // Always update the element reference to the new expanding panel
        this.chatPanel.element = expandingPanel;
        this.chatPanel.isVisible = true;
        
        // NOW inject screenshot thumbnail on the correct element
        this.chatPanel.injectScreenshotThumbnail();
        
        // Restore previous chat messages if they exist
        if (this.chatPanel.messages && this.chatPanel.messages.length > 0) {
          const messagesContainer = expandingPanel.querySelector('.ai-messages');
          this.chatPanel.messages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `ai-message ${msg.isUser ? 'user' : 'assistant'}`;
            if (msg.content) {
        const textSpan = document.createElement('span');
        textSpan.textContent = msg.content;
        messageDiv.appendChild(textSpan);
      }
      if (msg.images && msg.images.length) {
        const imgWrapper = document.createElement('div');
        imgWrapper.style.marginTop = '8px';
        imgWrapper.style.display = 'flex';
        imgWrapper.style.gap = '8px';
        imgWrapper.innerHTML = msg.images.map(img => `
          <img src="${img.data}" style="max-width: 120px; max-height: 120px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2);" />
        `).join('');
        messageDiv.appendChild(imgWrapper);
      }
            messagesContainer.appendChild(messageDiv);
          });
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        // Restore currently streaming message if it exists
        if (this.chatPanel.currentMessage && this.chatPanel.currentMessage.textContent) {
          const messagesContainer = expandingPanel.querySelector('.ai-messages');
          const streamingMessageDiv = document.createElement('div');
          streamingMessageDiv.className = 'ai-message assistant streaming';
          streamingMessageDiv.textContent = this.chatPanel.currentMessage.textContent;
          messagesContainer.appendChild(streamingMessageDiv);
          
          // Update the reference to the new DOM element
          this.chatPanel.currentMessage = streamingMessageDiv;
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        // Set up event listeners
        this.setupExpandedPanelListeners();
        
        // Keep panel in fixed positioning to maintain consistent coordinate space and eliminate drift.
        // (Removed conversion to absolute positioning that previously caused jumpiness during close animation)
        
        // Focus input
        setTimeout(() => {
          const input = expandingPanel.querySelector('.ai-input');
          if (input) input.focus();
        }, 100);
        
        console.log('iPhone-style expansion complete - panel coordinates initialized');
      }, 400);
    }
    
    swooshBack() {
      if (!this.originalPosition || !this.expandedPanel) return;
      
      console.log('Starting true iPhone app closing animation');
      
      // Disable pointer events immediately
      this.expandedPanel.style.pointerEvents = 'none';
      
      // iPhone closing: instant content fade + simultaneous panel shrink
      // Don't clear innerHTML - preserve chat functionality for reuse
      
      // Set up the EXACT iPhone spring animation
      // This is the actual curve iOS uses for app closing
      this.expandedPanel.style.transition = 'all 0.4s cubic-bezier(0.36, 0.66, 0.04, 1)';
      this.expandedPanel.style.transformOrigin = 'center center';
      
      // Start the closing animation immediately
      requestAnimationFrame(() => {
        // Calculate target coordinates based on current positioning mode
        let targetLeft = this.originalPosition.left;
        let targetTop = this.originalPosition.top;
        
        // If panel is in absolute positioning (unpinned), convert viewport coordinates to document coordinates
        if (this.expandedPanel.style.position === 'absolute') {
          targetLeft = this.originalPosition.left + window.scrollX;
          targetTop = this.originalPosition.top + window.scrollY;
        }
        
        // Shrink to overlay position and size
        this.expandedPanel.style.left = targetLeft + 'px';
        this.expandedPanel.style.top = targetTop + 'px';
        this.expandedPanel.style.width = this.originalPosition.width + 'px';
        this.expandedPanel.style.height = this.originalPosition.height + 'px';
        
        // iPhone-style visual transformation
        this.expandedPanel.style.transform = 'scale(0.01)'; // Shrink to almost nothing
        this.expandedPanel.style.opacity = '0';
        this.expandedPanel.style.borderRadius = '50%'; // Becomes circular as it shrinks
        
        // Restore overlay appearance
        if (this.element.dataset.theme === 'dark') {
          this.expandedPanel.style.background = 'rgba(0, 0, 0, 0.35)';
        } else {
          this.expandedPanel.style.background = 'rgba(255, 255, 255, 0.35)';
        }
        this.expandedPanel.style.backdropFilter = 'blur(20px)';
        this.expandedPanel.style.border = '1px solid rgba(255, 255, 255, 0.25)';
        this.expandedPanel.style.boxShadow = 'none';
      });
      
      // Cleanup after animation completes
      setTimeout(() => {
        // Remove the shrunk panel
        if (this.expandedPanel && this.expandedPanel.parentNode) {
          this.expandedPanel.parentNode.removeChild(this.expandedPanel);
        }
        this.expandedPanel = null;
        
        // Restore original overlay instantly (no fade needed)
        this.element.style.opacity = '1';
        this.element.style.visibility = 'visible';
        this.element.style.pointerEvents = 'auto';
        this.element.style.transition = '';
        
        // Re-attach to anchor flow
        this.updatePosition();
        
        console.log('True iPhone closing animation complete');
      }, 400); // Match transition duration
    }
    
    setupExpandedPanelListeners() {
      if (!this.expandedPanel) return;
      
      const closeBtn = this.expandedPanel.querySelector('.ai-close');
      const pinBtn = this.expandedPanel.querySelector('.ai-pin');
      const input = this.expandedPanel.querySelector('.ai-input');
      const sendBtn = this.expandedPanel.querySelector('.ai-send');
      
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          this.chatPanel.hide();
          this.swooshBack();
        });
      }
      
      if (pinBtn) {
        pinBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // prevent bubbling that closes overlay
          this.toggleExpandedPanelPin();
        });
      }
      
      if (input && sendBtn) {
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendChatMessage();
          }
        });
        
        sendBtn.addEventListener('click', () => this.sendChatMessage());
      }
      
      // Add drag functionality
      const header = this.expandedPanel.querySelector('.ai-header');
      if (header) {
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        const handleMouseMove = (e) => {
          if (!isDragging) return;
          
          requestAnimationFrame(() => {
            // Calculate new position based on current positioning mode
            let newX, newY;
            
            if (this.expandedPanel.style.position === 'fixed') {
              // Fixed positioning: use viewport coordinates directly
              newX = e.clientX - dragOffset.x;
              newY = e.clientY - dragOffset.y;
            } else {
              // Absolute positioning: use document coordinates
              newX = e.clientX - dragOffset.x + window.scrollX;
              newY = e.clientY - dragOffset.y + window.scrollY;
            }
            
            // Keep panel within bounds
            const maxX = (this.expandedPanel.style.position === 'fixed' ? window.innerWidth : document.documentElement.scrollWidth) - 280;
            const maxY = (this.expandedPanel.style.position === 'fixed' ? window.innerHeight : document.documentElement.scrollHeight) - 400;
            
            const clampedX = Math.max(0, Math.min(newX, maxX));
            const clampedY = Math.max(0, Math.min(newY, maxY));
            
            this.expandedPanel.style.left = clampedX + 'px';
            this.expandedPanel.style.top = clampedY + 'px';
          });
        };
        
        const handleMouseUp = () => {
          if (isDragging) {
            isDragging = false;
            header.style.cursor = 'grab';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
          }
        };
        
        header.addEventListener('mousedown', (e) => {
          // Don't start drag if clicking the close button
          if (e.target.closest('.ai-close')) return;
          
          isDragging = true;
          header.style.cursor = 'grabbing';
          
          // Calculate drag offset in the correct coordinate system
          const panelRect = this.expandedPanel.getBoundingClientRect();
          
          if (this.expandedPanel.style.position === 'fixed') {
            // Fixed positioning: use viewport coordinates
            dragOffset.x = e.clientX - panelRect.left;
            dragOffset.y = e.clientY - panelRect.top;
          } else {
            // Absolute positioning: convert to document coordinates
            const docX = panelRect.left + window.scrollX;
            const docY = panelRect.top + window.scrollY;
            dragOffset.x = e.clientX - docX + window.scrollX;
            dragOffset.y = e.clientY - docY + window.scrollY;
          }
          
          // Add listeners only when dragging starts
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
          
          e.preventDefault();
        });
      }
    }
    

    
    toggleExpandedPanelPin() {
        if (!this.expandedPanel) return;
        
        const pinBtn = this.expandedPanel.querySelector('.ai-pin');
          
        // CRITICAL: Aggressively disable ALL transitions during pin operation
        // CSS has 'transition: all' which overrides inline styles, so we need !important
        this.expandedPanel.style.setProperty('transition', 'none', 'important');
        this.expandedPanel.style.setProperty('transform', 'none', 'important');
        
        // CRITICAL: Get the EXACT current position from the element's style properties
        // This preserves the user's dragged position, not the computed/visual position
        const currentLeft = parseInt(this.expandedPanel.style.left) || 0;
        const currentTop = parseInt(this.expandedPanel.style.top) || 0;
        
        if (this.expandedPanelPinned) {
          // Unpin: Switch to absolute positioning (moves with page content)
          this.expandedPanel.style.position = 'absolute';
          
          // Convert fixed coordinates to absolute coordinates
          // Add scroll offset to maintain exact visual position
          this.expandedPanel.style.left = (currentLeft + window.scrollX) + 'px';
          this.expandedPanel.style.top = (currentTop + window.scrollY) + 'px';
          
          // Update visual state
          pinBtn.textContent = 'unpin';
          //pinBtn.style.background = 'rgba(120, 120, 128, 0.12)';
          //pinBtn.style.color = 'rgba(60, 60, 67, 0.6)';
          
          this.expandedPanelPinned = false;
          console.log('Expanded panel pinned - will move with page content at:', currentLeft, currentTop);
      } else {
        // Pin: Switch to fixed positioning (stays on screen)
        this.expandedPanel.style.position = 'fixed';
        
        // Convert absolute coordinates to fixed coordinates
        // Subtract scroll offset to maintain exact visual position
        this.expandedPanel.style.left = (currentLeft - window.scrollX) + 'px';
        this.expandedPanel.style.top = (currentTop - window.scrollY) + 'px';
        
        // Update visual state - pinned appearance
        pinBtn.textContent = 'pin';
        //pinBtn.style.background = 'rgba(0, 122, 255, 0.15)';
        //pinBtn.style.color = '#007AFF';
        
        this.expandedPanelPinned = true;
        console.log('Expanded panel unpinned - will stay fixed on screen at:', currentLeft - window.scrollX, currentTop - window.scrollY);
      }

    }

    sendChatMessage() {
      if (this.chatPanel && this.chatPanel.sendMessage) {
        this.chatPanel.sendMessage();
      }
    }

    setupDynamicColorAdaptation() {
      // Initialize adaptation state
      this.lastBrightness = null;
      this.adaptationThreshold = 0.15; // Larger threshold to ignore minor variations
      
      // Start continuous adaptation
      this.startColorAdaptation();
      
      // Store original update function but don't override it
      // Color adaptation will be handled separately to prevent jitter
      this.originalUpdatePosition = this.updatePosition;
    };
    
    startColorAdaptation() {
      // Track current theme status for hysteresis
      this.currentIsDark = null; // null until first sample
      this.mismatchCount = 0; // counts consecutive opposite detections
      // Update colors immediately
      this.updateColors();
      
      // Set up periodic updates (reduced frequency to prevent jitter)
      this.colorAdaptationInterval = setInterval(() => {
        this.updateColors();
      }, 2000);
    }
    
    updateColors() {
      if (!this.element || !this.element.parentNode) return;

      // Gather sample colors from points beneath the overlay
      const rect = this.element.getBoundingClientRect();
      const samples = [];

      const samplePoints = [
        { x: rect.left + rect.width * 0.2, y: rect.top + rect.height * 0.2 },
        { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 },
        { x: rect.left + rect.width * 0.8, y: rect.top + rect.height * 0.8 },
        { x: rect.left + rect.width * 0.2, y: rect.top + rect.height * 0.8 },
        { x: rect.left + rect.width * 0.8, y: rect.top + rect.height * 0.2 }
      ];

      // Helper to walk up DOM until a non-transparent background is found
      const getEffectiveBG = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
          const style = window.getComputedStyle(node);
          const col = style.backgroundColor;
          if (col && !col.startsWith('rgba(0, 0, 0, 0') && col !== 'transparent') {
            return col;
          }
          node = node.parentElement;
        }
        return null;
      };

      // Temporarily make the overlay ignore pointer events so elementFromPoint skips it
      const prevPointerEvents = this.element.style.pointerEvents;
      this.element.style.pointerEvents = 'none';

      samplePoints.forEach(pt => {
        const elBelow = document.elementFromPoint(pt.x, pt.y);
        if (elBelow) {
          const col = getEffectiveBG(elBelow);
          if (col && !col.startsWith('rgba(0, 0, 0, 0') && col !== 'transparent') {
            samples.push(col);
          }
        }
      });

      // Restore pointer events
      this.element.style.pointerEvents = prevPointerEvents;

      if (samples.length === 0) return;

      const brightness = this.calculatePredominantBrightness(samples);
      const isDarkBackground = brightness < 0.5;

      if (this.currentIsDark === null) {
        this.currentIsDark = isDarkBackground;
        this.lastBrightness = brightness;
        this.applyAdaptiveColors(brightness);
        return;
      }

      // Hysteresis logic
      if (isDarkBackground !== this.currentIsDark) {
        this.mismatchCount += 1;
      } else {
        this.mismatchCount = 0;
      }

      if (
        this.mismatchCount >= 5 &&
        Math.abs(brightness - this.lastBrightness) > this.adaptationThreshold
      ) {
        this.currentIsDark = isDarkBackground;
        this.lastBrightness = brightness;
        this.mismatchCount = 0;
        this.applyAdaptiveColors(brightness);
        console.log(
          `Dynamic color update: brightness=${brightness.toFixed(3)}, theme=${isDarkBackground ? 'light' : 'dark'}`
        );
      }
    }
    
    calculatePredominantBrightness(samples) {
      const brightnesses = samples.map(color => this.calculateBrightness(color)).filter(b => b !== null);
      
      if (brightnesses.length === 0) return 0.5; // Default to middle
      
      // Return average brightness
      return brightnesses.reduce((sum, b) => sum + b, 0) / brightnesses.length;
    }
    
    applyAdaptiveColors(brightness) {
      const isDarkBackground = brightness < 0.5;
      
      if (isDarkBackground) {
        // Light overlay on dark background (opposite for contrast)
        this.element.style.background = 'rgba(255, 255, 255, 0.35)';
        this.element.style.borderColor = 'rgba(255, 255, 255, 0.25)';
        this.element.dataset.theme = 'light';
      } else {
        // Dark overlay on light background (opposite for contrast)
        this.element.style.background = 'rgba(0, 0, 0, 0.25)';
        this.element.style.borderColor = 'rgba(255, 255, 255, 0.25)';
        this.element.dataset.theme = 'dark';
      }
    }
    
    calculateBrightness(colorStr) {
      // Parse RGB values
      const parseRGB = (color) => {
        if (color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
          return null;
        }
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
      };
      
      const rgb = parseRGB(colorStr);
      if (!rgb) return null;
      
      // Calculate relative luminance
      const [r, g, b] = rgb.map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    detectPDFContext() {
      // Check if we're in a PDF context
      const url = window.location.href;
      const isPDFUrl = url.includes('.pdf') || url.includes('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai');
      
      // Check for PDF-related elements
      const hasPDFEmbed = document.querySelector('embed[type="application/pdf"]') !== null;
      const hasPDFObject = document.querySelector('object[type="application/pdf"]') !== null;
      const hasPDFIframe = document.querySelector('iframe[src*=".pdf"]') !== null;
      
      // Check document content type
      const isPDFContentType = document.contentType === 'application/pdf';
      
      // Additional Chrome PDF viewer detection
      const isChromeExtension = url.startsWith('chrome-extension://');
      const hasViewerContainer = document.querySelector('#viewer') !== null;
      const hasPluginElement = document.querySelector('embed[type="application/pdf"], object[data*=".pdf"]') !== null;
      
      // Chrome's PDF viewer specific detection
      const isChromePDFViewer = url.startsWith('chrome-extension://') && url.includes('mhjfbmdgcfjbbpaeojofohoefgiehjai');
      
      const result = isPDFUrl || hasPDFEmbed || hasPDFObject || hasPDFIframe || isPDFContentType || (isChromeExtension && hasViewerContainer) || hasPluginElement || isChromePDFViewer;
      
      console.log('🔍 PDF Detection:', {
        url,
        isPDFUrl,
        hasPDFEmbed,
        hasPDFObject,
        hasPDFIframe,
        isPDFContentType,
        isChromeExtension,
        hasViewerContainer,
        hasPluginElement,
        isChromePDFViewer,
        finalResult: result
      });
      
      return result;
    }
    
    isUnusableAnchor(element) {
      if (!element) return true;
      
      const tagName = element.tagName.toLowerCase();
      
      // PDF page elements are ALWAYS usable - they're exactly what we want to anchor to
      if (element.classList && element.classList.contains('page')) {
        console.log('🔍 PDF page element found - ALWAYS usable:', element);
        return false;
      }
      
      // Check if element is a PDF plugin or embed
      if (['embed', 'object', 'iframe'].includes(tagName)) {
        const type = element.type || '';
        const src = element.src || '';
        if (type.includes('pdf') || src.includes('.pdf')) {
          return true;
        }
      }
      
      // Check if element has no meaningful dimensions
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return true;
      }
      
      // Check if element is the html or body (too generic)
      if (['html', 'body'].includes(tagName)) {
        return true;
      }
      
      return false;
    }
    
    setupPDFTracking() {
      // Set up PDF-specific tracking mechanisms
      const viewer = document.querySelector('#viewer');
      const pdfContainer = document.querySelector('.textLayer') || document.querySelector('[role="main"]') || viewer;
      
      if (pdfContainer) {
        // Track scroll events on PDF container
        const scrollHandler = () => {
          if (this.useViewportAnchoring) {
            this.updatePosition();
          }
        };
        
        pdfContainer.addEventListener('scroll', scrollHandler, { passive: true });
        
        // Store reference for cleanup
        this.pdfScrollHandler = scrollHandler;
        this.pdfContainer = pdfContainer;
        
        console.log('🔍 PDF tracking set up on container:', pdfContainer.tagName, pdfContainer.className);
      }
      
      // Also set up MutationObserver to detect PDF content changes
      if (viewer) {
        this.pdfObserver = new MutationObserver((mutations) => {
          let shouldUpdate = false;
          mutations.forEach((mutation) => {
            if (mutation.type === 'childList' || mutation.type === 'attributes') {
              shouldUpdate = true;
            }
          });
          
          if (shouldUpdate && this.useViewportAnchoring) {
            this.updatePosition();
          }
        });
        
        this.pdfObserver.observe(viewer, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'transform']
        });
        
        console.log('🔍 PDF MutationObserver set up on viewer');
      }
    }

    updatePosition() {
      if (this.isResizing) return;
      if (!this.anchorEl || !this.element.parentNode) return;
      
      let x, y, w, h;
      
      if (this.useViewportAnchoring) {
        // For PDFs: Use fixed positioning - overlay stays in same viewport location
        // Since CSS is position:fixed, we just use the original viewport coordinates
        x = this.viewportPos.x;
        y = this.viewportPos.y;
        w = this.viewportPos.w;
        h = this.viewportPos.h;
        
        // Debug log occasionally
        if (this.debugCounter === undefined) this.debugCounter = 0;
        if (this.debugCounter % 120 === 0) {
          console.log('🔍 PDF Fixed Position (viewport coords):', {
            target: { x, y, w, h },
            viewportPos: this.viewportPos,
            current: {
              left: this.element.style.left,
              top: this.element.style.top,
              width: this.element.style.width,
              height: this.element.style.height
            },
            cssPosition: window.getComputedStyle(this.element).position
          });
        }
        this.debugCounter++;
      } else if (this.documentRelativePos) {
        // PDF document-relative positioning - calculate position based on current scroll
        const currentScrollX = window.scrollX || document.documentElement.scrollLeft;
        const currentScrollY = window.scrollY || document.documentElement.scrollTop;
        
        // Calculate viewport position based on document position minus current scroll
        x = this.documentRelativePos.x - currentScrollX;
        y = this.documentRelativePos.y - currentScrollY;
        w = this.documentRelativePos.w;
        h = this.documentRelativePos.h;
        
        // Debug log occasionally
        if (this.debugCounter === undefined) this.debugCounter = 0;
        if (this.debugCounter % 60 === 0) {
          console.log('🔍 PDF Document-Relative Position:', {
            documentPos: this.documentRelativePos,
            currentScroll: { x: currentScrollX, y: currentScrollY },
            initialScroll: { x: this.initialScrollX, y: this.initialScrollY },
            calculatedViewport: { x, y, w, h }
          });
        }
        this.debugCounter++;
      } else {
        // Use DOM element anchoring for regular web pages
        const anchorRect = this.anchorEl.getBoundingClientRect();
        x = Math.round(anchorRect.left + this.rel.x * anchorRect.width);
        y = Math.round(anchorRect.top + this.rel.y * anchorRect.height);
        w = Math.round(this.rel.w * anchorRect.width);
        h = Math.round(this.rel.h * anchorRect.height);
      }
      
      // Only update if position actually changed (prevent unnecessary reflows)
      const currentLeft = Math.round(parseFloat(this.element.style.left) || 0);
      const currentTop = Math.round(parseFloat(this.element.style.top) || 0);
      const currentWidth = Math.round(parseFloat(this.element.style.width) || 0);
      const currentHeight = Math.round(parseFloat(this.element.style.height) || 0);
      
      if (currentLeft !== x || currentTop !== y || currentWidth !== w || currentHeight !== h) {
        Object.assign(this.element.style, {
          left: x + "px",
          top: y + "px",
          width: w + "px",
          height: h + "px"
        });
      }
    }

    remove() {
      // Clean up color adaptation interval
      if (this.colorAdaptationInterval) {
        clearInterval(this.colorAdaptationInterval);
        this.colorAdaptationInterval = null;
      }
      
      // Clean up PDF tracking
      if (this.pdfScrollHandler && this.pdfContainer) {
        this.pdfContainer.removeEventListener('scroll', this.pdfScrollHandler);
        this.pdfScrollHandler = null;
        this.pdfContainer = null;
      }
      
      if (this.pdfObserver) {
        this.pdfObserver.disconnect();
        this.pdfObserver = null;
      }
      
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      if (this.chatPanel) {
        this.chatPanel.remove();
      }
      if (this.overlayMenu && this.overlayMenu.parentNode) {
        this.overlayMenu.parentNode.removeChild(this.overlayMenu);
      }
      
      // Remove from tracking array
      const index = overlays.indexOf(this);
      if (index > -1) {
        overlays.splice(index, 1);
      }
      
      // Stop animation loop if no overlays left
      if (overlays.length === 0) {
        isAnimationLoopRunning = false;
      }
    }
  }

  // Animation loop to keep overlays positioned (but not during scrolling)
  let isScrolling = false;
  let scrollTimeout;
  
  function startAnimationLoop() {
    if (isAnimationLoopRunning) return;
    isAnimationLoopRunning = true;
    
    function loop() {
      if (overlays.length === 0) {
        isAnimationLoopRunning = false;
        return;
      }
      
      // Only update via animation loop when NOT scrolling
      if (!isScrolling) {
        overlays.forEach(overlay => overlay.updatePosition());
      }
      requestAnimationFrame(loop);
    }
    
    requestAnimationFrame(loop);
  }

  // Event listeners for all overlays (only need to add once)
  let eventListenersAdded = false;
  function addGlobalEventListeners() {
    if (eventListenersAdded) return;
    eventListenersAdded = true;
    
    window.addEventListener("scroll", () => {
      // Mark as scrolling to disable animation loop updates
      isScrolling = true;
      
      // Clear existing scroll timeout
      if (scrollTimeout) clearTimeout(scrollTimeout);
      
      // Update positions immediately (no requestAnimationFrame delay)
      // Update all overlays during scroll - both DOM-anchored and viewport-anchored
      overlays.forEach(overlay => {
        overlay.updatePosition();
      });
      
      // Resume animation loop after scrolling stops
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 50);
    }, true);
    
    window.addEventListener("resize", () => {
      overlays.forEach(overlay => overlay.updatePosition());
    });
  }

  // ---------- main selection routine ----------
  function startSelection() {
    console.log('startSelection called!');
    if (document.getElementById("sticky-mask")) {
      console.log('Selection already in progress, returning');
      return;
    }

    const mask = document.createElement("div");
    mask.id = "sticky-mask";
    const rectDiv = document.createElement("div");
    rectDiv.id = "sticky-select-rect";
    mask.appendChild(rectDiv);
    document.body.appendChild(mask);

    let startX, startY;
    mask.addEventListener("mousedown", e => {
      startX = e.clientX;
      startY = e.clientY;
    });

    mask.addEventListener("mousemove", e => {
      if (startX === undefined) return;
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      Object.assign(rectDiv.style, {
        left: x + "px",
        top: y + "px",
        width: w + "px",
        height: h + "px"
      });
    });

    mask.addEventListener("mouseup", e => {
      const selRect = rectDiv.getBoundingClientRect();
      document.body.removeChild(mask);
      
      // Create overlay for any size selection (removed minimum size constraint)
      if (selRect.width > 0 && selRect.height > 0) {
        new StickyOverlay(selRect);
        addGlobalEventListeners();
      }
    });
  }

  // Utility function to clear all overlays
  function clearAllOverlays() {
    overlays.slice().forEach(overlay => overlay.remove());
  }

  // expose to bg.js - do this immediately and with error handling
  try {
    window.__startRegionSelection = startSelection;
    window.__clearAllOverlays = clearAllOverlays;
    
    // Verify functions are properly exposed
    console.log('Functions exposed successfully:', {
      startRegionSelection: typeof window.__startRegionSelection,
      clearAllOverlays: typeof window.__clearAllOverlays
    });
    
    // Also expose a test function to verify injection works
    window.__stickyOverlayTest = () => {
      console.log('Sticky overlay extension is working!');
      return true;
    };
    
  } catch (error) {
    console.error('Failed to expose functions:', error);
  }

  // ----- Resize utilities attached to prototype (outside class scope fix) -----
  StickyOverlay.prototype.addResizeHandles = function() {
    if (!this.element) return;
    const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    dirs.forEach(dir => {
      const h = document.createElement('div');
      h.className = `resize-handle handle-${dir}`;
      this.element.appendChild(h);
      h.addEventListener('mousedown', (e) => {
        this.startResize(e, dir);
      });
      // Prevent all mouse events from bubbling to overlay
  
      h.addEventListener('click', (e) => e.stopPropagation());
    });
  };

  StickyOverlay.prototype.startResize = function(e, dir) {
    e.preventDefault();
    e.stopPropagation();
    
    // Set resizing flag IMMEDIATELY to prevent position updates
    this.isResizing = true;
    this.element.classList.add('resizing');
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = this.element.getBoundingClientRect();
    let hasMoved = false;

    const onMove = (ev) => {
      hasMoved = true;
      // isResizing and resizing class already set above
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let newLeft = startRect.left;
      let newTop = startRect.top;
      let newWidth = startRect.width;
      let newHeight = startRect.height;

      if (dir.includes('e')) newWidth = Math.max(50, startRect.width + dx);
      if (dir.includes('s')) newHeight = Math.max(30, startRect.height + dy);
      if (dir.includes('w')) {
        newWidth = Math.max(50, startRect.width - dx);
        newLeft = startRect.left + dx;
      }
      if (dir.includes('n')) {
        newHeight = Math.max(30, startRect.height - dy);
        newTop = startRect.top + dy;
      }

      Object.assign(this.element.style, {
        left: newLeft + 'px',
        top: newTop + 'px',
        width: newWidth + 'px',
        height: newHeight + 'px'
      });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      
      // Only prevent overlay click if we actually moved
      if (hasMoved) {
        // Set flag briefly to prevent overlay mouseup from firing
        this.justResized = true;
        setTimeout(() => { this.justResized = false; }, 50);
      }
      this.isResizing = false;
      this.element.classList.remove('resizing');
      // Update relative coordinates
      // Snap to integer pixel grid to avoid fractional rounding bumps on next update
      const anchorRect = this.anchorEl.getBoundingClientRect();
      const rect = this.element.getBoundingClientRect();
      const snappedLeft = Math.round(rect.left);
      const snappedTop = Math.round(rect.top);
      const snappedWidth = Math.round(rect.width);
      const snappedHeight = Math.round(rect.height);
      Object.assign(this.element.style, {
        left: snappedLeft + 'px',
        top: snappedTop + 'px',
        width: snappedWidth + 'px',
        height: snappedHeight + 'px'
      });

      this.rel = {
        x: (snappedLeft - anchorRect.left) / anchorRect.width,
        y: (snappedTop - anchorRect.top) / anchorRect.height,
        w: snappedWidth / anchorRect.width,
        h: snappedHeight / anchorRect.height
      };
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

})();
