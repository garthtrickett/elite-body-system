import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "node:net";
import { once } from "node:events";
import { startTestApp } from "./support/app.ts";

test("test app teardown releases an unfinished browser HTTP connection", { timeout: 5000 }, async () => {
  const app = await startTestApp();
  const accepted = once(app.server, "connection");
  const socket = connect({ host: "127.0.0.1", port: Number(new URL(app.origin).port) });
  try {
    await once(socket, "connect");
    await accepted;
    socket.write("GET /sign-in HTTP/1.1\r\nHost: localhost\r\n");
    const disconnected = once(socket, "close");
    await app.close();
    await disconnected;
    assert.equal(socket.destroyed, true);
    assert.equal(app.server.listening, false);
  } finally { socket.destroy(); if (app.server.listening) await app.close(); }
});
