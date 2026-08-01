//  mcBridgeClient.js — browser-side connector for the mcClient.js/bridgeServer.js WebSocket bridge.
//  This file doesn't talk MC protocol directly, it just relays a small json message set to bridgeServer.js, which runs locally on your machine and holds the real TCP connection.
//  Usage in your game code:
//  import { MCBridge } from './mcBridgeClient.js';
//    const bridge = new MCBridge();
//    bridge.onSpawned = ({x, y, z, yaw, pitch}) => {
//      player.position.set(x, y, z);
//    };
//  bridge.onChat = (text) => console.log('[server]', text);
//  bridge.onStatus = (state) => console.log('[bridge status]', state);
//  bridge.onDisconnected = ({reason, phase}) => console.log('kicked:', reason);
//  bridge.connect({ host: 'example.com', port: 25565, username: 'player' });
//  In your render/tick loop, throttle to ~20Hz (every 50ms) or less:
//  bridge.sendMove(player.position.x, player.position.y, player.position.z, yawRadians, pitchRadians, onGround);

export class MCBridge {
  // bridgeUrl - defaults to the local bridgeServer.js instance
  constructor(bridgeUrl = 'ws://localhost:8081') {
    this.bridgeUrl = bridgeUrl;
    this.ws = null;
    this.connected = false;
    this._lastMoveSent = 0;
    this.minMoveIntervalMs = 50; // ~20Hz cap vanilla client tick rate

    // Override these from your game code.
    this.onStatus = (_state) => {};
    this.onJoined = (_entityId) => {};
    this.onSpawned = (_pos) => {}; // {x,y,z,yaw,pitch}
    this.onChat = (_text) => {};
    this.onChunk = (_cx, _cz, _sections) => {};
    this.onUnloadChunk = (_cx, _cz) => {};
    this.onBlockChanges = (_changes) => {}; // [{x,y,z,name}]
    this.onDisconnected = (_info) => {}; // {reason, phase}
    this.onError = (_message) => {};
    this.onBridgeOpen = () => {};
    this.onBridgeClose = () => {};
  }

  connect({ host, port = 25565, username, protocolVersion = 771 }) {
    if (this.ws) {
      console.warn('[MCBridge] already connecting/connected — call disconnect() first');
      return;
    }
    this.ws = new WebSocket(this.bridgeUrl);

    this.ws.addEventListener('open', () => {
      this.onBridgeOpen();
      this.ws.send(JSON.stringify({ type: 'connect', host, port, username, protocolVersion }));
    });

    this.ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        this.onError('Bad JSON from bridge: ' + err.message);
        return;
      }
      switch (msg.type) {
        case 'status':
          this.connected = msg.state === 'play';
          this.onStatus(msg.state);
          break;
        case 'joined':
          this.onJoined(msg.entityId);
          break;
        case 'spawned':
          this.onSpawned({ x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch });
          break;
        case 'chat':
          this.onChat(msg.text);
          break;
        case 'chunk':
          this.onChunk(msg.cx, msg.cz, msg.sections);
          break;
        case 'unloadChunk':
          this.onUnloadChunk(msg.cx, msg.cz);
          break;
        case 'blockChanges':
          this.onBlockChanges(msg.changes);
          break;
        case 'disconnected':
          this.connected = false;
          this.onDisconnected({ reason: msg.reason, phase: msg.phase });
          break;
        case 'error':
          this.onError(msg.message);
          break;
        default:
          console.warn('[MCBridge] unknown message from bridge:', msg);
      }
    });

    this.ws.addEventListener('close', () => {
      this.connected = false;
      this.ws = null;
      this.onBridgeClose();
    });

    this.ws.addEventListener('error', () => {
      this.onError('WebSocket error talking to bridgeServer.js — is it running (node bridgeServer.js)?');
    });
  }


  // yaw/pitch must be in degrees.
  sendMove(x, y, z, yaw, pitch, onGround) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    if (now - this._lastMoveSent < this.minMoveIntervalMs) return;
    this._lastMoveSent = now;
    this.ws.send(JSON.stringify({ type: 'move', x, y, z, yaw, pitch, onGround: !!onGround }));
  }

  disconnect() {
    if (this.ws) {
      try { this.ws.send(JSON.stringify({ type: 'disconnect' })); } catch (_) {}
      this.ws.close();
    }
    this.ws = null;
    this.connected = false;
  }
}