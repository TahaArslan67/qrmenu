// Vercel API rotası
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');

// MongoDB bağlantısı
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://arslantaha67:0022800228t@panel.gjn1k.mongodb.net:27017/?retryWrites=true&w=majority';

// HTML şablonları
const menuTemplate = fs.readFileSync(path.join(__dirname, '../templates/menu.html'), 'utf8');
const adminTemplate = fs.readFileSync(path.join(__dirname, '../templates/admin.html'), 'utf8');
const loginTemplate = fs.readFileSync(path.join(__dirname, '../templates/login.html'), 'utf8');

// MongoDB bağlantısı kurma fonksiyonu
async function connectToDatabase() {
  const client = await MongoClient.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  return client.db('qrmenu');
}

// Ana sayfa
async function renderMenu() {
  try {
    const db = await connectToDatabase();
    const categories = await db.collection('categories').find({}).toArray();
    const items = await db.collection('items').find({}).toArray();
    
    // Ürünlere resim URL'si ekle
    items.forEach(item => {
      const imgBase = item.name.toLowerCase().replace(/ /g, '_');
      item.img_url = `/static/uploads/${imgBase}.jpg`;
    });
    
    // HTML şablonunu doldur
    let html = menuTemplate;
    
    // Kategorileri ve ürünleri ekle
    let categoriesHtml = '';
    categories.forEach(category => {
      categoriesHtml += `<div class="menu-section-title" data-category="${category.name}">${category.name}</div>`;
      categoriesHtml += '<ul class="menu-list">';
      
      items.forEach(item => {
        if (String(item.category_id) === String(category._id)) {
          categoriesHtml += `
            <li class="menu-item-row">
                <div class="menu-item-info">
                    <span class="menu-item-name">${item.name}</span>
                </div>
                <span class="menu-item-price">${item.price.toFixed(0)} ₺</span>
                <img src="${item.img_url}" class="menu-img-thumb" alt="${item.name}">
            </li>
          `;
        }
      });
      
      categoriesHtml += '</ul>';
    });
    
    // HTML içine kategorileri yerleştir
    html = html.replace('{% for category in categories %}', '')
               .replace('{% endfor %}', '')
               .replace('{{ category[\'name\'] }}', '')
               .replace('{{ category[\'_id\'] }}', '')
               .replace('{% for item in items %}', '')
               .replace('{% endfor %}', '')
               .replace('{% if item[\'category_id\'] == category[\'_id\'] %}', '')
               .replace('{% endif %}', '');
    
    // Kategorileri HTML içine yerleştir
    html = html.replace('<div class="menu-section">', `<div class="menu-section">${categoriesHtml}`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      },
      body: html
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: `Hata: ${error.message}`
    };
  }
}

// API handler
module.exports = async (req, res) => {
  const { method, url } = req;
  
  // Ana sayfa
  if (url === '/' || url === '/index.html') {
    const result = await renderMenu();
    res.statusCode = result.statusCode;
    
    if (result.headers) {
      Object.keys(result.headers).forEach(key => {
        res.setHeader(key, result.headers[key]);
      });
    }
    
    res.end(result.body);
    return;
  }
  
  // Statik dosyalar
  if (url.startsWith('/static/')) {
    try {
      const filePath = path.join(__dirname, '..', url);
      const data = fs.readFileSync(filePath);
      
      // MIME tipini belirle
      let contentType = 'text/plain';
      if (url.endsWith('.css')) contentType = 'text/css';
      if (url.endsWith('.js')) contentType = 'application/javascript';
      if (url.endsWith('.jpg') || url.endsWith('.jpeg')) contentType = 'image/jpeg';
      if (url.endsWith('.png')) contentType = 'image/png';
      if (url.endsWith('.svg')) contentType = 'image/svg+xml';
      
      res.setHeader('Content-Type', contentType);
      res.statusCode = 200;
      res.end(data);
      return;
    } catch (error) {
      res.statusCode = 404;
      res.end('Dosya bulunamadı');
      return;
    }
  }
  
  // Sayfa bulunamadı
  res.statusCode = 404;
  res.end('Sayfa bulunamadı');
};
