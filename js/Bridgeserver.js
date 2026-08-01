'use strict';

const WebSocket = require('ws');
const { MinecraftClient } = require('./mcClient');
const { createChunkDecoder } = require('./chunkDecoder');
const chunkDecoder = createChunkDecoder('1.21.6');

const wsPort = process.argv[2] ? parseInt(process.argv[2], 10) : 8081;
const wss = new WebSocket.Server({ port: wsPort });

console.log(`[bridge] WebSocket bridge listening on ws://localhost:${wsPort}`);
console.log('[bridge] Waiting for your game to connect...');

wss.on('connection', (ws) => {
  console.log('[bridge] browser connected');
  let mc = null;
  let lastMoveLogTime = 0;

  const send = (msg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      send({ type: 'error', message: 'Bad JSON from browser: ' + err.message });
      return;
    }

    switch (msg.type) {
      case 'connect': {
        if (mc) {
          send({ type: 'error', message: 'Already connected — send "disconnect" first.' });
          return;
        }
        if (!msg.host || !msg.username) {
          send({ type: 'error', message: '"connect" requires host and username.' });
          return;
        }
        mc = new MinecraftClient({
          host: msg.host,
          port: msg.port || 25565,
          username: msg.username,
          protocolVersion: msg.protocolVersion || 771,
        });

        mc.on('stateChange', (state) => send({ type: 'status', state }));
        mc.on('joined', ({ entityId }) => send({ type: 'joined', entityId }));
        mc.on('spawned', ({ x, y, z, yaw, pitch }) => send({ type: 'spawned', x, y, z, yaw, pitch }));
        mc.on('chat', ({ text }) => send({ type: 'chat', text }));
        let chunkCount = 0;
        mc.on('chunk', ({ x, z, chunkData }) => {
          try {
            const decoded = chunkDecoder.decode(x, z, chunkData);
            chunkCount++;
            console.log(`[bridge] chunk #${chunkCount} received: (${x}, ${z}) — ${decoded.sections.length} non-empty section(s)`);
            send({ type: 'chunk', cx: decoded.cx, cz: decoded.cz, sections: decoded.sections });
          } catch (err) {
            console.error(`[bridge] chunk decode FAILED (${x},${z}):`, err.message);
            send({ type: 'error', message: `Failed to decode chunk (${x},${z}): ${err.message}` });
          }
        });
        mc.on('unloadChunk', ({ x, z }) => {
          console.log(`[bridge] server unloaded chunk (${x}, ${z})`);
          send({ type: 'unloadChunk', cx: x, cz: z });
        });
        mc.on('blockChanges', (changes) => {
          try {
            const resolved = changes.map(({ x, y, z, stateId }) => ({
              x, y, z, name: chunkDecoder.resolveBlockName(stateId),
            }));
            send({ type: 'blockChanges', changes: resolved });
          } catch (err) {
            console.error('[bridge] failed to resolve block change:', err.message);
          }
        });
        mc.on('disconnected', ({ reason, phase }) => {
          send({ type: 'disconnected', reason, phase });
          mc = null;
        });
        mc.on('error', (err) => send({ type: 'error', message: err.message }));
        mc.on('close', () => {
          send({ type: 'status', state: 'closed' });
          mc = null;
        });

        console.log(`[bridge] connecting to ${msg.host}:${msg.port || 25565} as "${msg.username}"...`);
        mc.connect();
        break;
      }

      case 'move': {
        if (!mc) return;
        const { x, y, z, yaw, pitch, onGround } = msg;
        if ([x, y, z, yaw, pitch].some((v) => typeof v !== 'number')) return;
        mc.sendPositionLook(x, y, z, yaw, pitch, !!onGround);
        const now = Date.now();
        if (now - lastMoveLogTime > 1000) {
          lastMoveLogTime = now;
          console.log(`[bridge] player at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
        }
        break;
      }

      case 'disconnect': {
        if (mc) {
          mc.disconnect();
          mc = null;
        }
        break;
      }

      default:
        send({ type: 'error', message: 'Unknown message type: ' + msg.type });
    }
  });

  ws.on('close', () => {
    console.log('[bridge] browser disconnected — closing Minecraft connection');
    if (mc) mc.disconnect();
    mc = null;
  });
});