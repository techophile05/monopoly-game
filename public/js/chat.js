// ============================================================
// MONOPOLY INDIA - Chat & Log UI
// ============================================================

let chatSocket = null;
let chatRoomId = null;

function bindChat(socket, roomId) {
  chatSocket = socket;
  chatRoomId = roomId;
}

function addChatMessage({ playerName, playerColor, message }) {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-msg';
  el.innerHTML = `
    <span class="msg-author" style="color:${playerColor}">${playerName}:</span>
    <span class="msg-text">${message}</span>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function addSystemMessage(message) {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-msg system';
  el.innerHTML = `<span class="msg-icon">•</span>${message}`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function addLogMessage(message) {
  const container = document.getElementById('log-messages');
  const el = document.createElement('div');
  el.className = 'chat-msg system';
  el.innerHTML = `<span class="msg-icon">•</span>${message}`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

// Chat tabs
document.querySelectorAll('.chat-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isChat = tab.dataset.chatTab === 'chat';
    document.getElementById('chat-messages').style.display = isChat ? 'block' : 'none';
    document.getElementById('log-messages').style.display = isChat ? 'none' : 'block';
  });
});

// Send chat
function sendChat() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message || !chatSocket || !chatRoomId) return;
  chatSocket.emit('chat_message', { roomId: chatRoomId, message });
  input.value = '';
}

document.getElementById('btn-send-chat').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

window.bindChat = bindChat;
window.addChatMessage = addChatMessage;
window.addSystemMessage = addSystemMessage;
window.addLogMessage = addLogMessage;
