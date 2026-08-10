const loginView = document.getElementById('loginView');
const loggedInView = document.getElementById('loggedInView');
const sessionEmail = document.getElementById('sessionEmail');
const statusEl = document.getElementById('status');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

function showLoggedIn(email) {
  loginView.style.display = 'none';
  loggedInView.style.display = 'block';
  sessionEmail.textContent = email;
}

function showLoggedOut() {
  loginView.style.display = 'block';
  loggedInView.style.display = 'none';
}

async function refreshView() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
  if (res.ok && res.email) {
    showLoggedIn(res.email);
  } else {
    showLoggedOut();
  }
}

loginBtn.addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) {
    statusEl.textContent = 'Ingresa email y contraseña';
    return;
  }

  loginBtn.disabled = true;
  statusEl.textContent = 'Iniciando sesión...';

  const res = await chrome.runtime.sendMessage({ type: 'LOGIN', email, password });
  loginBtn.disabled = false;

  if (res.ok) {
    statusEl.textContent = '';
    showLoggedIn(res.email);
  } else {
    statusEl.textContent = res.error || 'Error al iniciar sesión';
  }
});

logoutBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'LOGOUT' });
  showLoggedOut();
});

refreshView();
