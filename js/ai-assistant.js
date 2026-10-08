// NOKKA Furniture — Global AI Chatbot Assistant Widget
// Built by Varun Gowda

import { PRODUCTS, initProducts } from './products.js';

class AIAssistant {
  constructor() {
    this.isOpen = false;
    this.productsLoaded = false;
    this.injectHTML();
    this.bindEvents();
    
    // Lazy-load products catalog
    initProducts().then(() => {
      this.productsLoaded = true;
    });
  }

  injectHTML() {
    const styles = `
      <style id="aiAssistantStyles">
        .ai-chat-trigger {
          position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px;
          background: #1B1712; color: #FAF8F5; border: 1px solid #FAF8F5; border-radius: 50%;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3); cursor: pointer; display: flex;
          align-items: center; justify-content: center; z-index: 101000;
          transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .ai-chat-trigger:hover { transform: scale(1.08); }
        .ai-chat-panel {
          position: fixed; bottom: 92px; right: 24px; width: 360px; height: 480px;
          background: #FAF8F5; color: #1B1712; border: 1px solid #d5cebf; border-radius: 12px;
          box-shadow: 0 15px 40px rgba(0,0,0,0.2); display: flex; flex-direction: column;
          z-index: 101000; overflow: hidden; transform: translateY(20px); opacity: 0; pointer-events: none;
          transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .ai-chat-panel.active { transform: translateY(0); opacity: 1; pointer-events: all; }
        .ai-chat-header {
          background: #1B1712; color: #FAF8F5; padding: 16px 20px;
          display: flex; justify-content: space-between; align-items: center;
        }
        .ai-chat-body {
          flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
          font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.5;
        }
        .chat-msg { max-width: 80%; padding: 10px 14px; border-radius: 8px; box-sizing: border-box; }
        .chat-msg.bot { background: #FAF8F5; border: 1px solid #d5cebf; align-self: flex-start; }
        .chat-msg.user { background: #1B1712; color: #FAF8F5; align-self: flex-end; }
        .ai-chip {
          display: inline-block; padding: 6px 12px; border: 1px solid #d5cebf; border-radius: 16px;
          background: none; font-size: 11px; cursor: pointer; font-family: 'Space Grotesk', sans-serif;
          transition: all 0.3s; color: #8e8371; margin-right: 6px; margin-bottom: 6px;
        }
        .ai-chip:hover { background: #1B1712; color: #FAF8F5; border-color: #1B1712; }
        .ai-input-row { display: flex; border-top: 1px solid #d5cebf; padding: 12px; background: #FAF8F5; }
        .ai-input { flex: 1; border: 1px solid #d5cebf; border-radius: 6px; padding: 10px; font-size: 13px; outline: none; background: #FAF8F5; color: #1B1712; }
        .ai-send { background: #1B1712; color: #FAF8F5; border: none; border-radius: 6px; padding: 0 16px; font-family: 'Space Grotesk', sans-serif; font-size: 12px; cursor: pointer; margin-left: 8px; }
      </style>
    `;
    document.body.insertAdjacentHTML('beforeend', styles);

    const chatHtml = `
      <button class="ai-chat-trigger" id="aiTrigger" aria-label="Open AI Assistant">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
      <div class="ai-chat-panel" id="aiPanel">
        <div class="ai-chat-header">
          <div>
            <h4 style="font-family:'Fraunces', serif; font-size:16px; font-weight:400; margin:0;">NOKKA AI Assistant</h4>
            <span style="font-family:'Space Grotesk', sans-serif; font-size:9px; letter-spacing:0.04em; text-transform:uppercase; opacity:0.6;">Built by Varun Gowda</span>
          </div>
          <button id="closeAiPanel" style="background:none; border:none; color:inherit; cursor:pointer;">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="ai-chat-body" id="aiChatBody">
          <div class="chat-msg bot">
            Hejsan! I am your NOKKA Studio Assistant. How can I help you find or customize your heritage pieces today?
          </div>
          <div style="margin-top: 10px;">
            <button class="ai-chip" onclick="handleChipClick('Find premium sofas')">Sofas</button>
            <button class="ai-chip" onclick="handleChipClick('Items under ₹50,000')">Budget &lt; ₹50k</button>
            <button class="ai-chip" onclick="handleChipClick('Complete my Bedroom')">Bedroom Set</button>
            <button class="ai-chip" onclick="handleChipClick('Show 3D models')">3D Showroom</button>
          </div>
        </div>
        <form class="ai-input-row" id="aiForm">
          <input type="text" class="ai-input" id="aiInput" placeholder="Ask about products, sizes..." required>
          <button type="submit" class="ai-send">Send</button>
        </form>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', chatHtml);
  }

  bindEvents() {
    const trigger = document.getElementById('aiTrigger');
    const panel = document.getElementById('aiPanel');
    const closeBtn = document.getElementById('closeAiPanel');
    const form = document.getElementById('aiForm');

    trigger.addEventListener('click', () => {
      this.isOpen = !this.isOpen;
      panel.classList.toggle('active', this.isOpen);
    });

    closeBtn.addEventListener('click', () => {
      this.isOpen = false;
      panel.classList.remove('active');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('aiInput');
      const text = input.value.trim();
      if (!text) return;
      this.appendMessage('user', text);
      input.value = '';
      this.respondToUser(text);
    });

    // Expose chip handler globally
    window.handleChipClick = (query) => {
      this.appendMessage('user', query);
      this.respondToUser(query);
    };
  }

  appendMessage(sender, text) {
    const body = document.getElementById('aiChatBody');
    const msg = document.createElement('div');
    msg.className = `chat-msg ${sender}`;
    msg.innerHTML = text;
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
  }

  respondToUser(queryText) {
    const lower = queryText.toLowerCase();
    let reply = "";

    if (!this.productsLoaded) {
      reply = "Give me just a second to connect to the studio inventory database...";
      this.appendMessage('bot', reply);
      return;
    }

    if (lower.includes('premium') || lower.includes('signature') || lower.includes('royal') || lower.includes('velvet') || lower.includes('leather')) {
      const matches = PRODUCTS.filter(p => p.category === 'premium').slice(0, 4);
      reply = "Here are our exclusive ⭐ <strong>NOKKA Signature Collection</strong> pieces:<br><br>" + 
              matches.map(p => `<strong>${p.name}</strong> - ₹ ${p.price.toLocaleString()}<br><a href="product.html?id=${p.id}" style="color:var(--brass); text-decoration:underline;">View Specs & Reviews</a> | <a href="3d-showroom.html?id=${p.id}" style="color:var(--brass); text-decoration:underline;">Configure</a>`).join('<br><br>');
    } else if (lower.includes('sofa')) {
      const matches = PRODUCTS.filter(p => p.category === 'living' || p.category === 'premium').filter(p => p.name.toLowerCase().includes('sofa')).slice(0, 3);
      if (matches.length > 0) {
        reply = "Here are a few hand-jointed sofas currently in our batch slots:<br><br>" + 
                matches.map(p => `<strong>${p.name}</strong> - ₹ ${p.price.toLocaleString()}<br><a href="product.html?id=${p.id}" style="color:var(--brass); text-decoration:underline;">View Specs</a> | <a href="3d-showroom.html?id=${p.id}" style="color:var(--brass); text-decoration:underline;">3D Customizer</a>`).join('<br><br>');
      } else {
        reply = "I couldn't find any active sofas matching that description, but you can explore our full collection.";
      }
    } else if (lower.includes('bed') || lower.includes('bedroom')) {
      const matches = PRODUCTS.filter(p => p.category === 'bedroom').slice(0, 3);
      reply = "For the bedroom, we offer standard platform configurations:<br><br>" + 
              matches.map(p => `<strong>${p.name}</strong> - ₹ ${p.price.toLocaleString()}<br><a href="product.html?id=${p.id}" style="color:var(--brass); text-decoration:underline;">Details</a>`).join('<br><br>');
    } else if (lower.includes('under') || lower.includes('budget') || lower.includes('less than') || lower.includes('₹') || lower.includes('rs')) {
      // Find numerical values
      const match = lower.match(/\d+/g);
      const limit = match ? parseInt(match[0]) : 50000;
      const matches = PRODUCTS.filter(p => p.price <= limit).slice(0, 3);
      if (matches.length > 0) {
        reply = `Here are pieces under ₹ ${limit.toLocaleString()}:<br><br>` + 
                matches.map(p => `<strong>${p.name}</strong> - ₹ ${p.price.toLocaleString()}<br><a href="product.html?id=${p.id}" style="color:var(--brass); text-decoration:underline;">View specs</a>`).join('<br><br>');
      } else {
        reply = `No studio pieces currently priced under ₹ ${limit.toLocaleString()}. We use premium solid timbers which impacts pricing.`;
      }
    } else if (lower.includes('3d') || lower.includes('showroom')) {
      reply = `You can enter our <a href="3d-showroom.html" style="color:var(--brass); text-decoration:underline; font-weight:600;">Interactive 3D Showroom</a> to configure materials, wood finishes, and toggle atmospheric Nordic lighting!`;
    } else {
      reply = `Gothenburg Craft Treaty logs note that we build chairs, beds, dining sets, and premium console tables. Try asking for "premium sofas" or "items under ₹40,000".`;
    }

    setTimeout(() => {
      this.appendMessage('bot', reply);
    }, 600);
  }
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new AIAssistant();
  });
} else {
  new AIAssistant();
}
