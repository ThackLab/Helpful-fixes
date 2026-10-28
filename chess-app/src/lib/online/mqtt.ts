// A small MQTT 3.1.1 client over WebSocket: just what live games need
// (connect, subscribe, publish at QoS 0 with retain, keep-alive, reconnect).
// Public brokers speak it over wss without an account.

const enc = new TextEncoder();

function str(s: string): number[] {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
}

function packet(type: number, body: number[]): Uint8Array<ArrayBuffer> {
  const len: number[] = [];
  let n = body.length;
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 128;
    len.push(byte);
  } while (n > 0);
  return new Uint8Array([type, ...len, ...body]);
}

export type MessageHandler = (topic: string, payload: Uint8Array, retained: boolean) => void;

export interface MqttOptions {
  url: string;
  keepalive?: number;
  onMessage: MessageHandler;
  onStatus?: (connected: boolean) => void;
}

export class MqttClient {
  private ws: WebSocket | null = null;
  private buf = new Uint8Array(0);
  private subs = new Set<string>();
  private nextId = 1;
  private ping: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1000;
  private closed = false;
  connected = false;

  constructor(private opts: MqttOptions) {
    this.open();
  }

  private open() {
    if (this.closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.url, 'mqtt');
    } catch {
      this.schedule();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      const id = `outpost-${Math.random().toString(36).slice(2, 12)}`;
      const keep = this.opts.keepalive ?? 30;
      // Protocol "MQTT", level 4, clean session, keep-alive.
      ws.send(packet(0x10, [...str('MQTT'), 4, 0x02, keep >> 8, keep & 255, ...str(id)]));
    };
    ws.onmessage = (e) => this.feed(new Uint8Array(e.data as ArrayBuffer));
    ws.onclose = () => this.down();
    ws.onerror = () => ws.close();
  }

  private schedule() {
    if (this.closed || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.open();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, 30_000);
  }

  private down() {
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    this.ws = null;
    if (this.connected) {
      this.connected = false;
      this.opts.onStatus?.(false);
    }
    this.schedule();
  }

  private feed(chunk: Uint8Array) {
    const all = new Uint8Array(this.buf.length + chunk.length);
    all.set(this.buf);
    all.set(chunk, this.buf.length);
    let at = 0;
    for (;;) {
      if (all.length - at < 2) break;
      let len = 0;
      let mul = 1;
      let i = at + 1;
      let byte: number;
      do {
        if (i >= all.length) {
          this.buf = all.slice(at);
          return;
        }
        byte = all[i++];
        len += (byte & 127) * mul;
        mul *= 128;
      } while (byte & 128);
      if (i + len > all.length) break;
      this.handle(all[at], all.subarray(i, i + len));
      at = i + len;
    }
    this.buf = all.slice(at);
  }

  private handle(header: number, body: Uint8Array) {
    const type = header >> 4;
    if (type === 2) {
      // CONNACK
      if (body[1] !== 0) {
        this.ws?.close();
        return;
      }
      this.connected = true;
      this.backoff = 1000;
      for (const t of this.subs) this.sendSubscribe(t);
      const keep = (this.opts.keepalive ?? 30) * 1000;
      this.ping = setInterval(() => this.ws?.send(new Uint8Array([0xc0, 0])), keep * 0.8);
      this.opts.onStatus?.(true);
    } else if (type === 3) {
      // PUBLISH
      const qos = (header >> 1) & 3;
      const tlen = (body[0] << 8) | body[1];
      const topic = new TextDecoder().decode(body.subarray(2, 2 + tlen));
      let at = 2 + tlen;
      if (qos > 0) {
        const id = [body[at], body[at + 1]];
        at += 2;
        if (qos === 1) this.ws?.send(new Uint8Array([0x40, 2, ...id]));
      }
      this.opts.onMessage(topic, body.slice(at), (header & 1) === 1);
    }
  }

  private sendSubscribe(topic: string) {
    const id = this.nextId++ & 0xffff || 1;
    this.ws?.send(packet(0x82, [id >> 8, id & 255, ...str(topic), 0]));
  }

  /** Reconnects straight away if the connection is down (the app came back to the front, or the network came back). */
  wake() {
    if (this.closed || this.ws) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.backoff = 1000;
    this.open();
  }

  subscribe(topic: string) {
    if (this.subs.has(topic)) return;
    this.subs.add(topic);
    if (this.connected) this.sendSubscribe(topic);
  }

  unsubscribe(topic: string) {
    if (!this.subs.delete(topic) || !this.connected) return;
    const id = this.nextId++ & 0xffff || 1;
    this.ws?.send(packet(0xa2, [id >> 8, id & 255, ...str(topic)]));
  }

  /** Sends at QoS 0. Returns false when not connected (the caller retries on reconnect). */
  publish(topic: string, payload: Uint8Array, retain = false): boolean {
    if (!this.connected || !this.ws) return false;
    this.ws.send(packet(0x30 | (retain ? 1 : 0), [...str(topic), ...payload]));
    return true;
  }

  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.ping) clearInterval(this.ping);
    try {
      this.ws?.send(new Uint8Array([0xe0, 0]));
    } catch {
      /* ignore */
    }
    this.ws?.close();
  }
}
