const express = require('express');
const path = require('path');
const apiHandler = require('./api/index');
const fs = require('fs');

const app = express();
const PORT = 3001;

// İlk önce statik dosyaları servis et
// (Statik dosyalar için tüm yolları dene)
app.use('/static', express.static(path.join(__dirname, 'static')));

// API isteklerini işle
app.use((req, res, next) => {
  console.log(`İstek alındı: ${req.method} ${req.url}`);
  
  // API isteklerini işleyen handler
  apiHandler(req, res);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`QR Menü sunucusu http://localhost:${PORT} ve ağ üzerinden ${PORT} portunda çalışıyor`);
  console.log(`Uygulamayı tarayıcıda açmak için: http://localhost:${PORT}`);
});
