#!/usr/bin/env node
'use strict';

const net = require('net');
const crypto = require('crypto');
const zlib = require('zlib');
const { EventEmitter } = require('events');
// Packet ID tables — verified against minecraft-data protocol.json for 1.21.6
// (protocol 771). See header comment.
// ---------------------------------------------------------------------------

const HANDSHAKE_SB = { set_protocol: 0x00 };

const LOGIN_CB = {
  disconnect: 0x00,
  encryption_request: 0x01,
  success: 0x02,
  compress: 0x03,
  plugin_request: 0x04,
  cookie_request: 0x05,
};
const LOGIN_SB = {
  login_start: 0x00,
  encryption_response: 0x01,
  plugin_response: 0x02,
  login_acknowledged: 0x03,
  cookie_response: 0x04,
};

const CONFIG_CB = {
  cookie_request: 0x00,
  custom_payload: 0x01,
  disconnect: 0x02,
  finish_configuration: 0x03,
  keep_alive: 0x04,
  ping: 0x05,
  reset_chat: 0x06,
  registry_data: 0x07,
  remove_resource_pack: 0x08,
  add_resource_pack: 0x09,
  store_cookie: 0x0a,
  transfer: 0x0b,
  feature_flags: 0x0c,
  tags: 0x0d,
  select_known_packs: 0x0e,
  custom_report_details: 0x0f,
  server_links: 0x10,
};
const CONFIG_SB = {
  settings: 0x00,
  cookie_response: 0x01,
  custom_payload: 0x02,
  finish_configuration: 0x03,
  keep_alive: 0x04,
  pong: 0x05,
  resource_pack_receive: 0x06,
  select_known_packs: 0x07,
};

const PLAY_CB = {
  login: 0x2b,
  keep_alive: 0x26,
  kick_disconnect: 0x1c,
  system_chat: 0x72,
  player_chat: 0x3a,
  start_configuration: 0x6f,
  ping: 0x36,
  position: 0x41,
  spawn_position: 0x5a,
  map_chunk: 0x27,
  unload_chunk: 0x21,
  chunk_batch_finished: 0x0b,
  chunk_batch_start: 0x0c,
  death_combat_event: 0x3d,
  respawn: 0x4b,
  update_health: 0x61,
  block_change: 0x08,
  multi_block_change: 0x4d,
};

const PLAY_SB = {
  teleport_confirm: 0x00,
  keep_alive: 0x1b,
  position: 0x1d,
  position_look: 0x1e,
  look: 0x1f,
  flying: 0x20,
  pong: 0x2c,
  configuration_acknowledged: 0x0f,
  chunk_batch_received: 0x0a,
  client_command: 0x0b,
};

function writeVarInt(value) {
  const bytes = [];
  value = value | 0;
  do {
    let temp = value & 0b01111111;
    value >>>= 7;
    if (value !== 0) temp |= 0b10000000;
    bytes.push(temp);
  } while (value !== 0);
  return Buffer.from(bytes);
}

function writeVarLong(bigValue) {
  let value = BigInt.asUintN(64, BigInt(bigValue));
  const bytes = [];
  do {
    let temp = Number(value & 0x7fn);
    value >>= 7n;
    if (value !== 0n) temp |= 0x80;
    bytes.push(temp);
  } while (value !== 0n);
  return Buffer.from(bytes);
}

function writeString(str) {
  const strBuf = Buffer.from(str, 'utf8');
  return Buffer.concat([writeVarInt(strBuf.length), strBuf]);
}

function writeUShort(value) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(value, 0);
  return b;
}

function writeFloat(value) {
  const b = Buffer.alloc(4);
  b.writeFloatBE(value, 0);
  return b;
}

function writeDouble(value) {
  const b = Buffer.alloc(8);
  b.writeDoubleBE(value, 0);
  return b;
}

function writeLong(bigValue) {
  const b = Buffer.alloc(8);
  b.writeBigInt64BE(BigInt.asIntN(64, BigInt(bigValue)), 0);
  return b;
}

function offlineUUIDBytes(name) {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return hash;
}

function uuidBytesToString(buf) {
  const hex = buf.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class Reader {
  constructor(buf) {
    this.buf = buf;
    this.offset = 0;
  }
  remaining() {
    return this.buf.length - this.offset;
  }
  readVarInt() {
    let numRead = 0, result = 0, read;
    do {
      read = this.buf.readUInt8(this.offset++);
      result |= (read & 0b01111111) << (7 * numRead);
      numRead++;
      if (numRead > 5) throw new Error('VarInt too big');
    } while ((read & 0b10000000) !== 0);
    return result | 0;
  }
  readString() {
    const len = this.readVarInt();
    const str = this.buf.toString('utf8', this.offset, this.offset + len);
    this.offset += len;
    return str;
  }
  readUByte() { return this.buf.readUInt8(this.offset++); }
  readByte() { return this.buf.readInt8(this.offset++); }
  readBool() { return this.readUByte() !== 0; }
  readShort() { const v = this.buf.readInt16BE(this.offset); this.offset += 2; return v; }
  readUShort() { const v = this.buf.readUInt16BE(this.offset); this.offset += 2; return v; }
  readInt() { const v = this.buf.readInt32BE(this.offset); this.offset += 4; return v; }
  readUInt() { const v = this.buf.readUInt32BE(this.offset); this.offset += 4; return v; }
  readLong() { const v = this.buf.readBigInt64BE(this.offset); this.offset += 8; return v; }
  readFloat() { const v = this.buf.readFloatBE(this.offset); this.offset += 4; return v; }
  readDouble() { const v = this.buf.readDoubleBE(this.offset); this.offset += 8; return v; }
  readUUIDBytes() { const v = this.buf.subarray(this.offset, this.offset + 16); this.offset += 16; return v; }
  readRest() { const v = this.buf.subarray(this.offset); this.offset = this.buf.length; return v; }

  readPackedXZY(xBits, zBits, yBits) {
    const raw = this.readLong();
    const yMask = (1n << BigInt(yBits)) - 1n;
    const zMask = (1n << BigInt(zBits)) - 1n;
    const xMask = (1n << BigInt(xBits)) - 1n;
    let y = raw & yMask;
    let z = (raw >> BigInt(yBits)) & zMask;
    let x = (raw >> BigInt(yBits + zBits)) & xMask;
    if (y >= 1n << BigInt(yBits - 1)) y -= 1n << BigInt(yBits);
    if (z >= 1n << BigInt(zBits - 1)) z -= 1n << BigInt(zBits);
    if (x >= 1n << BigInt(xBits - 1)) x -= 1n << BigInt(xBits);
    return { x: Number(x), y: Number(y), z: Number(z) };
  }
}

const NBT_END = 0, NBT_BYTE = 1, NBT_SHORT = 2, NBT_INT = 3, NBT_LONG = 4,
  NBT_FLOAT = 5, NBT_DOUBLE = 6, NBT_BYTE_ARRAY = 7, NBT_STRING = 8,
  NBT_LIST = 9, NBT_COMPOUND = 10, NBT_INT_ARRAY = 11, NBT_LONG_ARRAY = 12;

function nbtReadPayload(r, type) {
  switch (type) {
    case NBT_BYTE: return r.readByte();
    case NBT_SHORT: return r.readShort();
    case NBT_INT: return r.readInt();
    case NBT_LONG: return r.readLong();
    case NBT_FLOAT: return r.readFloat();
    case NBT_DOUBLE: return r.readDouble();
    case NBT_BYTE_ARRAY: {
      const len = r.readInt();
      const arr = [];
      for (let i = 0; i < len; i++) arr.push(r.readByte());
      return arr;
    }
    case NBT_STRING: {
      const len = r.readUShort();
      const s = r.buf.toString('utf8', r.offset, r.offset + len);
      r.offset += len;
      return s;
    }
    case NBT_LIST: {
      const childType = r.readUByte();
      const len = r.readInt();
      const arr = [];
      for (let i = 0; i < len; i++) arr.push(nbtReadPayload(r, childType));
      return arr;
    }
    case NBT_COMPOUND: {
      const obj = {};
      for (;;) {
        const childType = r.readUByte();
        if (childType === NBT_END) break;
        const nameLen = r.readUShort();
        const name = r.buf.toString('utf8', r.offset, r.offset + nameLen);
        r.offset += nameLen;
        obj[name] = nbtReadPayload(r, childType);
      }
      return obj;
    }
    case NBT_INT_ARRAY: {
      const len = r.readInt();
      const arr = [];
      for (let i = 0; i < len; i++) arr.push(r.readInt());
      return arr;
    }
    case NBT_LONG_ARRAY: {
      const len = r.readInt();
      const arr = [];
      for (let i = 0; i < len; i++) arr.push(r.readLong());
      return arr;
    }
    default:
      throw new Error('Unsupported NBT tag type ' + type);
  }
}

function readNetworkNbt(r) {
  const type = r.readUByte();
  if (type === NBT_END) return null;
  return nbtReadPayload(r, type);
}

function textComponentToPlain(comp) {
  if (comp == null) return '';
  if (typeof comp === 'string') return comp;
  if (Array.isArray(comp)) return comp.map(textComponentToPlain).join('');
  if (typeof comp === 'object') {
    let out = typeof comp.text === 'string' ? comp.text : '';
    if (Array.isArray(comp.extra)) out += comp.extra.map(textComponentToPlain).join('');
    return out;
  }
  return String(comp);
}

class MinecraftClient extends EventEmitter {
  constructor({ host, port, username, protocolVersion = 771 }) {
    super();
    this.host = host;
    this.port = port;
    this.username = username;
    this.protocolVersion = protocolVersion;
    this.state = 'handshake';
    this.compressionThreshold = -1;
    this.recvBuffer = Buffer.alloc(0);
    this.socket = null;
    this.playerUUIDBytes = offlineUUIDBytes(username);
    this.position = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    this._awaitingRespawn = false;
  }

  connect() {
    this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
      this.sendHandshake();
      this.sendLoginStart();
    });
    this.socket.on('data', (chunk) => {
      this.recvBuffer = Buffer.concat([this.recvBuffer, chunk]);
      this.drainPackets();
    });
    this.socket.on('close', () => this.emit('close'));
    this.socket.on('error', (err) => this.emit('error', err));
  }

  disconnect() {
    if (this.socket) this.socket.end();
  }

  setState(s) {
    this.state = s;
    this.emit('stateChange', s);
  }

  sendPacket(packetId, dataBuf) {
    const idAndData = Buffer.concat([writeVarInt(packetId), dataBuf]);
    let framed;
    if (this.compressionThreshold >= 0) {
      if (idAndData.length >= this.compressionThreshold) {
        const compressed = zlib.deflateSync(idAndData);
        const body = Buffer.concat([writeVarInt(idAndData.length), compressed]);
        framed = Buffer.concat([writeVarInt(body.length), body]);
      } else {
        const body = Buffer.concat([writeVarInt(0), idAndData]);
        framed = Buffer.concat([writeVarInt(body.length), body]);
      }
    } else {
      framed = Buffer.concat([writeVarInt(idAndData.length), idAndData]);
    }
    this.socket.write(framed);
  }

  drainPackets() {
    for (;;) {
      const lengthInfo = this.tryReadVarIntFrom(this.recvBuffer, 0);
      if (!lengthInfo) return;
      const { value: packetLength, size: lengthSize } = lengthInfo;
      const totalNeeded = lengthSize + packetLength;
      if (this.recvBuffer.length < totalNeeded) return;

      const packetBuf = this.recvBuffer.subarray(lengthSize, totalNeeded);
      this.recvBuffer = this.recvBuffer.subarray(totalNeeded);

      let idAndData;
      if (this.compressionThreshold >= 0) {
        const r = new Reader(packetBuf);
        const dataLength = r.readVarInt();
        const rest = packetBuf.subarray(r.offset);
        idAndData = dataLength === 0 ? rest : zlib.inflateSync(rest);
      } else {
        idAndData = packetBuf;
      }

      const idReader = new Reader(idAndData);
      const packetId = idReader.readVarInt();
      const payload = idAndData.subarray(idReader.offset);
      try {
        this.handlePacket(packetId, payload);
      } catch (err) {
        this.emit('error', new Error(`Failed to handle packet 0x${packetId.toString(16)} in state ${this.state}: ${err.message}`));
      }
    }
  }

  tryReadVarIntFrom(buf, offset) {
    let result = 0, numRead = 0, pos = offset;
    for (;;) {
      if (pos >= buf.length) return null;
      const b = buf[pos++];
      result |= (b & 0b01111111) << (7 * numRead);
      numRead++;
      if ((b & 0b10000000) === 0) break;
      if (numRead > 5) throw new Error('VarInt too big');
    }
    return { value: result | 0, size: pos - offset };
  }

  sendHandshake() {
    const data = Buffer.concat([
      writeVarInt(this.protocolVersion),
      writeString(this.host),
      writeUShort(this.port),
      writeVarInt(2),
    ]);
    this.sendPacket(HANDSHAKE_SB.set_protocol, data);
    this.setState('login');
  }

  sendLoginStart() {
    const data = Buffer.concat([writeString(this.username), this.playerUUIDBytes]);
    this.sendPacket(LOGIN_SB.login_start, data);
  }

  handlePacket(id, data) {
    switch (this.state) {
      case 'login': return this.handleLoginPacket(id, data);
      case 'configuration': return this.handleConfigPacket(id, data);
      case 'play': return this.handlePlayPacket(id, data);
    }
  }

  handleLoginPacket(id, data) {
    const r = new Reader(data);
    switch (id) {
      case LOGIN_CB.disconnect: {
        const reason = r.readString();
        this.emit('disconnected', { reason, phase: 'login' });
        this.socket.end();
        break;
      }
      case LOGIN_CB.encryption_request: {
        this.emit('error', new Error('Server sent an Encryption Request — it is not running in offline mode; this client only supports offline servers.'));
        this.socket.end();
        break;
      }
      case LOGIN_CB.success: {
        const uuid = r.readUUIDBytes();
        r.readString();
        this.uuid = uuidBytesToString(uuid);
        this.sendPacket(LOGIN_SB.login_acknowledged, Buffer.alloc(0));
        this.setState('configuration');
        this.sendClientInformation();
        break;
      }
      case LOGIN_CB.compress: {
        this.compressionThreshold = r.readVarInt();
        break;
      }
      case LOGIN_CB.plugin_request: {
        const messageId = r.readVarInt();
        const resp = Buffer.concat([writeVarInt(messageId), Buffer.from([0x00])]);
        this.sendPacket(LOGIN_SB.plugin_response, resp);
        break;
      }
      case LOGIN_CB.cookie_request: {
        const key = r.readString();
        const resp = Buffer.concat([writeString(key), Buffer.from([0x00])]);
        this.sendPacket(LOGIN_SB.cookie_response, resp);
        break;
      }
    }
  }

  sendClientInformation() {
    const data = Buffer.concat([
      writeString('en_us'),
      Buffer.from([10]),
      writeVarInt(0),
      Buffer.from([0x01]),
      Buffer.from([0x7f]),
      writeVarInt(1),
      Buffer.from([0x00]),
      Buffer.from([0x01]),
      writeVarInt(0),
    ]);
    this.sendPacket(CONFIG_SB.settings, data);
  }

  handleConfigPacket(id, data) {
    const r = new Reader(data);
    switch (id) {
      case CONFIG_CB.cookie_request: {
        const key = r.readString();
        this.sendPacket(CONFIG_SB.cookie_response, Buffer.concat([writeString(key), Buffer.from([0x00])]));
        break;
      }
      case CONFIG_CB.disconnect: {
        let reasonText = '(unreadable reason)';
        try { reasonText = textComponentToPlain(readNetworkNbt(r)); } catch (_) {}
        this.emit('disconnected', { reason: reasonText, phase: 'configuration' });
        this.socket.end();
        break;
      }
      case CONFIG_CB.finish_configuration: {
        this.sendPacket(CONFIG_SB.finish_configuration, Buffer.alloc(0));
        this.setState('play');
        break;
      }
      case CONFIG_CB.keep_alive: {
        const id64 = r.readLong();
        this.sendPacket(CONFIG_SB.keep_alive, writeLong(id64));
        break;
      }
      case CONFIG_CB.ping: {
        const pingId = r.readInt();
        const buf = Buffer.alloc(4);
        buf.writeInt32BE(pingId, 0);
        this.sendPacket(CONFIG_SB.pong, buf);
        break;
      }
      case CONFIG_CB.select_known_packs: {
        this.sendPacket(CONFIG_SB.select_known_packs, writeVarInt(0));
        break;
      }
      case CONFIG_CB.add_resource_pack: {
        const uuid = r.readUUIDBytes();
        this.sendPacket(CONFIG_SB.resource_pack_receive, Buffer.concat([uuid, writeVarInt(1)]));
        break;
      }
      default:
        break;
    }
  }

  handlePlayPacket(id, data) {
    const r = new Reader(data);
    switch (id) {
      case PLAY_CB.login: {
        const entityId = r.readInt();
        this.entityId = entityId;
        this.emit('joined', { entityId });
        break;
      }
      case PLAY_CB.keep_alive: {
        const id64 = r.readLong();
        this.sendPacket(PLAY_SB.keep_alive, writeLong(id64));
        break;
      }
      case PLAY_CB.position: {
        const teleportId = r.readVarInt();
        const x = r.readDouble(), y = r.readDouble(), z = r.readDouble();
        r.readDouble(); r.readDouble(); r.readDouble();
        const yaw = r.readFloat(), pitch = r.readFloat();
        this.position = { x, y, z, yaw, pitch };
        this.sendPacket(PLAY_SB.teleport_confirm, writeVarInt(teleportId));
        this.sendPositionLook(x, y, z, yaw, pitch, true);
        this.emit('spawned', { x, y, z, yaw, pitch, teleportId });
        break;
      }
      case PLAY_CB.death_combat_event: {
        r.readVarInt();
        let deathMessage = 'You died';
        try { deathMessage = textComponentToPlain(readNetworkNbt(r)); } catch (_) {}
        this.emit('chat', { text: `[Death] ${deathMessage}` });
        this._requestRespawn();
        break;
      }
      case PLAY_CB.update_health: {
        const health = r.readFloat();
        const food = r.readVarInt();
        const foodSaturation = r.readFloat();
        this.emit('health', { health, food, foodSaturation });
        if (health <= 0) this._requestRespawn();
        break;
      }
      case PLAY_CB.respawn: {
        this._awaitingRespawn = false;
        this.emit('chat', { text: '[Death] Respawned' });
        break;
      }
      case PLAY_CB.block_change: {
        const pos = r.readPackedXZY(26, 26, 12);
        const stateId = r.readVarInt();
        this.emit('blockChanges', [{ x: pos.x, y: pos.y, z: pos.z, stateId }]);
        break;
      }
      case PLAY_CB.multi_block_change: {
        const section = r.readPackedXZY(22, 22, 20);
        const count = r.readVarInt();
        const changes = [];
        for (let i = 0; i < count; i++) {
          const record = r.readVarInt();
          const stateId = record >>> 12;
          const localX = (record >> 8) & 0xf;
          const localZ = (record >> 4) & 0xf;
          const localY = record & 0xf;
          changes.push({
            x: section.x * 16 + localX,
            y: section.y * 16 + localY,
            z: section.z * 16 + localZ,
            stateId,
          });
        }
        this.emit('blockChanges', changes);
        break;
      }
      case PLAY_CB.chunk_batch_finished: {
        const chunksPerTickReport = 25.0;
        this.sendPacket(PLAY_SB.chunk_batch_received, writeFloat(chunksPerTickReport));
        break;
      }
      case PLAY_CB.map_chunk: {
        const x = r.readInt();
        const z = r.readInt();
        const hmCount = r.readVarInt();
        for (let i = 0; i < hmCount; i++) {
          r.readVarInt();
          const dataCount = r.readVarInt();
          r.offset += dataCount * 8;
        }
        const chunkDataLen = r.readVarInt();
        const chunkData = Buffer.from(r.buf.subarray(r.offset, r.offset + chunkDataLen));
        this.emit('chunk', { x, z, chunkData });
        break;
      }
      case PLAY_CB.unload_chunk: {
        const z = r.readInt();
        const x = r.readInt();
        this.emit('unloadChunk', { x, z });
        break;
      }
      case PLAY_CB.kick_disconnect: {
        let reasonText = '(unreadable reason)';
        try { reasonText = textComponentToPlain(readNetworkNbt(r)); } catch (_) {}
        this.emit('disconnected', { reason: reasonText, phase: 'play' });
        this.socket.end();
        break;
      }
      case PLAY_CB.system_chat: {
        let text = '(unreadable message)';
        try { text = textComponentToPlain(readNetworkNbt(r)); } catch (_) {}
        this.emit('chat', { text });
        break;
      }
      case PLAY_CB.player_chat: {
        this.emit('chat', { text: '(player chat message — full decoding not implemented)' });
        break;
      }
      case PLAY_CB.start_configuration: {
        this.setState('configuration');
        this.sendPacket(PLAY_SB.configuration_acknowledged, Buffer.alloc(0));
        break;
      }
      default:
        break;
    }
  }

  _requestRespawn() {
    if (this._awaitingRespawn || this.state !== 'play') return;
    this._awaitingRespawn = true;
    this.sendPacket(PLAY_SB.client_command, writeVarInt(0));
  }

  sendPositionLook(x, y, z, yaw, pitch, onGround) {
    if (this.state !== 'play') return;
    const data = Buffer.concat([
      writeDouble(x), writeDouble(y), writeDouble(z),
      writeFloat(yaw), writeFloat(pitch),
      Buffer.from([onGround ? 0x01 : 0x00]),
    ]);
    this.sendPacket(PLAY_SB.position_look, data);
    this.position = { x, y, z, yaw, pitch };
  }
}

module.exports = { MinecraftClient, offlineUUIDBytes, uuidBytesToString };

if (require.main === module) {
  const [, , argHost, argPort, argUsername, argProtocol] = process.argv;
  if (!argHost) {
    console.error('Usage: node mcClient.js <host> [port=25565] [username=Player] [protocolVersion=771]');
    process.exit(1);
  }
  const client = new MinecraftClient({
    host: argHost,
    port: argPort ? parseInt(argPort, 10) : 25565,
    username: argUsername || 'Player',
    protocolVersion: argProtocol ? parseInt(argProtocol, 10) : 771,
  });

  console.log(`Connecting to ${client.host}:${client.port} as "${client.username}" (protocol ${client.protocolVersion}, offline mode)...`);
  client.on('stateChange', (s) => console.log(`[state] ${s}`));
  client.on('joined', ({ entityId }) => console.log(`[play] Login (play) received — entityId=${entityId}, you are in the world.`));
  client.on('spawned', ({ x, y, z, yaw, pitch }) => console.log(`[play] spawned/teleported to (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) yaw=${yaw.toFixed(1)} pitch=${pitch.toFixed(1)}`));
  client.on('chat', ({ text }) => console.log('[chat]', text));
  client.on('disconnected', ({ reason, phase }) => console.log(`[${phase}] disconnected:`, reason));
  client.on('error', (err) => console.error('[error]', err.message));
  client.on('close', () => console.log('[net] connection closed'));

  client.connect();

  process.on('SIGINT', () => {
    console.log('\nClosing connection...');
    client.disconnect();
    process.exit(0);
  });
}