// Blur-up: Gerçek resim yüklenince bulanık resmi gizle
window.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.img-real').forEach(function(img) {
    img.addEventListener('load', function() {
      img.classList.add('loaded');
    });
    // Eğer resim cache'den geldiyse hemen loaded ekle
    if (img.complete) {
      img.classList.add('loaded');
    }
  });
});
