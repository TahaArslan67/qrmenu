const http = require('http');
const api = require('./api/index');

const PORT = 3001; // 3001 portunu kullanalım - 3000 kullanımda

// Express benzeri bir res.status() fonksiyonu ekleyelim
const server = http.createServer((req, res) => {
  // Express'teki res.status() fonksiyonunu taklit edelim
  res.status = function(code) {
    this.statusCode = code;
    return this;
  };
  
  // Express'teki res.end() davranışını taklit edelim
  const originalEnd = res.end;
  res.end = function(data) {
    return originalEnd.call(this, data);
  };

  api(req, res);
});

server.listen(PORT, () => {
  console.log(`QR Menü sunucusu http://localhost:${PORT} adresinde çalışıyor`);
  console.log('Uygulamayı tarayıcıda açmak için: http://localhost:' + PORT);
});
