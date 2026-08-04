// Gözde Pide Admin - Sipariş Bildirim Sistemi
(function() {
  let lastOrderCount = 0;
  let knownOrderIds = new Set();
  let soundEnabled = localStorage.getItem('admin_sound') !== 'false';
  let polling = false;
  let initialized = false;

  // Toast container oluştur
  function ensureToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  // Bildirim sesi (Web Audio API ile short beep)
  function playSound() {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
      // İkinci beep
      setTimeout(() => {
        const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
        const osc2 = ctx2.createOscillator();
        const gain2 = ctx2.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx2.destination);
        osc2.frequency.value = 1100;
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.3, ctx2.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx2.currentTime + 0.4);
        osc2.start(ctx2.currentTime);
        osc2.stop(ctx2.currentTime + 0.4);
      }, 300);
    } catch (e) {
      console.log('Ses çalınamadı:', e);
    }
  }

  // Toast göster
  function showToast(title, text) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML =
      '<div class="toast-icon">🔔</div>' +
      '<div class="toast-body">' +
        '<div class="toast-title">' + title + '</div>' +
        '<div class="toast-text">' + text + '</div>' +
      '</div>' +
      '<span class="toast-close">&times;</span>';
    toast.querySelector('.toast-close').addEventListener('click', function() {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    });
    container.appendChild(toast);
    // 8 saniye sonra otomatik kapat
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
      }
    }, 8000);
  }

  // Tarayıcı bildirimi
  function showBrowserNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: '/static/favicon.ico',
        tag: 'new-order'
      });
    }
  }

  // Bildirim izni iste
  function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // Badge güncelle
  function updateBadge(count) {
    const badge = document.getElementById('bell-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Zili titret
  function shakeBell() {
    const bell = document.getElementById('nav-bell');
    if (!bell) return;
    bell.classList.add('active');
    setTimeout(() => bell.classList.remove('active'), 500);
  }

  // Yeni siparişleri kontrol et
  async function checkNewOrders() {
    if (polling) return;
    polling = true;
    try {
      const res = await fetch('/api/orders?status=pending', { credentials: 'include' });
      if (res.status === 401) return;
      const orders = await res.json();
      if (!Array.isArray(orders)) return;

      const currentOrderIds = new Set(orders.map(o => o.id));
      const newOrders = [];

      if (!initialized) {
        // İlk yüklemede sadece sayıyı ayarla, bildirim gönderme
        knownOrderIds = currentOrderIds;
        lastOrderCount = orders.length;
        initialized = true;
        updateBadge(orders.length);
        return;
      }

      // Yeni siparişleri bul
      currentOrderIds.forEach(id => {
        if (!knownOrderIds.has(id)) {
          const order = orders.find(o => o.id === id);
          if (order) newOrders.push(order);
        }
      });

      // Bilinen siparişleri güncelle
      knownOrderIds = currentOrderIds;
      updateBadge(orders.length);

      if (newOrders.length > 0) {
        shakeBell();
        playSound();
        newOrders.forEach(order => {
          const title = 'Yeni Sipariş!';
          const userName = order.user ? (order.user.full_name || order.user.phone || 'Müşteri') : 'Müşteri';
          const total = parseFloat(order.total) || 0;
          const text = '#' + (order.id || '').substring(0, 8) + ' - ' + userName + ' - ' + total + ' TL';
          showToast(title, text);
          showBrowserNotification(title, text);
        });
      }

      lastOrderCount = orders.length;
    } catch (err) {
      console.log('Bildirim kontrol hatası:', err);
    } finally {
      polling = false;
    }
  }

  // Ses toggle
  function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('admin_sound', soundEnabled ? 'true' : 'false');
    updateSoundToggle();
    if (soundEnabled) playSound();
  }

  function updateSoundToggle() {
    const toggle = document.getElementById('sound-toggle');
    if (!toggle) return;
    toggle.textContent = soundEnabled ? '🔊' : '🔇';
    toggle.title = soundEnabled ? 'Sesi kapat' : 'Sesi aç';
  }

  // Navbar'a zil ve ses toggle ekle
  function injectNavbarItems() {
    const navbar = document.querySelector('.admin-navbar');
    if (!navbar) return;
    const logout = navbar.querySelector('.nav-logout');
    if (!logout) return;

    // Zil
    const bell = document.createElement('div');
    bell.id = 'nav-bell';
    bell.className = 'nav-bell';
    bell.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
        '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
      '</svg>' +
      '<span id="bell-badge" class="bell-badge hidden">0</span>';
    bell.addEventListener('click', function() {
      window.location.href = '/admin/orders';
    });
    navbar.insertBefore(bell, logout);

    // Ses toggle
    const soundToggle = document.createElement('div');
    soundToggle.id = 'sound-toggle';
    soundToggle.className = 'nav-sound-toggle';
    soundToggle.addEventListener('click', toggleSound);
    navbar.insertBefore(soundToggle, logout);
    updateSoundToggle();
  }

  // Başlat
  function init() {
    injectNavbarItems();
    requestNotificationPermission();
    ensureToastContainer();
    checkNewOrders();
    // 15 saniyede bir kontrol et
    setInterval(checkNewOrders, 15000);
  }

  // DOM ready bekle
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
