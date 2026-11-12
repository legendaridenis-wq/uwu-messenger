const socket = io();
let me = null, allUsers = {}, allChats = [], currentChatId = 'general', currentFilter = 'all';

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

function handleFile(input, targetId) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      document.getElementById(targetId).value = canvas.toDataURL('image/jpeg', 0.8);
      alert('Фото выбрано! Нажмите кнопку сохранения.');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

socket.on('connect', () => {
  const saved = localStorage.getItem('crushx_auth');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.name && data.username) socket.emit('register', data);
    } catch (e) {}
  }
});

function login() {
  const name = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-user').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const avatar = document.getElementById('reg-avatar-data').value;
  const secret = document.getElementById('reg-secret').value.trim();
  if (!name || !username) return alert('Введите имя и юзернейм!');
  const authData = { name, username, avatar: '', secret };
  localStorage.setItem('crushx_auth', JSON.stringify(authData));
  socket.emit('register', { name, username, avatar, secret });
}

function logout() { localStorage.removeItem('crushx_auth'); location.reload(); }

socket.on('init_data', d => {
  me = d.me; allUsers = d.users; allChats = d.chats;
  document.getElementById('auth-screen').style.display = 'none';
  if (me.isOwner) document.getElementById('drawer-admin-row').style.display = 'flex';
  updateMyPanel(); renderChats(); openChat(currentChatId, false, true);
});

socket.on('state_update', d => {
  allUsers = d.users; allChats = d.chats;
  if (me && allUsers[me.id]) { me = allUsers[me.id]; updateMyPanel(); }
  renderChats(); openChat(currentChatId, true, true); updateAdminSelect();
});

function setAvatar(box, src, fallback) {
  if (!box) return;
  box.innerHTML = '';
  if (src && (src.startsWith('http') || src.startsWith('data:image'))) {
    const img = el('img'); img.src = src; box.appendChild(img);
  } else { box.textContent = src || fallback; }
}

function updateMyPanel() {
  const title = me.name + (me.verified ? ' ☑️' : '') + (me.emojiStatus ? ' ' + me.emojiStatus : '');
  document.getElementById('d-name').textContent = title;
  document.getElementById('d-stars').textContent = '⭐ ' + me.stars + ' звезд';
  setAvatar(document.getElementById('d-avatar'), me.avatar, me.name.charAt(0).toUpperCase());
  setAvatar(document.getElementById('top-avatar'), me.avatar, me.name.charAt(0).toUpperCase());
}

function toggleDrawer() {
  const d = document.getElementById('drawer'), o = document.getElementById('drawer-overlay');
  o.style.display = d.classList.toggle('open') ? 'block' : 'none';
}

function toggleTheme() { document.body.classList.toggle('light'); }

function setEmojiStatus() {
  const s = prompt('Введите эмодзи-статус (например: 👑, 🔥, 💎):');
  if (s !== null) socket.emit('update_profile', { emojiStatus: s.trim() });
}

function filterChats(type) {
  currentFilter = type;
  ['all', 'group', 'channel'].forEach(t => document.getElementById('tab-' + t)?.classList.toggle('active', t === type));
  renderChats();
}

function renderChats() {
  const list = document.getElementById('chat-list');
  if (!list) return;
  const q = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  list.innerHTML = '';
  allChats.filter(c => {
    if (c.type === 'saved' && c.ownerId !== me?.id) return false;
    return (currentFilter === 'all' || c.type === currentFilter) && c.name.toLowerCase().includes(q);
  }).forEach(c => {
    const div = el('div', 'chat-item' + (c.id === currentChatId ? ' active' : ''));
    const av = el('div', 'avatar'); setAvatar(av, c.avatar, '💬');
    const info = el('div', 'chat-info');
    const last = c.messages[c.messages.length - 1];
    info.append(el('div', 'chat-title', c.name), el('div', 'chat-preview', last ? (last.sender + ': ' + last.text) : 'Нет сообщений'));
    div.append(av, info);
    div.onclick = () => { openChat(c.id); document.getElementById('main-chat').classList.add('mob-open'); };
    list.appendChild(div);
  });
}

function closeMobileChat() { document.getElementById('main-chat').classList.remove('mob-open'); }

function openChat(chatId, keepScroll = false, silent = false) {
  const chat = allChats.find(c => c.id === chatId) || allChats[0];
  if (!chat) return;
  currentChatId = chat.id;
  document.getElementById('current-chat-name').textContent = chat.name;
  document.getElementById('current-chat-desc').textContent = chat.desc || '';
  setAvatar(document.getElementById('header-chat-avatar'), chat.avatar, '💬');
  document.getElementById('edit-chat-btn').style.display = (me?.isOwner || chat.ownerId === me?.id) ? 'block' : 'none';
  document.getElementById('input-area').style.display = (chat.type === 'channel' && !me.isOwner) ? 'none' : 'flex';
  const box = document.getElementById('messages');
  box.innerHTML = '';
  chat.messages.forEach(m => {
    const u = allUsers[m.userId];
    const badge = u && u.verified ? ' ☑️' : '';
    const stars = u && u.stars > 0 ? ' ⭐' + u.stars : '';
    const div = el('div', 'msg' + (m.userId === me.id ? ' mine' : ''));
    const sender = el('div', 'msg-sender', m.sender + badge + ' (@' + m.username + ')' + stars);
    sender.onclick = () => viewProfile(m.userId);
    div.append(sender, el('div', 'msg-body', m.text), el('div', 'msg-time', m.time));
    box.appendChild(div);
  });
  if (!keepScroll) box.scrollTop = box.scrollHeight;
  if (!silent) renderChats();
}

function sendMsg() {
  const inp = document.getElementById('msg-input');
  if (!inp.value.trim()) return;
  socket.emit('send_message', { chatId: currentChatId, text: inp.value.trim() });
  inp.value = '';
}

function createChatPrompt(type) {
  const n = prompt(type === 'channel' ? 'Название канала:' : 'Название группы:');
  if (n) socket.emit('admin_action', { action: 'channel', chatType: type, name: n });
}

function openSaved() { openChat('saved_' + me.id); document.getElementById('main-chat').classList.add('mob-open'); }

function openChatSettings() {
  const chat = allChats.find(c => c.id === currentChatId);
  if (!chat) return;
  document.getElementById('edit-chat-name').value = chat.name;
  document.getElementById('edit-chat-avatar').value = chat.avatar;
  document.getElementById('edit-chat-desc').value = chat.desc || '';
  document.getElementById('chat-settings-modal').style.display = 'flex';
}

function saveChatSettings() {
  socket.emit('edit_chat', {
    chatId: currentChatId,
    name: document.getElementById('edit-chat-name').value,
    avatar: document.getElementById('edit-chat-avatar').value,
    desc: document.getElementById('edit-chat-desc').value
  });
  closeModal('chat-settings-modal');
}

function deleteCurrentChat() {
  if (confirm('Удалить этот чат/канал?')) {
    socket.emit('edit_chat', { chatId: currentChatId, deleteChat: true });
    closeModal('chat-settings-modal');
  }
}

function viewProfile(userId) {
  const u = allUsers[userId];
  if (!u) return;
  document.getElementById('p-name').textContent = u.name + (u.verified ? ' ☑️' : '');
  document.getElementById('p-username').textContent = '@' + u.username;
  document.getElementById('p-stars').textContent = '⭐ ' + u.stars;
  document.getElementById('p-gifts-count').textContent = '🎁 ' + u.gifts.length;
  setAvatar(document.getElementById('p-avatar'), u.avatar, u.name.charAt(0).toUpperCase());
  const gBox = document.getElementById('p-gifts'); gBox.innerHTML = '';
  if (u.gifts.length) u.gifts.forEach(g => gBox.appendChild(el('div', 'gift-badge', g)));
  else gBox.appendChild(el('span', '', 'Пока нет подарков'));
  const editBox = document.getElementById('my-profile-edit');
  if (u.id === me.id) {
    editBox.style.display = 'block';
    document.getElementById('edit-my-name').value = me.name;
    document.getElementById('edit-my-avatar').value = me.avatar || '';
  } else { editBox.style.display = 'none'; }
  document.getElementById('profile-modal').style.display = 'flex';
}

function saveMyProfile() {
  const newName = document.getElementById('edit-my-name').value;
  const newAv = document.getElementById('edit-my-avatar').value;
  const saved = JSON.parse(localStorage.getItem('crushx_auth') || '{}');
  saved.name = newName;
  localStorage.setItem('crushx_auth', JSON.stringify(saved));
  socket.emit('update_profile', { name: newName, avatar: newAv });
  closeModal('profile-modal');
}

function openMyProfile() { if (me) viewProfile(me.id); }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function openAdmin() { updateAdminSelect(); document.getElementById('admin-modal').style.display = 'flex'; }

function updateAdminSelect() {
  const sel = document.getElementById('admin-user-select');
  if (!sel) return;
  const cur = sel.value; sel.innerHTML = '';
  Object.values(allUsers).forEach(u => {
    const opt = el('option', '', u.name + ' (@' + u.username + ') — ⭐' + u.stars);
    opt.value = u.id; sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

function adminGiveStars() { socket.emit('admin_action', { action: 'stars', targetId: document.getElementById('admin-user-select').value, amount: parseInt(document.getElementById('admin-stars-input').value) || 0 }); }
function adminGiveGift() { socket.emit('admin_action', { action: 'gift', targetId: document.getElementById('admin-user-select').value, gift: document.getElementById('admin-gift-select').value }); }
function adminSetUsername() {
const val = document.getElementById('admin-new-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
if (val) socket.emit('admin_action', { action: 'username', targetId: document.getElementById('admin-user-select').value, newUsername: val });
}
function adminVerify() { socket.emit('admin_action', { action: 'verify', targetId: document.getElementById('admin-user-select').value }); }
