const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const OWNER_SECRET = "admin123";

const users = {};
const chats = [
  { id: 'general', name: 'Общий чат CrushX', type: 'group', avatar: '🔥', messages: [
    { userId: 'sys', sender: 'Система', username: 'crushx', text: 'Добро пожаловать в CrushX!', time: 'Сейчас' }
  ]},
  { id: 'news', name: 'Новости CrushX', type: 'channel', avatar: '📢', messages: [
    { userId: 'sys', sender: 'Владелец', username: 'owner', text: 'Официальный канал проекта.', time: 'Сейчас' }
  ]}
];

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));

io.on('connection', (socket) => {
  socket.on('register', ({ name, username, avatar, secret }) => {
    const isOwner = (secret === OWNER_SECRET);
    const id = 'u_' + username;
    if (!users[id]) {
      users[id] = {
        id, name, username, avatar, isOwner,
        verified: isOwner,
        stars: isOwner ? 9999 : 0,
        gifts: isOwner ? ['👑 Корона'] : []
      };
    } else if (isOwner) {
      users[id].isOwner = true;
    }
    socket.userId = id;
    socket.emit('init_data', { me: users[id], users, chats });
    io.emit('state_update', { users, chats });
  });

  socket.on('send_message', ({ chatId, text }) => {
    const u = users[socket.userId];
    const chat = chats.find(c => c.id === chatId);
    if (!u || !chat || (chat.type === 'channel' && !u.isOwner)) return;
    const now = new Date();
    const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    chat.messages.push({ userId: u.id, sender: u.name, username: u.username, text, time });
    io.emit('state_update', { users, chats });
  });

  socket.on('admin_action', (data) => {
    const u = users[socket.userId];
    if (!u || !u.isOwner) return;
    const target = users[data.targetId];
    if (data.action === 'stars' && target) target.stars = Math.max(0, target.stars + data.amount);
    if (data.action === 'gift' && target) target.gifts.push(data.gift);
    if (data.action === 'username' && target) target.username = data.newUsername;
    if (data.action === 'verify' && target) target.verified = !target.verified;
    if (data.action === 'channel') {
      chats.push({ id: 'c_' + Date.now(), name: data.name, type: 'channel', avatar: '📢', messages: [] });
    }
    io.emit('state_update', { users, chats });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('CrushX запущен на порту ' + PORT));
