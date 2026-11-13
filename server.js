const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6 });

const OWNER_PHONE = "+380000000000";
const OWNER_SECRET = "admin123";

const users = {};
const pendingCodes = {};
let chats = [
  { id: 'general', ownerId: 'sys', name: 'Общий чат CrushX', type: 'group', avatar: '🔥', desc: 'Главный чат сообщества', messages: [
    { userId: 'sys', sender: 'Система', username: 'crushx', text: 'Добро пожаловать в CrushX! Нажмите на аватарку или имя, чтобы открыть профиль или написать в ЛС.', time: 'Сейчас' }
  ]},
  { id: 'news', ownerId: 'sys', name: 'Новости CrushX', type: 'channel', avatar: '📢', desc: 'Официальный канал новостей', messages: [
    { userId: 'sys', sender: 'Владелец', username: 'owner', text: 'Официальный канал проекта.', time: 'Сейчас' }
  ]}
];

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));

io.on('connection', (socket) => {
  socket.on('request_code', ({ phone }) => {
    const clean = phone.replace(/[^0-9+]/g, '');
    if (clean.length < 7) return socket.emit('auth_error', 'Введите корректный номер телефона');
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    pendingCodes[clean] = code;
    const isNew = !users['u_' + clean];
    socket.emit('code_sent', { phone: clean, code, isNew });
  });

  socket.on('verify_code', ({ phone, code, name, avatar }) => {
    const clean = phone.replace(/[^0-9+]/g, '');
    const valid = (pendingCodes[clean] === code) || (code === OWNER_SECRET);
    if (!valid) return socket.emit('auth_error', 'Неверный код подтверждения!');
    delete pendingCodes[clean];

    const id = 'u_' + clean;
    const isOwner = (clean === OWNER_PHONE) || (code === OWNER_SECRET);

    if (!users[id]) {
      const uname = 'user' + clean.slice(-4) + Math.floor(10 + Math.random() * 89);
      users[id] = {
        id, phone: clean,
        name: (name && name.trim()) ? name.trim() : ('Пользователь ' + clean.slice(-4)),
        username: uname,
        avatar: avatar || '',
        isOwner,
        verified: isOwner,
        stars: isOwner ? 9999 : 0,
        gifts: isOwner ? ['👑 Корона', '🧸 Мишка'] : [],
        contacts: [],
        emojiStatus: ''
      };
    } else if (isOwner) {
      users[id].isOwner = true;
    }

    const savedId = 'saved_' + id;
    if (!chats.find(c => c.id === savedId)) {
      chats.unshift({ id: savedId, ownerId: id, name: 'Избранное', type: 'saved', avatar: '🔖', desc: 'Личные заметки', messages: [] });
    }
    socket.userId = id;
    socket.emit('init_data', { me: users[id], users, chats });
    io.emit('state_update', { users, chats });
  });

  socket.on('auto_login', ({ phone }) => {
    const id = 'u_' + phone;
    if (users[id]) {
      socket.userId = id;
      socket.emit('init_data', { me: users[id], users, chats });
    } else {
      socket.emit('need_login');
    }
  });

  // Добавление контакта и открытие личного чата (ЛС) по @юзернейму или номеру
  socket.on('start_dm', ({ query }) => {
    const u = users[socket.userId];
    if (!u || !query) return;
    const q = query.trim().toLowerCase().replace(/^@/, '');
    const target = Object.values(users).find(x =>
      x.id !== u.id && (x.username.toLowerCase() === q || x.phone.replace(/[^0-9]/g, '') === q.replace(/[^0-9]/g, ''))
    );
    if (!target) return socket.emit('auth_error', 'Пользователь с таким @юзернеймом или номером не найден!');

    if (!u.contacts.includes(target.id)) u.contacts.push(target.id);
    if (!target.contacts.includes(u.id)) target.contacts.push(u.id);

    const dmId = 'dm_' + [u.id, target.id].sort().join('_');
    let dmChat = chats.find(c => c.id === dmId);
    if (!dmChat) {
      dmChat = {
        id: dmId,
        type: 'dm',
        members: [u.id, target.id],
        name: target.name,
        avatar: target.avatar,
        desc: '@' + target.username,
        messages: []
      };
      chats.unshift(dmChat);
    }
    io.emit('state_update', { users, chats });
    socket.emit('open_chat_now', { chatId: dmId });
  });

  socket.on('update_profile', ({ name, username, avatar, emojiStatus }) => {
    const u = users[socket.userId];
    if (!u) return;
    if (name && name.trim()) u.name = name.trim();
    if (username && username.trim()) u.username = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (avatar !== undefined) u.avatar = avatar;
    if (emojiStatus !== undefined) u.emojiStatus = emojiStatus;
    io.emit('state_update', { users, chats });
  });

  socket.on('create_chat', ({ chatType, name, avatar, desc }) => {
    const u = users[socket.userId];
    if (!u || !name || !name.trim()) return;
    const cType = chatType === 'group' ? 'group' : 'channel';
    chats.push({
      id: 'c_' + Date.now(),
      ownerId: u.id,
      name: name.trim(),
      type: cType,
      avatar: avatar || (cType === 'group' ? '👥' : '📢'),
      desc: (desc && desc.trim()) ? desc.trim() : (cType === 'group' ? 'Группа' : 'Канал'),
      messages: []
    });
    io.emit('state_update', { users, chats });
  });

  socket.on('edit_chat', ({ chatId, name, avatar, desc, deleteChat }) => {
    const u = users[socket.userId];
    const idx = chats.findIndex(c => c.id === chatId);
    if (!u || idx === -1) return;
    const chat = chats[idx];
    if (!u.isOwner && chat.ownerId !== u.id) return;
    if (deleteChat && chat.id !== 'general' && chat.type !== 'saved') {
      chats.splice(idx, 1);
    } else {
      if (name && name.trim()) chat.name = name.trim();
      if (avatar !== undefined) chat.avatar = avatar;
      if (desc !== undefined) chat.desc = desc.trim();
    }
    io.emit('state_update', { users, chats });
  });

  socket.on('send_message', ({ chatId, text }) => {
    const u = users[socket.userId];
    const chat = chats.find(c => c.id === chatId);
    if (!u || !chat || !text || !text.trim()) return;
    if (chat.type === 'channel' && chat.ownerId !== u.id && !u.isOwner) return;
    if (chat.type === 'saved' && chat.ownerId !== u.id) return;
    if (chat.type === 'dm' && !chat.members.includes(u.id)) return;
    const now = new Date();
    const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    chat.messages.push({ userId: u.id, sender: u.name, username: u.username, text: text.trim(), time });
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
    io.emit('state_update', { users, chats });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('CrushX запущен на порту ' + PORT));
