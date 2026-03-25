const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const clients = new Map();

function sendToAll(payload) {
  const json = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(json);
    }
  }
}

function sendOnlineCount() {
  sendToAll({ type: 'online', count: clients.size });
}

wss.on('connection', (ws) => {
  clients.set(ws, { nickname: null });
  sendOnlineCount();

  ws.send(
    JSON.stringify({
      type: 'system',
      text: 'Добро пожаловать! Установи ник, чтобы отправлять сообщения.'
    })
  );

  ws.on('message', (raw) => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', text: 'Невалидный JSON.' }));
      return;
    }

    if (data.type === 'set_nickname') {
      const nickname = String(data.nickname || '').trim().slice(0, 24);

      if (!nickname) {
        ws.send(JSON.stringify({ type: 'error', text: 'Ник не может быть пустым.' }));
        return;
      }

      const prev = clients.get(ws)?.nickname;
      clients.set(ws, { nickname });

      ws.send(JSON.stringify({ type: 'system', text: `Твой ник: ${nickname}` }));

      if (!prev) {
        sendToAll({ type: 'system', text: `${nickname} вошёл(а) в чат.` });
      } else if (prev !== nickname) {
        sendToAll({ type: 'system', text: `${prev} теперь ${nickname}.` });
      }

      return;
    }

    if (data.type === 'message') {
      const clientInfo = clients.get(ws);
      const nickname = clientInfo?.nickname;
      const text = String(data.text || '').trim().slice(0, 500);

      if (!nickname) {
        ws.send(JSON.stringify({ type: 'error', text: 'Сначала установи ник.' }));
        return;
      }

      if (!text) {
        ws.send(JSON.stringify({ type: 'error', text: 'Пустое сообщение не отправляется.' }));
        return;
      }

      sendToAll({
        type: 'message',
        nickname,
        text,
        at: new Date().toISOString()
      });
      return;
    }

    ws.send(JSON.stringify({ type: 'error', text: 'Неизвестный тип события.' }));
  });

  ws.on('close', () => {
    const nickname = clients.get(ws)?.nickname;
    clients.delete(ws);

    if (nickname) {
      sendToAll({ type: 'system', text: `${nickname} вышел(а) из чата.` });
    }

    sendOnlineCount();
  });
});

server.listen(PORT, () => {
  console.log(`Chat server started on http://localhost:${PORT}`);
});
