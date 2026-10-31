// GraphQL subscriptions over a WebSocket (the graphql-transport-ws protocol, as Arcanist speaks it): one connection
// for the page, opened when the first subscription starts, with the session's token in connection_init (none for a
// visitor without an account). It reconnects with a growing wait and subscribes again.
import { session } from "./client";

type Handler = (data: unknown) => void;

interface Subscription {
  query: string;
  variables: Record<string, unknown>;
  handler: Handler;
}

let socket: WebSocket | null = null;
let ready = false;
let retry = 0;
let nextId = 1;
const subscriptions = new Map<string, Subscription>();
let reconnecting: number | null = null;

function connect(): void {
  if (socket || subscriptions.size === 0) return;
  const url = new URL("/graphql", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(url, "graphql-transport-ws");
  socket = ws;
  ready = false;
  ws.onopen = () => {
    const token = session.token;
    ws.send(JSON.stringify({ type: "connection_init", payload: token ? { Authorization: `Bearer ${token}` } : {} }));
  };
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { type: string; id?: string; payload?: { data?: unknown } };
    switch (message.type) {
      case "connection_ack":
        ready = true;
        retry = 0;
        for (const [id, subscription] of subscriptions) send(id, subscription);
        break;
      case "next":
        if (message.id) subscriptions.get(message.id)?.handler(message.payload?.data);
        break;
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    ready = false;
    if (subscriptions.size > 0 && reconnecting === null) {
      const wait = Math.min(30_000, 1000 * 2 ** retry++);
      reconnecting = window.setTimeout(() => {
        reconnecting = null;
        connect();
      }, wait);
    }
  };
}

function send(id: string, subscription: Subscription): void {
  socket?.send(JSON.stringify({ id, type: "subscribe", payload: { query: subscription.query, variables: subscription.variables } }));
}

/** Starts a subscription; the function it returns stops it. */
export function subscribe<T>(query: string, variables: Record<string, unknown>, handler: (data: T) => void): () => void {
  const id = String(nextId++);
  const subscription: Subscription = { query, variables, handler: handler as Handler };
  subscriptions.set(id, subscription);
  if (!socket) connect();
  else if (ready) send(id, subscription);
  return () => {
    subscriptions.delete(id);
    if (ready) socket?.send(JSON.stringify({ id, type: "complete" }));
    if (subscriptions.size === 0) {
      socket?.close();
      socket = null;
    }
  };
}

/** Signs the connection in again (after signing in or out): it reconnects with the current session. */
export function renewLiveSession(): void {
  const old = socket;
  socket = null;
  old?.close();
  connect();
}
