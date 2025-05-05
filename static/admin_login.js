// Admin giriş yöneticisi
document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.getElementById('login-form');
  
  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      // Form verisini oluştur
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      
      // POST isteği gönder
      fetch('/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString(),
        credentials: 'include' // Çerezleri dahil et
      })
      .then(response => {
        if (response.redirected) {
          window.location.href = response.url;
        } else {
          return response.text();
        }
      })
      .then(html => {
        if (html) {
          // Sayfa içeriğini güncelle
          document.open();
          document.write(html);
          document.close();
        }
      })
      .catch(error => {
        console.error('Giriş hatası:', error);
        alert('Giriş yapılırken bir hata oluştu.');
      });
    });
  }
});
