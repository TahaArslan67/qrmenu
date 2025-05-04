// Vercel API rotası
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const querystring = require('querystring');
const cookie = require('cookie');

// MongoDB bağlantısı
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://arslantaha67:0022800228t@panel.gjn1k.mongodb.net:27017/?retryWrites=true&w=majority';

// HTML şablonları
const menuTemplate = fs.readFileSync(path.join(__dirname, '../templates/menu.html'), 'utf8');
const adminTemplate = fs.readFileSync(path.join(__dirname, '../templates/admin.html'), 'utf8');
const loginTemplate = fs.readFileSync(path.join(__dirname, '../templates/login.html'), 'utf8');

// Oturum anahtarı
const SESSION_SECRET = 'supersecretkey';

// Basit oturum yönetimi
const sessions = {};

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

// Login sayfası
function renderLogin(message = '') {
  let html = loginTemplate;
  
  // Flash mesajını ekle
  if (message) {
    html = html.replace('<!-- FLASH_MESSAGE -->', `<div class="alert">${message}</div>`);
  }
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    },
    body: html
  };
}

// Admin sayfası
async function renderAdmin(sessionId) {
  // Oturum kontrolü
  if (!sessions[sessionId] || !sessions[sessionId].admin) {
    return {
      statusCode: 302,
      headers: {
        'Location': '/login'
      },
      body: 'Redirecting to login...'
    };
  }
  
  try {
    const db = await connectToDatabase();
    const categories = await db.collection('categories').find({}).toArray();
    const items = await db.collection('items').find({}).toArray();
    
    // HTML şablonunu doldur
    let html = adminTemplate;
    
    // Kategorileri ekle
    let categoriesHtml = '';
    categories.forEach(category => {
      categoriesHtml += `<option value="${category._id}">${category.name}</option>`;
    });
    
    // Kategorileri HTML içine yerleştir
    html = html.replace('{% for category in categories %}', '')
               .replace('{% endfor %}', '')
               .replace('{{ category.name }}', '')
               .replace('{{ category._id }}', '');
    
    html = html.replace('<!-- CATEGORIES_OPTIONS -->', categoriesHtml);
    
    // Ürünleri ekle
    let itemsHtml = '';
    items.forEach(item => {
      let categoryName = 'Bilinmeyen Kategori';
      
      // Kategori ID'sini güvenli bir şekilde kontrol et
      if (item.category_id) {
        const category = categories.find(c => {
          try {
            return c._id.toString() === item.category_id.toString();
          } catch (e) {
            return false;
          }
        });
        
        if (category) {
          categoryName = category.name;
        }
      }
      
      itemsHtml += `
        <tr>
          <td>${item.name}</td>
          <td>${categoryName}</td>
          <td>${parseFloat(item.price).toFixed(0)} ₺</td>
          <td><a href="/delete_item/${item._id}" class="delete-btn">Sil</a></td>
        </tr>
      `;
    });
    
    // Ürünleri HTML içine yerleştir
    html = html.replace('<!-- ITEMS_LIST -->', itemsHtml);
    
    // Kategori listesini ekle
    let categoryListHtml = '';
    categories.forEach(category => {
      categoryListHtml += `
        <tr>
          <td>${category.name}</td>
          <td><a href="/delete_category/${category._id}" class="delete-btn">Sil</a></td>
        </tr>
      `;
    });
    
    // Kategori listesini HTML içine yerleştir
    html = html.replace('<!-- CATEGORIES_LIST -->', categoryListHtml);
    
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

// Login işlemi
async function handleLogin(body) {
  const params = querystring.parse(body);
  const { username, password } = params;
  
  if (username === 'admin' && password === 'admin123') {
    // Oturum oluştur
    const sessionId = crypto.randomBytes(16).toString('hex');
    sessions[sessionId] = { admin: true };
    
    return {
      statusCode: 302,
      headers: {
        'Location': '/admin',
        'Set-Cookie': `sessionId=${sessionId}; Path=/; HttpOnly`
      },
      body: 'Redirecting to admin...'
    };
  } else {
    return renderLogin('Kullanıcı adı veya şifre yanlış!');
  }
}

// Ürün ekleme
async function handleAddItem(body, sessionId) {
  // Oturum kontrolü
  if (!sessions[sessionId] || !sessions[sessionId].admin) {
    return {
      statusCode: 302,
      headers: {
        'Location': '/login'
      },
      body: 'Redirecting to login...'
    };
  }
  
  const params = querystring.parse(body);
  const { name, description, price, category_id } = params;
  
  if (!name || !price || !category_id) {
    return {
      statusCode: 400,
      body: 'Hata: Ürün adı, fiyatı ve kategori gereklidir.'
    };
  }
  
  try {
    const db = await connectToDatabase();
    
    // Kategori ID'si doğrulama
    let categoryObjId;
    try {
      categoryObjId = new ObjectId(category_id);
    } catch (err) {
      return {
        statusCode: 400,
        body: `Hata: Geçersiz kategori ID'si. Lütfen geçerli bir kategori seçin.`
      };
    }
    
    const result = await db.collection('items').insertOne({
      name,
      description: description || '',
      price: parseFloat(price),
      category_id: categoryObjId
    });
    
    return {
      statusCode: 302,
      headers: {
        'Location': '/admin'
      },
      body: 'Redirecting to admin...'
    };
  } catch (error) {
    console.error('Ürün ekleme hatası:', error);
    return {
      statusCode: 500,
      body: `Hata: ${error.message}`
    };
  }
}

// Kategori ekleme
async function handleAddCategory(body, sessionId) {
  // Oturum kontrolü
  if (!sessions[sessionId] || !sessions[sessionId].admin) {
    return {
      statusCode: 302,
      headers: {
        'Location': '/login'
      },
      body: 'Redirecting to login...'
    };
  }
  
  const params = querystring.parse(body);
  const { name } = params;
  
  if (!name) {
    return {
      statusCode: 400,
      body: 'Hata: Kategori adı gereklidir.'
    };
  }
  
  try {
    const db = await connectToDatabase();
    const result = await db.collection('categories').insertOne({ name });
    
    return {
      statusCode: 302,
      headers: {
        'Location': '/admin'
      },
      body: 'Redirecting to admin...'
    };
  } catch (error) {
    console.error('Kategori ekleme hatası:', error);
    return {
      statusCode: 500,
      body: `Hata: ${error.message}`
    };
  }
}

// Ürün silme
async function handleDeleteItem(itemId, sessionId) {
  // Oturum kontrolü
  if (!sessions[sessionId] || !sessions[sessionId].admin) {
    return {
      statusCode: 302,
      headers: {
        'Location': '/login'
      },
      body: 'Redirecting to login...'
    };
  }
  
  try {
    const db = await connectToDatabase();
    
    // Item ID'si doğrulama
    let itemObjId;
    try {
      itemObjId = new ObjectId(itemId);
    } catch (err) {
      return {
        statusCode: 400,
        body: `Hata: Geçersiz ürün ID'si.`
      };
    }
    
    const result = await db.collection('items').deleteOne({ _id: itemObjId });
    
    return {
      statusCode: 302,
      headers: {
        'Location': '/admin'
      },
      body: 'Redirecting to admin...'
    };
  } catch (error) {
    console.error('Ürün silme hatası:', error);
    return {
      statusCode: 500,
      body: `Hata: ${error.message}`
    };
  }
}

// Kategori silme
async function handleDeleteCategory(categoryId, sessionId) {
  // Oturum kontrolü
  if (!sessions[sessionId] || !sessions[sessionId].admin) {
    return {
      statusCode: 302,
      headers: {
        'Location': '/login'
      },
      body: 'Redirecting to login...'
    };
  }
  
  try {
    const db = await connectToDatabase();
    
    // Kategori ID'si doğrulama
    let categoryObjId;
    try {
      categoryObjId = new ObjectId(categoryId);
    } catch (err) {
      return {
        statusCode: 400,
        body: `Hata: Geçersiz kategori ID'si.`
      };
    }
    
    await db.collection('categories').deleteOne({ _id: categoryObjId });
    await db.collection('items').deleteMany({ category_id: categoryObjId });
    
    return {
      statusCode: 302,
      headers: {
        'Location': '/admin'
      },
      body: 'Redirecting to admin...'
    };
  } catch (error) {
    console.error('Kategori silme hatası:', error);
    return {
      statusCode: 500,
      body: `Hata: ${error.message}`
    };
  }
}

// Çıkış yapma
function handleLogout() {
  return {
    statusCode: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': 'sessionId=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    },
    body: 'Redirecting to home...'
  };
}

// API handler
module.exports = async (req, res) => {
  const { method, url } = req;
  
  // Oturum bilgisini al
  let sessionId = null;
  if (req.headers.cookie) {
    const cookies = cookie.parse(req.headers.cookie);
    sessionId = cookies.sessionId;
  }
  
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
  
  // Login sayfası
  if (url === '/login') {
    if (method === 'GET') {
      const result = renderLogin();
      res.statusCode = result.statusCode;
      
      if (result.headers) {
        Object.keys(result.headers).forEach(key => {
          res.setHeader(key, result.headers[key]);
        });
      }
      
      res.end(result.body);
      return;
    } else if (method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        const result = await handleLogin(body);
        res.statusCode = result.statusCode;
        
        if (result.headers) {
          Object.keys(result.headers).forEach(key => {
            res.setHeader(key, result.headers[key]);
          });
        }
        
        res.end(result.body);
      });
      
      return;
    }
  }
  
  // Admin sayfası
  if (url === '/admin') {
    const result = await renderAdmin(sessionId);
    res.statusCode = result.statusCode;
    
    if (result.headers) {
      Object.keys(result.headers).forEach(key => {
        res.setHeader(key, result.headers[key]);
      });
    }
    
    res.end(result.body);
    return;
  }
  
  // Çıkış yapma
  if (url === '/logout') {
    const result = handleLogout();
    res.statusCode = result.statusCode;
    
    if (result.headers) {
      Object.keys(result.headers).forEach(key => {
        res.setHeader(key, result.headers[key]);
      });
    }
    
    res.end(result.body);
    return;
  }
  
  // Ürün ekleme
  if (url === '/add_item' && method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      const result = await handleAddItem(body, sessionId);
      res.statusCode = result.statusCode;
      
      if (result.headers) {
        Object.keys(result.headers).forEach(key => {
          res.setHeader(key, result.headers[key]);
        });
      }
      
      res.end(result.body);
    });
    
    return;
  }
  
  // Kategori ekleme
  if (url === '/add_category' && method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      const result = await handleAddCategory(body, sessionId);
      res.statusCode = result.statusCode;
      
      if (result.headers) {
        Object.keys(result.headers).forEach(key => {
          res.setHeader(key, result.headers[key]);
        });
      }
      
      res.end(result.body);
    });
    
    return;
  }
  
  // Ürün silme
  if (url.startsWith('/delete_item/')) {
    const itemId = url.replace('/delete_item/', '');
    const result = await handleDeleteItem(itemId, sessionId);
    res.statusCode = result.statusCode;
    
    if (result.headers) {
      Object.keys(result.headers).forEach(key => {
        res.setHeader(key, result.headers[key]);
      });
    }
    
    res.end(result.body);
    return;
  }
  
  // Kategori silme
  if (url.startsWith('/delete_category/')) {
    const categoryId = url.replace('/delete_category/', '');
    const result = await handleDeleteCategory(categoryId, sessionId);
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
