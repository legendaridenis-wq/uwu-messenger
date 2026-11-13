const socket = io();
let me = null, allUsers = {}, allChats = [], currentChatId = 'general', currentFilter = 'all', createType = 'channel', viewedUser = null;

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

function handleFile(input, targetId) {
  const file = input.files;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 200;
      canvas.getContext('2d').drawImage(img, 0, 0, 200, 200);
      document.getElementById(targetId).value = canvas.toDataURL('image/jpeg', 0.8);
      alert('Фото выбрано! Нажмите кнопку сохранения.');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

socket.on('connect', () => {
  const savedPhone = localStorage.getItem('crushx_phone');
  if (savedPhone) socket.emit('auto_login', { phone: savedPhone });
});

socket.on('need_login', () => {
  localStorage.removeItem('crushx_phone');
  document.getElementById('auth-screen').style.display = 'flex';
});

function sendPhoneCode() { socket.emit('request_code', { phone: document.getElementById('reg-phone').value.trim() }); }
socket.on('auth_error', (msg) => alert(msg));

socket.on('code_sent', ({ phone, code, isNew }) => {
  document.getElementById('step-phone').style.display = 'none';
  document.getElementById('step-code').style.display = 'block';
  document.getElementById('auth-subtitle').textContent = 'Код отправлен на ' + phone;
  document.getElementById('new-user-fields').style.display = isNew ? 'block' : 'none';
  const toast = document.getElementById('sms-toast');
  toast.innerHTML = '📩 <b>CrushX:</b> Ваш код входа: <b style="color:#40a7e3;font-size:18px">' + code + '</b>';
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 15000);
});

function confirmCode() {
  socket.emit('verify_code', {
    phone: document.getElementById('reg-phone').value.trim(),
    code: document.getElementById('reg-code').value.trim(),
    name: document.getElementById('reg-name').value.trim(),
    avatar: document.getElementById('reg-avatar-data').value
  });
}

function resetAuth() {
  document.getElementById('step-phone').style.display = 'block';
  document.getElementById('step-code').style.display = 'none';
  document.getElementById('auth-subtitle').textContent = 'Введите ваш номер телефона';
}

function logout() { localStorage.removeItem('crushx_phone'); location.reload(); }

socket.on('init_data', d => {
  me = d.me; allUsers = d.users; allChats = d.chats;
  localStorage.setItem('crushx_phone', me.phone);
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('sms-toast').style.display = 'none';
  if (me.isOwner) document.getElementById('drawer-admin-row').style.display = 'flex';
  updateMyPanel(); renderChats(); openChat(currentChatId, false, true);
});

socket.on('state_update', d => {
  allUsers = d.users; allChats = d.chats;
  if (me && allUsers[me.id]) { me = allUsers[me.id]; updateMyPanel(); }
  renderChats(); openChat(currentChatId, true, true); updateAdminSelect();
});

socket.on('open_chat_now', ({ chatId }) => {
  closeModal('contacts-modal');
  closeModal('profile-modal');
  openChat(chatId);
  document.getElementById('main-chat').classList.add('mob-open');
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
  document.getElementById('d-phone').textContent = me.phone + ' • @' + me.username;
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
  ['all', 'dm', 'group', 'channel'].forEach(t => document.getElementById('tab-' + t)?.classList.toggle('active', t === type));
  renderChats();
}

function getChatDisplay(c) {
  if (c.type === 'dm' && c.members) {
    const otherId = c.members.find(id => id !== me?.id) || me?.id;
    const other = allUsers[otherId];
    if (other) return { name: other.name + (other.verified ? ' ☑️' : ''), avatar: other.avatar, fallback: other.name.charAt(0).toUpperCase(), desc: '@' + other.username };
  }
  return { name: c.name, avatar: c.avatar, fallback: '💬', desc: c.desc || '' };
}

function renderChats() {
  const list = document.getElementById('chat-list');
  if (!list) return;
  const q = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  list.innerHTML = '';
  allChats.filter(c => {
    if (c.type === 'saved' && c.ownerId !== me?.id) return false;
    if (c.type === 'dm' && !c.members?.includes(me?.id)) return false;
    const disp = getChatDisplay(c);
    return (currentFilter === 'all' || c.type === currentFilter) && disp.name.toLowerCase().includes(q);
  }).forEach(c => {
    const disp = getChatDisplay(c);
    const div = el('div', 'chat-item' + (c.id === currentChatId ? ' active' : ''));
    const av = el('div', 'avatar'); setAvatar(av, disp.avatar, disp.fallback);
    const info = el('div', 'chat-info');
    const last = c.messages[c.messages.length - 1];
    info.append(el('div', 'chat-title', disp.name), el('div', 'chat-preview', last ? (last.sender + ': ' + last.text) : 'Нет сообщений'));
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
  const disp = getChatDisplay(chat);
  document.getElementById('current-chat-name').textContent = disp.name;
  document.getElementById('current-chat-desc').textContent = disp.desc;
  setAvatar(document.getElementById('header-chat-avatar'), disp.avatar, disp.fallback);
  const canEdit = (chat.type !== 'dm') && (me?.isOwner || chat.ownerId === me?.id);
  document.getElementById('edit-chat-btn').style.display = canEdit ? 'block' : 'none';
  const canWrite = (chat.type !== 'channel') || canEdit;
  document.getElementById('input-area').style.display = canWrite ? 'flex' : 'none';
  const box = document.getElementById('messages');
  box.innerHTML = '';
  chat.messages.forEach(m => {
    const u = allUsers[m.userId];
    const badge = u && u.verified ? ' ☑️' : '';
    const stars = u && u.stars > 0 ? ' ⭐' + u.stars : '';
    const row = el('div', 'msg-row' + (m.userId === me.id ? ' mine' : ''));
    const av = el('div', 'avatar msg-av');
    setAvatar(av, u ? u.avatar : '', (m.sender || '?').charAt(0).toUpperCase());
    if (u) av.onclick = () => viewProfile(u.id);
    const bubble = el('div', 'msg');
    const sender = el('div', 'msg-sender', m.sender + badge + ' (@' + m.username + ')' + stars);
    if (u) sender.onclick = () => viewProfile(u.id);
    bubble.append(sender, el('div', 'msg-body', m.text), el('div', 'msg-time', m.time));
    row.append(av, bubble);
    box.appendChild(row);
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

function openContactsModal() {
  const list = document.getElementById('contacts-list');
  list.innerHTML = '';
  (me.contacts || []).forEach(cid => {
    const u = allUsers[cid];
    if (!u) return;
    const item = el('div', 'chat-item');
    const av = el('div', 'avatar'); av.style.cssText = 'width:38px;height:38px;font-size:15px';
    setAvatar(av, u.avatar, u.name.charAt(0).toUpperCase());
    const info = el('div', 'chat-info');
    info.append(el('div', 'chat-title', u.name), el('div', 'chat-preview', '@' + u.username + ' • ' + u.phone));
    item.append(av, info);
    item.onclick = () => socket.emit('start_dm', { query: u.username });
    list.appendChild(item);
  });
  document.getElementById('contacts-modal').style.display = 'flex';
}

function findAndMessageFriend() {
  const q = document.getElementById('friend-query').value.trim();
  if (q) socket.emit('start_dm', { query: q });
}

function openCreateModal(type) {
  createType = type;
  document.getElementById('create-modal-title').textContent = type === 'channel' ? '📢 Новый канал' : '👥 Новая группа';
  document.getElementById('new-chat-name').value = '';
  document.getElementById('new-chat-avatar').value = '';
  document.getElementById('new-chat-desc').value = '';
  document.getElementById('create-chat-modal').style.display = 'flex';
}

function submitCreateChat() {
  const name = document.getElementById('new-chat-name').value.trim();
  if (!name) return alert('Введите название!');
socket.emit('create_chat', { chatType: createType, name, avatar: document.getElementById('new-chat-avatar').value, desc: document.getElementById('new-chat-desc').value });
closeModal('create-chat-modal');
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
socket.emit('edit_chat', { chatId: currentChatId, name: document.getElementById('edit-chat-name').value, avatar: document.getElementById('edit-chat-avatar').value, desc: document.getElementById('edit-chat-desc').value });
closeModal('chat-settings-modal');
}
function deleteCurrentChat() {
if (confirm('Удалить этот чат/канал?')) { socket.emit('edit_chat', { chatId: currentChatId, deleteChat: true }); closeModal('chat-settings-modal'); }
}
function viewProfile(userId) {
const u = allUsers[userId];
if (!u) return;
viewedUser = u;
document.getElementById('p-name').textContent = u.name + (u.verified ? ' ☑️' : '');
document.getElementById('p-username').textContent = '@' + u.username + ' • ' + u.phone;
document.getElementById('p-stars').textContent = '⭐ ' + u.stars;
document.getElementById('p-gifts-count').textContent = '🎁 ' + u.gifts.length;
setAvatar(document.getElementById('p-avatar'), u.avatar, u.name.charAt(0).toUpperCase());
document.getElementById('p-dm-btn').style.display = (u.id !== me.id) ? 'block' : 'none';
const gBox = document.getElementById('p-gifts'); gBox.innerHTML = '';
if (u.gifts.length) {
u.gifts.forEach(g => {
const parts = g.split(' ');
const card = el('div', 'gift-card');
card.append(el('div', 'gift-emoji', parts[0]), el('div', 'gift-label', parts.slice(1).join(' ') || 'Подарок'));
gBox.appendChild(card);
});
} else { gBox.appendChild(el('span', '', 'Пока нет подарков')); }
const editBox = document.getElementById('my-profile-edit');
if (u.id === me.id) {
editBox.style.display = 'block';
document.getElementById('edit-my-name').value = me.name;
document.getElementById('edit-my-user').value = me.username;
document.getElementById('edit-my-avatar').value = me.avatar || '';
} else { editBox.style.display = 'none'; }
document.getElementById('profile-modal').style.display = 'flex';
}
function dmFromProfile() { if (viewedUser) socket.emit('start_dm', { query: viewedUser.username }); }
function saveMyProfile() {
socket.emit('update_profile', { name: document.getElementById('edit-my-name').value, username: document.getElementById('edit-my-user').value, avatar: document.getElementById('edit-my-avatar').value });
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
const opt = el('option', '', u.name + ' (' + u.phone + ') — ⭐' + u.stars);
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
