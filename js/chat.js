// chat.js - Chat and command system
export class ChatSystem {
  constructor(options = {}) {
    this.maxMessages = options.maxMessages || 100;
    this.messages = [];
    this.isOpen = false;
    this.commandHandlers = new Map();
    this.messageHandler = null;
    
    this.init();
  }

  init() {
    // Create chat container
    this.chatContainer = document.createElement('div');
    this.chatContainer.id = 'chat-container';
    this.chatContainer.style.cssText = `
      position: fixed;
      bottom: 0px;
      width: 500px;
      max-height: 300px;
      display: flex;
      flex-direction: column;
      font-family: Minecraft;
      z-index: 1;
    `;
    document.body.appendChild(this.chatContainer);

    // Create messages area
    this.messagesArea = document.createElement('div');
    this.messagesArea.id = 'chat-messages';
    this.messagesArea.style.cssText = `
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 3px 5px;
      background: rgba(0, 0, 0, 0.47);
    `;
    this.chatContainer.appendChild(this.messagesArea);

    // Custom scrollbar styling
    this.messagesArea.style.scrollbarWidth = 'thin';
    this.messagesArea.style.scrollbarColor = 'rgba(255,255,255,0.3) transparent';

    // Create input box
    this.inputContainer = document.createElement('div');
    this.inputContainer.style.cssText = `
      display: flex;
      gap: 2px;
      padding: 3px 5px;
      background: rgba(0, 0, 0, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.5);
      pointer-events: auto;
      margin-top: 50px;
    `;

    this.inputPrefix = document.createElement('span');
    this.inputPrefix.textContent = 'Player> ';
    this.inputPrefix.style.cssText = `
      color: #0f0;
      font-weight: bold;
      flex-shrink: 0;
      font-family: Minecraft;
      font-size: 12px;
    `;
    this.inputContainer.appendChild(this.inputPrefix);

    this.inputBox = document.createElement('input');
    this.inputBox.type = 'text';
    this.inputBox.id = 'chat-input';
    this.inputBox.style.cssText = `
      flex: 1;
      background: transparent;
      border: none;
      color: #fff;
      font-family: Minecraft;
      font-size: 12px;
      outline: none;
      caret-color: #0f0;
    `;
    this.inputBox.placeholder = 'Type a message...';
    this.inputContainer.appendChild(this.inputBox);

    this.chatContainer.appendChild(this.inputContainer);

    // Hide chat input by default, show only when player presses 'T'
    this.inputContainer.style.display = 'none';

    // Input handling
    this.inputBox.addEventListener('keydown', (e) => this.handleInput(e));
    this.inputBox.addEventListener('blur', () => this.close());

    // Setup command handlers
    this.registerDefaultCommands();
  }

  registerDefaultCommands() {
    // /clear - Clear chat
    this.registerCommand('clear', () => {
      this.messages = [];
      this.messagesArea.innerHTML = '';
      this.addMessage('Chat cleared', { color: '#888' });
    });

    // /help - Show available commands
    this.registerCommand('help', () => {
      this.addMessage('Available commands:', { color: '#0f0' });
      Array.from(this.commandHandlers.keys()).forEach(cmd => {
        this.addMessage(`  /${cmd}`, { color: '#0f0' });
      });
    });

    // /say - Say something in chat
    this.registerCommand('say', (args) => {
      const message = args.join(' ') || 'nothing';
      this.addMessage(`[PLAYER] ${message}`, { color: '#aaa' });
    });

    // /debug - Toggle debug stats
    this.registerCommand('debug', () => {
      this.addMessage('Debug toggled (if available)', { color: '#0f0' });
    });

    // /gamemode - Switch gamemode (placeholder)
    this.registerCommand('gamemode', (args) => {
      const mode = args[0] || 'survival';
      this.addMessage(`Gamemode set to: ${mode}`, { color: '#0f0' });
    });

    // /time - Game time commands
    this.registerCommand('time', (args) => {
      const subCmd = args[0];
      if (subCmd === 'set') {
        const value = args[1];
        this.addMessage(`Time set to: ${value}`, { color: '#0f0' });
      } else if (subCmd === 'day') {
        this.addMessage('Set to day', { color: '#0f0' });
      } else if (subCmd === 'night') {
        this.addMessage('Set to night', { color: '#0f0' });
      } else {
        this.addMessage('/time <set <value>|day|night>', { color: '#f80' });
      }
    });
  }

  registerCommand(name, handler) {
    this.commandHandlers.set(name.toLowerCase(), handler);
  }

  handleInput(e) {
    if (e.key === 'Enter') {
      const input = this.inputBox.value.trim();
      if (input.length === 0) {
        this.close();
        return;
      }

      // Display user input
      this.addMessage(input, { color: '#fff', prefix: 'Player> ' });

      // Process command or message
      if (input.startsWith('/')) {
        this.processCommand(input);
      } else if (typeof this.messageHandler === 'function') {
        this.messageHandler(input);
      }

      this.inputBox.value = '';
      this.inputBox.focus();
    } else if (e.key === 'Escape') {
      this.close();
    }
  }

  processCommand(input) {
    const parts = input.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (this.commandHandlers.has(command)) {
      try {
        this.commandHandlers.get(command)(args);
      } catch (err) {
        this.addMessage(`Error: ${err.message}`, { color: '#f00', level: 'error' });
      }
    } else {
      this.addMessage(`Unknown command: /${command}`, { color: '#f80' });
    }
  }

  addMessage(text, options = {}) {
    const {
      color = '#aaa',
      prefix = '',
      level = 'info',
      duration = null
    } = options;

    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
      color: ${color};
      font-size: 10px;
      line-height: 1.3;
      max-width: 390px;
      word-wrap: break-word;
      white-space: pre-wrap;
      opacity: 0.95;
      transition: opacity 0.2s;
      font-family: Minecraft;
      margin: 0px;
      padding: 0px;
    `;

    if (level === 'error') {
      messageEl.style.color = '#ff5555';
      messageEl.style.fontWeight = 'bold';
    } else if (level === 'success') {
      messageEl.style.color = '#55ff55';
    } else if (level === 'debug') {
      messageEl.style.color = '#55ff55';
      messageEl.style.fontSize = '11px';
    }

    messageEl.textContent = prefix + text;
    this.messagesArea.appendChild(messageEl);

    // Keep only maxMessages
    while (this.messages.length >= this.maxMessages) {
      const old = this.messagesArea.firstChild;
      if (old) old.remove();
      this.messages.shift();
    }

    this.messages.push({ text, color, prefix, level });

    // Auto-scroll to bottom
    this.messagesArea.scrollTop = this.messagesArea.scrollHeight;

    // Auto-hide after duration if specified
    if (duration) {
      setTimeout(() => {
        messageEl.style.opacity = '0';
        setTimeout(() => {
          messageEl.remove();
          const idx = this.messages.findIndex(msg => msg.text === text);
          if (idx >= 0) this.messages.splice(idx, 1);
        }, 200);
      }, duration);
    }

    return messageEl;
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.inputContainer.style.display = 'flex';
    this.inputBox.focus();
    
    // Release pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    
    // Dispatch event for game to handle input disabling
    window.dispatchEvent(new CustomEvent('chat-opened'));
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.inputContainer.style.display = 'none';
    this.inputBox.blur();
    
    // Dispatch event for game to resume input
    window.dispatchEvent(new CustomEvent('chat-closed'));
  }

  // Log a message from other parts of the system (e.g., debug, errors)
  log(text, level = 'info') {
    const colorMap = {
      'info': '#aaa',
      'warn': '#ff8',
      'error': '#f00',
      'debug': '#0f0',
      'success': '#0f0'
    };
    const color = colorMap[level] || colorMap['info'];
    this.addMessage(text, { color, level });
  }
}

export default function createChat() {
  return new ChatSystem();
}
