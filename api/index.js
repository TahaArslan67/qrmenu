// Vercel API rotası
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const querystring = require('querystring');
const https = require('https');
const cookie = require('cookie');

// MongoDB bağlantısı
let MONGO_URI = process.env.MONGODB_URI;

// Türkçe karakterleri İngilizce'ye çeviren fonksiyon
function toAscii(str) {
  return str
    .replace(/İ/g, 'I') // Büyük İ'yi büyük I yap
    .replace(/I/g, 'i') // Büyük I'yı küçük i yap
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/ /g, '_')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, ''); // Noktalı harfleri düzleştir
}


// Yerel mock veri
const mockData = {
  categories: [
    { _id: '1', name: 'Kebap Çeşitleri', category_num: 1 },
    { _id: '2', name: 'İçecek Çeşitleri', category_num: 2 },
    { _id: '3', name: 'Kahvaltı Çeşitleri', category_num: 3 },
    { _id: '4', name: 'Çorba Çeşitleri', category_num: 4 },
    { _id: '5', name: 'Fırın Ürünleri', category_num: 5 }
  ],
  items: [
    { _id: '101', name: 'Adana Kebap', price: 250, category_id: 1, description: 'Özel lezzetli kebap' },
    { _id: '102', name: 'Tavuk Şiş', price: 220, category_id: 1, description: '' },
    { _id: '103', name: 'Çay', price: 20, category_id: 2, description: '' },
    { _id: '104', name: 'Kahve', price: 40, category_id: 2, description: '' },
    { _id: '105', name: 'Serpme Kahvaltı', price: 300, category_id: 3, description: 'Zengin içerikli' },
    { _id: '106', name: 'Mercimek Çorbası', price: 80, category_id: 4, description: '' },
    { _id: '107', name: 'Kıymalı Pide', price: 180, category_id: 5, description: '' }
  ]
};

// Veritabanı durumu
let useLocalData = false;
let dbClient = null;

// HTML şablonları
const menuTemplate = fs.readFileSync(path.join(__dirname, '../templates/menu_new.html'), 'utf8');
const adminTemplate = fs.readFileSync(path.join(__dirname, '../templates/admin_new.html'), 'utf8');
const loginTemplate = fs.readFileSync(path.join(__dirname, '../templates/login.html'), 'utf8');
const indexTemplate = fs.readFileSync(path.join(__dirname, '../templates/index_new.html'), 'utf8');
const categoryTemplate = fs.readFileSync(path.join(__dirname, '../templates/category_new.html'), 'utf8');
const tanitimTemplate = fs.readFileSync(path.join(__dirname, '../templates/tanitim.html'), 'utf8');

// Oturum anahtarı
const SESSION_SECRET = 'supersecretkey';

// Supabase config
const SUPABASE_URL = 'https://ziqmpwqzlfjbbmcrooml.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppcW1wd3F6bGZqYmJtY3Jvb21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2Nzg5MDcsImV4cCI6MjA5ODI1NDkwN30.wH461SMmfr191zTkWTX-TGijemt218JrAfpZlqf74TI';

// Supabase REST API helper (uses https module for Node compatibility)
function supabaseFetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    const urlPath = `/rest/v1${path}`;
    const method = options.method || 'GET';
    const body = options.body ? JSON.stringify(JSON.parse(options.body)) : null;
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = https.request({
      hostname: 'ziqmpwqzlfjbbmcrooml.supabase.co',
      port: 443,
      path: urlPath,
      method: method,
      headers: headers
    }, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Siparişleri getir (items ve branch ile birlikte)
async function fetchOrders(statusFilter) {
  let query = '/orders?select=*,branch:branches(*),user:users(*),order_items(*)';
  if (statusFilter && statusFilter !== 'all') {
    query += `&status=eq.${statusFilter}`;
  }
  query += '&order=created_at.desc&limit=100';
  return await supabaseFetch(query);
}

// Sipariş durumunu güncelle
async function updateOrderStatus(orderId, status) {
  return await supabaseFetch(`/orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() })
  });
}

// Kampanyaları getir
async function fetchCampaigns() {
  return await supabaseFetch('/campaigns?order=created_at.desc');
}

// Kampanya oluştur
async function createCampaign(data) {
  return await supabaseFetch('/campaigns', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(data)
  });
}

// Kampanya sil
async function deleteCampaign(id) {
  return await supabaseFetch(`/campaigns?id=eq.${id}`, {
    method: 'DELETE'
  });
}

// Rapor verisi getir
async function fetchReportData() {
  const [orders, products, branches] = await Promise.all([
    supabaseFetch('/orders?select=*,order_items(*),branch:branches(name)'),
    supabaseFetch('/products?select=*,category:categories(name)'),
    supabaseFetch('/branches?select=*')
  ]);
  
  const validOrders = Array.isArray(orders) ? orders : [];
  const totalRevenue = validOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
  const totalOrders = validOrders.length;
  const deliveredOrders = validOrders.filter(o => o.status === 'delivered').length;
  const pendingOrders = validOrders.filter(o => o.status === 'pending').length;
  const preparingOrders = validOrders.filter(o => o.status === 'preparing').length;
  const onTheWayOrders = validOrders.filter(o => o.status === 'on_the_way').length;
  const cancelledOrders = validOrders.filter(o => o.status === 'cancelled').length;
  
  // Popular items
  const itemCounts = {};
  validOrders.forEach(order => {
    if (Array.isArray(order.order_items)) {
      order.order_items.forEach(item => {
        const name = item.product_name;
        if (!itemCounts[name]) itemCounts[name] = { name, quantity: 0, revenue: 0 };
        itemCounts[name].quantity += item.quantity || 0;
        itemCounts[name].revenue += (parseFloat(item.product_price) || 0) * (item.quantity || 0);
      });
    }
  });
  const popularItems = Object.values(itemCounts).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  
  // Revenue by day (last 7 days)
  const now = new Date();
  const dailyRevenue = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const dayStr = day.toISOString().split('T')[0];
    const dayOrders = validOrders.filter(o => o.created_at && o.created_at.startsWith(dayStr));
    dailyRevenue.push({
      date: dayStr,
      orders: dayOrders.length,
      revenue: dayOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0)
    });
  }
  
  return {
    totalRevenue,
    totalOrders,
    deliveredOrders,
    pendingOrders,
    preparingOrders,
    onTheWayOrders,
    cancelledOrders,
    popularItems,
    dailyRevenue,
    branches: Array.isArray(branches) ? branches : []
  };
}

// Basit oturum yönetimi - imzalı token (sunucu yeniden başlasa bile geçerli)
const ADMIN_TOKEN = crypto.createHmac('sha256', SESSION_SECRET).update('admin').digest('hex');
function isAdmin(sessionId) {
  return !!sessionId && sessionId === ADMIN_TOKEN;
}

// MongoDB bağlantısı kurma fonksiyonu
async function connectToDatabase() {
  if (useLocalData) {
    console.log('Yerel veri kullanılıyor');
    // Yerel mock veritabanı nesnesi oluştur
    return {
      collection: (name) => {
        return {
          find: (query = {}) => {
            return {
              toArray: async () => {
                if (name === 'categories') return mockData.categories;
                if (name === 'items') return mockData.items;
                return [];
              }
            };
          },
          findOne: async (query) => {
            if (name === 'categories') {
              return mockData.categories.find(c => c._id === query._id);
            }
            return null;
          },
          insertOne: async (doc) => {
            if (name === 'categories') {
              const newId = Date.now().toString();
              mockData.categories.push({ ...doc, _id: newId });
              return { acknowledged: true, insertedId: newId };
            }
            if (name === 'items') {
              const newId = Date.now().toString();
              mockData.items.push({ ...doc, _id: newId });
              return { acknowledged: true, insertedId: newId };
            }
            return { acknowledged: false };
          },
          deleteOne: async (query) => {
            if (name === 'categories') {
              const index = mockData.categories.findIndex(c => c._id === query._id);
              if (index >= 0) mockData.categories.splice(index, 1);
              return { deletedCount: index >= 0 ? 1 : 0 };
            }
            if (name === 'items') {
              const index = mockData.items.findIndex(i => i._id === query._id);
              if (index >= 0) mockData.items.splice(index, 1);
              return { deletedCount: index >= 0 ? 1 : 0 };
            }
            return { deletedCount: 0 };
          },
          deleteMany: async (query) => {
            if (name === 'items' && query.category_id) {
              const count = mockData.items.filter(i => i.category_id === query.category_id).length;
              mockData.items = mockData.items.filter(i => i.category_id !== query.category_id);
              return { deletedCount: count };
            }
            return { deletedCount: 0 };
          }
        };
      }
    };
  }

  try {
    // Eğer MONGO_URI yoksa, varsayılan URI'yi dene
    if (!MONGO_URI) {
      console.log('MongoDB URI bulunamadı, varsayılan URI deneniyor...');
      MONGO_URI = 'mongodb+srv://arslantaha67:0022800228t@panel.gjn1k.mongodb.net/qrmenu?retryWrites=true&w=majority';
    }

    // Halen bağlantı varsa yeniden kullan
    if (dbClient && dbClient.topology && dbClient.topology.isConnected()) {
      console.log('Mevcut MongoDB bağlantısı kullanılıyor');
      return dbClient.db('qrmenu');
    }

    console.log('MongoDB\'ye bağlanılıyor...');
    dbClient = await MongoClient.connect(MONGO_URI, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000 // 5 saniye bağlantı zaman aşımı
    });
    console.log('MongoDB bağlantısı başarılı!');
    return dbClient.db('qrmenu');
  } catch (err) {
    console.error('MongoDB bağlantı hatası:', err.message);
    console.log('Yerel veri kullanımına geçiliyor...');
    useLocalData = true;
    return connectToDatabase(); // Yerel veri için fonksiyonu tekrar çağır
  }
}

// Ana sayfa - Kategorileri göster
async function renderIndex() {
  try {
    const db = await connectToDatabase();
    const categories = await db.collection('categories').find({}).toArray();
    const items = await db.collection('items').find({}).toArray();
    
    // Kategorileri sırala
    categories.sort((a, b) => (Number(a.category_num) || 0) - (Number(b.category_num) || 0));
    
    // HTML şablonunu oku
    let html = indexTemplate;
    
    // Kategorileri ekle
    let categoriesGridHtml = '';
    
    if (categories.length > 0) {
      categories.forEach(category => {
        // Türkçe karakterleri İngilizce'ye çeviren fonksiyon kullanılsın
        const categoryNameAscii = toAscii(category.name);
        const defaultCategoryImgPath = `/static/category_images/${categoryNameAscii}.jpg`;
        const categoryImgPath = category.img_url || defaultCategoryImgPath;
        
        categoriesGridHtml += `
          <a href="/category/${category._id}" class="category-card">
            <div class="category-img-container">
              <img src="${categoryImgPath}" alt="${category.name}" class="category-img" onerror="this.onerror=null; this.src='/static/placeholder.svg'">
            </div>
            <div class="category-name">${category.name}</div>
          </a>
        `;
      });
    } else {
      categoriesGridHtml = '<p class="no-items">Henüz kategori bulunmamaktadır.</p>';
    }
    
    // Öne çıkan ürünleri hazırla
    let featuredHtml = '';
    if (items.length > 0) {
      const featuredItems = items.filter(i => i.is_featured);
      if (featuredItems.length > 0) {
        featuredHtml = `<div class="featured-section"><h2 class="featured-title">Öne Çıkanlar</h2><ul class="menu-list">`;
        featuredItems.forEach(item => {
          featuredHtml += `
            <li class="menu-item-row">
              <div class="menu-item-info">
                <span class="menu-item-name">${item.name}</span>
                ${item.description ? `<div class="menu-item-desc">${item.description}</div>` : ''}
              </div>
              <span class="menu-item-price">${parseFloat(item.price).toFixed(0)} ₺</span>
            </li>
          `;
        });
        featuredHtml += '</ul></div>';
      }
    }
    
    // Kategori grid içeriğini HTML'e ekle
    html = html.replace('<!-- FEATURED_ITEMS -->', featuredHtml || '');
    html = html.replace('<!-- CATEGORIES_GRID -->', categoriesGridHtml);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      },
      body: html
    };
  } catch (error) {
    console.error('Ana sayfa render hatası:', error);
    return {
      statusCode: 500,
      body: `Hata: ${error.message}`
    };
  }
}

// Kategori sayfası
async function renderCategory(categoryId) {
  try {
    const db = await connectToDatabase();
    
    // Kategori ID'sini ObjectId'ye dönüştür
    let objCategoryId;
    try {
      objCategoryId = new ObjectId(categoryId);
    } catch (e) {
      return {
        statusCode: 404,
        body: 'Geçersiz kategori ID'
      };
    }
    
    // Kategoriyi bul
    const category = await db.collection('categories').findOne({ _id: objCategoryId });
    
    if (!category) {
      return {
        statusCode: 404,
        body: 'Kategori bulunamadı'
      };
    }
    
    console.log("Kategori bulundu:", category);
    
    // Kategori sayısal ID'sini al
    const categoryNum = category.category_num;
    console.log("Kategorinin sayısal ID'si:", categoryNum);
    
    // Kategoriye ait ürünleri sayısal ID ile bul
    const items = await db.collection('items').find({ category_id: categoryNum }).toArray();
    console.log(`${categoryNum} numaralı kategori için ${items.length} ürün bulundu`);
    
    // Ürünleri debug için göster
    items.forEach((item, index) => {
      console.log(`${index+1}. Ürün: ${item.name}, Fiyat: ${item.price}, Kategori: ${item.category_id}, Açıklama: ${item.description ? item.description : 'Açıklama yok'}`);
    });
    
    // HTML şablonunu oku
    let html = categoryTemplate;
    
    // Kategori adını ekle
    html = html.replace(/<!-- CATEGORY_NAME -->/g, category.name);
    
    // Kategori ürünlerini ekle
    let itemsHtml = '';
    
    if (items.length > 0) {
      items.forEach(item => {
        itemsHtml += `
          <li class="menu-item-row">
            <div class="menu-item-info">
              <span class="menu-item-name">${item.name}</span>
              ${item.description ? `<div class="menu-item-desc">${item.description}</div>` : ''}
            </div>
            <span class="menu-item-price">${parseFloat(item.price).toFixed(0)} ₺</span>
          </li>
        `;
      });
    } else {
      itemsHtml = '<p class="no-items">Bu kategoride henüz ürün bulunmamaktadır.</p>';
    }
    
    // Ürünleri HTML'e ekle
    html = html.replace('<!-- CATEGORY_ITEMS -->', itemsHtml);
    // Kategori resimlerini SADECE sağ sütuna ekle (ürünler sütununa ekleme!)
    // Inline style ile gösterilen renkli kutular ekleyerek görsel bir çözüm sunalım
    console.log(`Kategori adı: ${category.name}`);
    const categoryName = toAscii(category.name);
    const categoryImagesDir = path.join(__dirname, '..', 'static', 'category_images');
    let imagesHtml = '';
    try {
      const files = fs.readdirSync(categoryImagesDir);
      // [kategori_adı]_1.jpg, [kategori_adı]_2.jpg ... şeklinde olanları sırala
      // SADECE kategoriismi_1.jpg, kategoriismi_2.jpg gibi dosyaları göster
      const imageFiles = files.filter(f => f.match(new RegExp(`^${categoryName}_\\d+\\.jpg$`, 'i')));
      imageFiles.sort();
      if (imageFiles.length > 0) {
        // Sadece içerik resimlerini göster (ana kategori resmi asla gösterilmez)
        imageFiles.forEach(imgFile => {
          imagesHtml += `<div class="category-image-container"><img src="/static/category_images/${imgFile}" class="category-detail-img" alt="${category.name}" onerror="this.onerror=null; this.src='/static/placeholder.svg'"></div>`;
        });
      } else {
        // Hiç içerik resmi yoksa, hiçbir şey gösterme
        imagesHtml = '';
      }
    } catch (err) {
      // Hata olursa sadece fallback resmi göster
      imagesHtml = `<div class="category-image-container"><img src="/static/category_images/${categoryName}.jpg" class="category-detail-img" alt="${category.name}" onerror="this.onerror=null; this.src='/static/placeholder.svg'"></div>`;
    }

    // Resimleri HTML'e ekle
    html = html.replace('<!-- CATEGORY_IMAGES -->', imagesHtml);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      },
      body: html
    };
  } catch (error) {
    console.error('Kategori render hatası:', error);
    return {
      statusCode: 500,
      body: `Hata: ${error.message}`
    };
  }
}

// Menü sayfası (eski)
async function renderMenu() {
  try {
    const db = await connectToDatabase();
    const categories = await db.collection('categories').find({}).toArray();
    const items = await db.collection('items').find({}).toArray();
    
    // Kategorileri sırala
    categories.sort((a, b) => (Number(a.category_num) || 0) - (Number(b.category_num) || 0));
    
    // HTML şablonunu oku
    let html = menuTemplate;
    
    // Kategorileri ve ürünleri ekle
    let menuContent = '';
    
    // Kategori ve ürün id'lerini ve tiplerini logla
    console.log('Kategoriler:', categories.map(c => ({ _id: c._id, type: typeof c._id })));
    console.log('Ürünler:', items.map(i => ({ name: i.name, category_id: i.category_id, type: typeof i.category_id })));
    if (categories.length > 0) {
      categories.forEach(category => {
        // Kategori başlığını ekle
        menuContent += `<div class="menu-section-title" data-category="${category.name}">${category.name}</div>`;
        // Sadece Kampanyalı Menüler için not ekle
        if (category._id === '688b2980370fab1d858d7d6a' || Number(category.category_num) === 6) {
          menuContent += `<div class="menu-category-note" style="margin:8px 0 8px 0;padding:8px 12px;background:#ffe8b2;color:#a05a00;border-radius:6px;font-size:15px;">Karışık, kıymalı, kaşarlı, kuşbaşılı, sucuklu veya peynirli pide seçeneklerinden birini seçebilirsin.</div>`;
        }
        menuContent += '<ul class="menu-list">';
        
        // Bu kategoriye ait ürünleri filtrele
        const categoryItems = items.filter(item => {
          try {
            if (typeof item.category_id === 'undefined' || typeof category.category_num === 'undefined') return false;
            // Numeric eşleşme
            const match = Number(item.category_id) === Number(category.category_num);
            if (match) {
              console.log('Kategori eşleşmesi:', { item: item.name, item_cat: item.category_id, cat_num: category.category_num });
            }
            return match;
          } catch (e) {
            return false;
          }
        });
        
        // Kategoriye ait ürünleri ekle
        if (categoryItems.length > 0) {
          categoryItems.forEach(item => {
            console.log('HTML ekleniyor:', { kategori: category.name, urun: item.name, id: item._id, cat_id: item.category_id });
            menuContent += `
              <li class="menu-item-row">
                <div class="menu-item-info">
                  <span class="menu-item-name">${item.name}</span>
                </div>
                <span class="menu-item-price">${parseFloat(item.price).toFixed(0)} ₺</span>
              </li>
            `;
          });
        }
        
        menuContent += '</ul>';
      });
    } else {
      menuContent = '<p class="no-items">Henüz kategori bulunmamaktadır.</p>';
    }
    
    // Menü içeriğini HTML'e ekle
    html = html.replace('<!-- MENU_CONTENT -->', menuContent);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      },
      body: html
    };
  } catch (error) {
    console.error('Menü render hatası:', error);
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
  // Oturum kontrolü ekleyelim
  if (!isAdmin(sessionId)) {
    console.log('Admin sayfasına erişim reddedildi - oturum yok veya geçersiz');
    
    // Login sayfasına yönlendir
    return {
      statusCode: 302,
      headers: {
        'Location': '/login'
      },
      body: 'Redirecting to login...'
    };
  }
  
  console.log('Admin sayfasına erişim onaylandı');
  try {
    const db = await connectToDatabase();
    const categories = await db.collection('categories').find({}).toArray();
    const items = await db.collection('items').find({}).toArray();
    
    console.log('Veritabanından çekilen kategoriler:', categories);
    
    // HTML şablonunu oku
    let html = adminTemplate;
    
    // Kategori seçim listesini oluştur
    let categoriesOptions = '';
    categories.forEach(category => {
      categoriesOptions += `<option value="${category._id}">${category.name}</option>`;
    });
    
    // Kategori seçim listesini HTML'e ekle
    html = html.replace('<!-- CATEGORIES_OPTIONS -->', categoriesOptions);
    
    // Kategori listesini oluştur
    let categoryListHtml = '';
    categories.forEach(category => {
      const catNum = Number(category.category_num) || 0;
      categoryListHtml += `
        <tr>
          <td>${category.name}</td>
          <td><a href="#" class="edit-btn" onclick="editCategory('${category._id}', '${category.name.replace(/'/g, "\\'")}', ${catNum})">Düzenle</a> <a href="/delete_category/${category._id}" class="delete-btn">Sil</a></td>
        </tr>
      `;
    });
    
    // Kategori listesini HTML'e ekle
    html = html.replace('<!-- CATEGORIES_LIST -->', categoryListHtml);
    
    // Ürün listesini oluştur
    let itemsHtml = '';
    items.forEach(item => {
      let categoryName = 'Kategorisi yok';
      
      // Kategori ID'sini güvenli bir şekilde kontrol et (0 geçerli bir değerdir)
      if (item.category_id !== undefined && item.category_id !== null && item.category_id !== '') {
        // 1. Direk ObjectId eşleşmesi
        let category = categories.find(c => {
          try {
            return c._id.toString() === item.category_id.toString();
          } catch (e) {
            return false;
          }
        });
        
        // 2. Sayısal ID (category_num) ile eşleşme
        if (!category) {
          const itemCategoryNum = Number(String(item.category_id));
          if (!isNaN(itemCategoryNum)) {
            category = categories.find(c => Number(String(c.category_num)) === itemCategoryNum);
            if (category) console.log(`${item.name} ürünü için kategori sayısal ID ile eşleştirildi: ${itemCategoryNum}`);
          } else if (typeof item.category_id === 'string' && item.category_id.length === 24) {
            try {
              category = categories.find(c => c._id.toString() === item.category_id);
            } catch (e) {
              console.log(`ObjectId karşılaştırma hatası: ${e.message}`);
            }
          }
        }
        
        if (category) {
          categoryName = category.name;
          console.log(`Ürün eşleşmesi: ${item.name} -> ${categoryName} (ID: ${item.category_id})`);
        } else {
          console.log(`Eşleşmeyen kategori: ${item.name} ürünü için kategori ID: ${item.category_id}`);
        }
      }
      
      itemsHtml += `
        <tr data-category="${categoryName.replace(/"/g, '&quot;')}" data-name="${item.name.replace(/"/g, '&quot;')}">
          <td>${item.name} ${item.is_featured ? '⭐' : ''}</td>
          <td>${categoryName}</td>
          <td>${parseFloat(item.price).toFixed(0)} ₺</td>
          <td>
            <a href="#" class="edit-btn" onclick="editItem('${item._id}')">Düzenle</a>
            <a href="/delete_item/${item._id}" class="delete-btn">Sil</a>
          </td>
        </tr>
      `;
    });
    
    // Ürün listesini HTML'e ekle
    html = html.replace('<!-- ITEMS_LIST -->', itemsHtml);
    
    // Admin paneli JS verilerini hazırla
    const adminItemsData = items.map(i => ({
      _id: i._id ? i._id.toString() : i._id,
      name: i.name,
      description: i.description || '',
      price: i.price,
      category_id: i.category_id,
      is_featured: !!i.is_featured
    }));
    const adminCategoriesData = categories.map(c => ({
      _id: c._id ? c._id.toString() : c._id,
      name: c.name,
      category_num: c.category_num,
      img_url: c.img_url || ''
    }));
    html = html.replace('<!-- ADMIN_ITEMS_DATA -->', `<script>window.adminItems = ${JSON.stringify(adminItemsData)}; window.adminCategories = ${JSON.stringify(adminCategoriesData)};</script>`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      },
      body: html
    };
  } catch (error) {
    console.error('Admin sayfası render hatası:', error);
    return {
      statusCode: 500,
      body: `Hata: ${error.message}`
    };
  }
}

// Login işlemi
async function handleLogin(body) {
  console.log('HandleLogin fonksiyonuna gelen veri:', body);
  
  // Kullanıcı adı ve şifreyi parse et
  let username, password;
  
  if (typeof body === 'string') {
    // URL kodlu form verisi
    const params = querystring.parse(body);
    username = params.username;
    password = params.password;
  } else {
    // Nesne olarak gelmiş olabilir
    username = body.username;
    password = body.password;
  }
  
  console.log('Parse edilmiş giriş bilgileri:', username, password);
  
  if (username === 'admin' && password === 'admin123') {
    // Oturum oluştur
    console.log('Admin oturumu oluşturuldu');
    
    return {
      statusCode: 302,
      headers: {
        'Location': '/admin',
        'Set-Cookie': `sessionId=${ADMIN_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`
      },
      body: 'Redirecting to admin...'
    };
  } else {
    console.log('Geçersiz giriş bilgileri');
    return renderLogin('Kullanıcı adı veya şifre yanlış!');
  }
}

// Ürün ekleme
async function handleAddItem(body, sessionId) {
  // Oturum kontrolü
  if (!isAdmin(sessionId)) {
    console.log('Ürün ekleme reddedildi - oturum yok veya geçersiz');
    
    // Login sayfasına yönlendir
    return {
      statusCode: 302,
      headers: {
        'Location': '/login'
      },
      body: 'Redirecting to login...'
    };
  }
  
  console.log('Ürün ekleme onaylandı');
  console.log('Ürün ekleme verileri:', body);
  
  // Form verilerini kontrol et
  let name, description, price, category_id, is_featured;
  
  if (typeof body === 'string') {
    // URL kodlu form verisi
    const params = querystring.parse(body);
    name = params.name;
    description = params.description;
    price = params.price;
    category_id = params.category_id;
    is_featured = params.is_featured === '1' || params.is_featured === 'on' || params.is_featured === true;
  } else {
    // Veri zaten ayrıştırılmış nesne olarak gelmiş
    name = body.name;
    description = body.description;
    price = body.price;
    category_id = body.category_id;
    is_featured = body.is_featured === true || body.is_featured === '1' || body.is_featured === 'on';
  }
  
  console.log('İşlenmiş ürün ekleme parametreleri:', { name, description, price, category_id });
  
  if (!name || !price || !category_id) {
    return {
      statusCode: 400,
      body: 'Hata: Ürün adı, fiyatı ve kategori gereklidir.',
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    };
  }
  
  try {
    const db = await connectToDatabase();
    
    // Kategori numarasını bul ve category_id olarak kaydet
    let categoryNum;
    try {
      let category;
      if (!useLocalData) {
        // Production: category_id is ObjectId (_id of categories)
        const catObjId = new ObjectId(category_id);
        category = await db.collection('categories').findOne({ _id: catObjId });
      } else {
        // Local mock: category_id is string _id
        category = mockData.categories.find(c => c._id === category_id || c.category_num == category_id);
      }
      if (!category || typeof category.category_num === 'undefined') {
        console.error('Kategori bulunamadı veya category_num yok:', category_id, category);
        return {
          statusCode: 400,
          body: `Hata: Seçilen kategori bulunamadı veya category_num tanımsız. Lütfen geçerli bir kategori seçin.`,
          headers: {
            'Content-Type': 'text/html; charset=utf-8'
          }
        };
      }
      categoryNum = category.category_num;
    } catch (err) {
      console.error('Kategori numarası alınamadı:', category_id, err);
      return {
        statusCode: 400,
        body: `Hata: Kategori numarası alınamadı. Lütfen geçerli bir kategori seçin.`,
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      };
    }

    const result = await db.collection('items').insertOne({
      name,
      description: description || '',
      price: parseFloat(price),
      category_id: categoryNum,
      is_featured: !!is_featured
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
      body: `Hata: ${error.message}`,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    };
  }
}

// Kategori ekleme
async function handleAddCategory(body, sessionId) {
  // Oturum kontrolü
  if (!isAdmin(sessionId)) {
    console.log('Kategori ekleme reddedildi - oturum yok veya geçersiz');
    
    // Login sayfasına yönlendir
    return {
      statusCode: 302,
      headers: {
        'Location': '/login'
      },
      body: 'Redirecting to login...'
    };
  }
  
  console.log('Kategori ekleme onaylandı');
  console.log('Kategori ekleme verileri:', body);
  
  // Form verilerini kontrol et
  let name, category_num, img_url;
  
  if (typeof body === 'string') {
    // URL kodlu form verisi
    const params = querystring.parse(body);
    name = params.name;
    category_num = parseInt(params.category_num) || 0;
    img_url = params.img_url || '';
  } else {
    // Veri zaten ayrıştırılmış nesne olarak gelmiş
    name = body.name;
    category_num = parseInt(body.category_num) || 0;
    img_url = body.img_url || '';
  }
  
  console.log('Kategori adı:', name, 'Sıra:', category_num);
  
  if (!name) {
    return {
      statusCode: 400,
      body: 'Hata: Kategori adı gereklidir.',
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    };
  }
  
  try {
    const db = await connectToDatabase();
    
    const result = await db.collection('categories').insertOne({
      name,
      category_num,
      img_url: img_url || ''
    });
    
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
      body: `Hata: ${error.message}`,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    };
  }
}

// Ürün silme
async function handleDeleteItem(itemId, sessionId) {
  // Oturum kontrolü
  if (!isAdmin(sessionId)) {
    console.log('Ürün silme reddedildi - oturum yok veya geçersiz');
    
    // Login sayfasına yönlendir
    return {
      statusCode: 302,
      headers: {
        'Location': '/login'
      },
      body: 'Redirecting to login...'
    };
  }
  
  console.log('Ürün silme onaylandı');
  try {
    const db = await connectToDatabase();
    
    // Ürün ID'si doğrulama
    let itemObjId;
    try {
      if (!useLocalData) {
        itemObjId = new ObjectId(itemId);
      } else {
        itemObjId = itemId;
      }
    } catch (err) {
      console.error('Geçersiz ürün ID:', itemId, err);
      return {
        statusCode: 400,
        body: `Hata: Geçersiz ürün ID'si.`,
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      };
    }
    
    const result = await db.collection('items').deleteOne({
      _id: itemObjId
    });
    
    if (result.deletedCount === 0) {
      return {
        statusCode: 404,
        body: 'Hata: Ürün bulunamadı.',
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      };
    }
    
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
      body: `Hata: ${error.message}`,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    };
  }
}

// Kategori düzenleme
async function handleEditCategory(body, sessionId) {
  // Oturum kontrolü
  if (!isAdmin(sessionId)) {
    console.log('Kategori düzenleme reddedildi - oturum yok veya geçersiz');
    return {
      statusCode: 302,
      headers: { 'Location': '/login' },
      body: 'Redirecting to login...'
    };
  }
  
  console.log('Kategori düzenleme onaylandı');
  console.log('Kategori düzenleme verileri:', body);
  
  let categoryId, name, category_num, img_url;
  
  if (typeof body === 'string') {
    const params = querystring.parse(body);
    categoryId = params.category_id;
    name = params.name;
    category_num = parseInt(params.category_num) || 0;
    img_url = params.img_url || '';
  } else {
    categoryId = body.category_id;
    name = body.name;
    category_num = parseInt(body.category_num) || 0;
    img_url = body.img_url || '';
  }
  
  if (!categoryId || !name) {
    return {
      statusCode: 400,
      body: 'Hata: Kategori ID ve adı gereklidir.',
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    };
  }
  
  try {
    const db = await connectToDatabase();
    
    let objCategoryId;
    if (!useLocalData) {
      objCategoryId = new ObjectId(categoryId);
    } else {
      objCategoryId = categoryId;
    }
    
    const result = await db.collection('categories').updateOne(
      { _id: objCategoryId },
      { $set: { name, category_num, img_url: img_url || '' } }
    );
    
    if (result.modifiedCount === 0) {
      return {
        statusCode: 404,
        body: 'Hata: Kategori bulunamadı veya güncellenemedi.',
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      };
    }
    
    return {
      statusCode: 302,
      headers: { 'Location': '/admin' },
      body: 'Redirecting to admin...'
    };
  } catch (error) {
    console.error('Kategori düzenleme hatası:', error);
    return {
      statusCode: 500,
      body: `Hata: ${error.message}`,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    };
  }
}

// Kategori silme
async function handleDeleteCategory(categoryId, sessionId) {
  // Oturum kontrolü
  if (!isAdmin(sessionId)) {
    console.log('Kategori silme reddedildi - oturum yok veya geçersiz');
    
    // Login sayfasına yönlendir
    return {
      statusCode: 302,
      headers: {
        'Location': '/login'
      },
      body: 'Redirecting to login...'
    };
  }
  
  console.log('Kategori silme onaylandı');
  try {
    const db = await connectToDatabase();
    
    // Kategori ID'si doğrulama
    let categoryObjId;
    try {
      if (!useLocalData) {
        categoryObjId = new ObjectId(categoryId);
      } else {
        categoryObjId = categoryId;
      }
    } catch (err) {
      console.error('Geçersiz kategori ID:', categoryId, err);
      return {
        statusCode: 400,
        body: `Hata: Geçersiz kategori ID'si.`,
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      };
    }
    
    const categoryResult = await db.collection('categories').deleteOne({
      _id: categoryObjId
    });
    
    if (categoryResult.deletedCount === 0) {
      return {
        statusCode: 404,
        body: 'Hata: Kategori bulunamadı.',
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      };
    }
    
    const itemsResult = await db.collection('items').deleteMany({
      category_id: categoryObjId
    });
    
    console.log(`Kategori ve ${itemsResult.deletedCount} ürün silindi.`);
    
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
      body: `Hata: ${error.message}`,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    };
  }
}

// Ürün düzenleme
async function handleEditItem(body, sessionId) {
  // Oturum kontrolü
  if (!isAdmin(sessionId)) {
    console.log('Ürün düzenleme erişimi reddedildi - oturum yok veya geçersiz');
    
    return {
      statusCode: 302,
      headers: {
        'Location': '/login'
      },
      body: 'Redirecting to login...'
    };
  }
  
  console.log('Ürün düzenleme isteği:', body);
  
  try {
    const db = await connectToDatabase();
    
    // Form verilerini al
    const itemId = body.item_id;
    const name = body.name;
    const description = body.description || '';
    const price = parseFloat(body.price);
    const categoryId = body.category_id;
    const is_featured = body.is_featured === true || body.is_featured === '1' || body.is_featured === 'on';
    
    // Veri kontrolü
    if (!name || isNaN(price) || !categoryId) {
      return {
        statusCode: 400,
        body: 'Geçersiz ürün bilgileri'
      };
    }
    
    // Kategori ID'sini ObjectId'ye dönüştür ve sayısal ID'yi al
    let categoryIdNum;
    try {
      // Önce kategoriyi ObjectId ile bul
      const objCategoryId = new ObjectId(categoryId);
      const category = await db.collection('categories').findOne({ _id: objCategoryId });
      
      if (category && typeof category.category_num !== 'undefined') {
        // Kategori bulundu, sayısal ID'sini kullan
        categoryIdNum = category.category_num;
        console.log(`Kategori bulundu: ${category.name}, sayısal ID: ${categoryIdNum}`);
      } else {
        // Kategori bulunamadı veya category_num yok, kategoriId'yi sayısal olarak çevirmeyi dene
        try {
          categoryIdNum = Number(categoryId);
          if (isNaN(categoryIdNum)) {
            return { statusCode: 400, body: 'Hata: Geçersiz kategori', headers: { 'Content-Type': 'text/html; charset=utf-8' } };
          }
          console.log(`Kategori ID sayısal değere dönüştürüldü: ${categoryIdNum}`);
        } catch (e) {
          // Sayısal değere dönüştürülemiyorsa varsayılan 1 kullan
          categoryIdNum = 1;
          console.log(`Kategori ID sayısal değere dönüştürülemedi, varsayılan 1 kullanılıyor`);
        }
      }
    } catch (e) {
      // ObjectId'ye dönüştürme hatası, sayısal dönüşümü dene
      try {
        categoryIdNum = Number(categoryId);
          if (isNaN(categoryIdNum)) {
            return { statusCode: 400, body: 'Hata: Geçersiz kategori', headers: { 'Content-Type': 'text/html; charset=utf-8' } };
          }
        console.log(`Kategori ID doğrudan sayısal değere dönüştürüldü: ${categoryIdNum}`);
      } catch (e2) {
        // Hatada varsayılan kategori 1 kullan
        categoryIdNum = 1;
        console.log(`Kategori ID işlenirken hata oluştu: ${e.message}, varsayılan 1 kullanılıyor`);
      }
    }
    
    // Ürün ID'sini ObjectId'ye dönüştür
    let objItemId;
    try {
      objItemId = new ObjectId(itemId);
    } catch (e) {
      return {
        statusCode: 400,
        body: 'Geçersiz ürün ID'
      };
    }
    
    // Ürünü güncelle - sayısal category_id ile
    const result = await db.collection('items').updateOne(
      { _id: objItemId },
      { 
        $set: { 
          name: name,
          description: description,
          price: price,
          category_id: categoryIdNum,  // Sayısal kategori ID'yi kullan
          is_featured: !!is_featured
        }
      }
    );
    
    if (result.modifiedCount === 0) {
      console.log('Ürün güncellenemedi:', result);
      return {
        statusCode: 404,
        body: 'Ürün bulunamadı veya güncellenemedi'
      };
    }
    
    console.log('Ürün başarıyla güncellendi:', result);
    
    // Admin sayfasına yönlendir
    return {
      statusCode: 302,
      headers: {
        'Location': '/admin'
      },
      body: 'Redirecting to admin...'
    };
  } catch (error) {
    console.error('Ürün düzenleme hatası:', error);
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

// OpenAI API çağrısı
function callOpenAI(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const request = https.request({
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (process.env.OPENAI_API_KEY || ''),
        'Content-Length': Buffer.byteLength(data)
      }
    }, (response) => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            const json = JSON.parse(body);
            resolve(json.choices[0].message.content);
          } catch (e) {
            reject(new Error('OpenAI yanıtı çözümlenemedi: ' + body));
          }
        } else {
          reject(new Error('OpenAI hatası ' + response.statusCode + ': ' + body));
        }
      });
    });
    request.on('error', reject);
    request.write(data);
    request.end();
  });
}

// Fiş fotoğrafını okuyup menü fiyatlarıyla eşleştirir
async function handleReceiptScan(imageData) {
  if (!process.env.OPENAI_API_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'OPENAI_API_KEY ortam değişkeni tanımlanmamış' }) };
  }
  if (typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Geçerli bir fiş fotoğrafı gönderilmedi' }) };
  }
  try {
    const db = await connectToDatabase();
    const items = await db.collection('items').find({}).toArray();
    const menuItems = items.map(item => ({ id: String(item._id), name: item.name }));
    const shorthandRules = {
      'kuş': 'Kuşbaşı',
      'kuşkaş': 'Kuşbaşı Kaşarlı',
      'kuş başı kaşarlı': 'Kuşbaşı Kaşarlı',
      'küstbaşı kaşarlı': 'Kuşbaşı Kaşarlı',
      'kola': 'Kutu Kola',
      'cam': 'Şişe Kola',
      'camkola': 'Şişe Kola',
      'kıy': 'Kıymalı',
      'kıykaş': 'Kıymalı Kaşarlı',
      'kaş': 'Kaşarlı',
      'lah': 'Lahmacun',
      'l': 'Lahmacun',
      'kıykaş yu': 'Kıymalı Kaşarlı Yumurtalı'
    };
    const prompt = `Bu fotoğraf fiş değil; dükkânda masadaki siparişleri çok kötü ve hızlı el yazısıyla aldığımız nottur. Yazı okunaksız olsa bile satırları tek tek çözmeye çalış. Harfleri menü kataloğuyla karşılaştırarak düzelt; Türkçe karakterleri ve aşağıdaki restoran kısaltmalarını tam olarak uygula: ${JSON.stringify(shorthandRules)}. Özellikle kuş=Kuşbaşı, kuşkaş=Kuşbaşı Kaşarlı, kola=Kutu Kola, cam veya camkola=Şişe Kola, kıy=Kıymalı, kıykaş=Kıymalı Kaşarlı, kaş=Kaşarlı, lah veya L=Lahmacun, kıykaş yu=Kıymalı Kaşarlı Yumurtalı. Bu sözlükteki eşleşmeleri yaklaşık tahminle değiştirme. Örneğin 3L=3 adet Lahmacun, 2L=2 adet Lahmacun, 2 ayran=2 adet Ayran demektir; bunları fiyat veya TL olarak yorumlama. Aynı satırdaki 2, 3, 2x, çarpı işareti veya tekrar çizgisini adet olarak kabul et. Her satırda menu_id olarak yalnızca katalogdaki id değerlerinden birini kullan; katalogda karşılığı yoksa menu_id null olsun. menu_name sadece seçilen katalog ürününün tam adı olmalı; başka ürün, isim, fiyat veya ID uydurma. Her okunabilir ürün için mutlaka satır döndür, eminlik düşükse confidence değerini düşür. Sadece JSON döndür: {"lines":[{"detected_name":"notta tahmin edilen ifade","menu_id":"katalogdaki id veya null","menu_name":"katalogdaki tam ürün adı veya null","quantity":1,"confidence":0.0}]}. Toplam, masa numarası, garson adı, not ve iptal işaretlerini ürün olarak ekleme. Menü kataloğu: ${JSON.stringify(menuItems)}`;
    const resultText = await callOpenAI({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Kötü Türkçe el yazılı restoran sipariş notlarını çözen asistansın. Menü kataloğundaki id değerleri otoritedir. Her satırda yalnızca katalogda verilen bir id seç veya null döndür. Yalnızca seçilen id kaydındaki tam ürün adını kullan. Fotoğrafta olmayan ürün, fiyat, TL tutarı, toplam, masa numarası, açıklama veya yeni id uydurma. Bir satırdan emin değilsen menu_id ve menu_name null yap. Sadece geçerli JSON döndür.' },
        { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageData, detail: 'high' } }] }
      ],
      max_tokens: 800,
      response_format: { type: 'json_object' }
    });
    const responseString = String(resultText || '').trim();
    const jsonStart = responseString.indexOf('{');
    const jsonEnd = responseString.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error('AI geçerli JSON döndürmedi');
    const parsed = JSON.parse(responseString.slice(jsonStart, jsonEnd + 1));
    const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
    const normalized = (value) => String(value).toLocaleLowerCase('tr-TR').replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c').replace(/[^a-z0-9]/g, '');
    const shorthandEntries = Object.entries(shorthandRules).map(([key, value]) => [normalized(key), value]);
    const receiptLines = lines.filter(line => line && typeof line === 'object').map(line => {
      const detectedName = String(line.detected_name || line.name || '').trim();
      const requestedMenuName = String(line.menu_name || '').trim();
      const requestedMenuId = String(line.menu_id || '').trim();
      const shorthandMatch = shorthandEntries.find(([key]) => key === normalized(detectedName));
      const resolvedName = shorthandMatch ? shorthandMatch[1] : requestedMenuName;
      const menuItem = items.find(item => requestedMenuId && String(item._id) === requestedMenuId) || (shorthandMatch && items.find(item => normalized(item.name) === normalized(resolvedName)));
      const quantity = Math.min(20, Math.max(1, Number(line.quantity) || 1));
      const price = menuItem ? Number(menuItem.price) || 0 : null;
      return { detectedName, matchedName: menuItem ? String(menuItem.name) : null, price, quantity, lineTotal: price === null ? null : price * quantity, confidence: menuItem ? 1 : 0 };
    });
    const total = receiptLines.reduce((sum, line) => sum + (line.lineTotal || 0), 0);
    const warnings = receiptLines.filter(line => line.price === null).map(line => `\"${line.detectedName}\" menüde bulunamadı.`);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: receiptLines, total, currency: '₺', warnings }) };
  } catch (error) {
    console.error('Fiş tarama hatası:', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Fiş analiz edilemedi: ' + error.message }) };
  }
}

function callOpenAITranscription(audioData) {
  return new Promise((resolve, reject) => {
    const match = String(audioData).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return reject(new Error('Geçerli ses verisi gönderilmedi'));
    const boundary = '----ReceiptScannerBoundary' + Date.now();
    const audioBuffer = Buffer.from(match[2], 'base64');
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\ntr\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="order.m4a"\r\nContent-Type: audio/mp4\r\n\r\n`),
      audioBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const request = https.request({ hostname: 'api.openai.com', port: 443, path: '/v1/audio/transcriptions', method: 'POST', headers: { Authorization: 'Bearer ' + (process.env.OPENAI_API_KEY || ''), 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length } }, (response) => {
      let responseBody = '';
      response.on('data', chunk => { responseBody += chunk; });
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try { resolve(JSON.parse(responseBody).text || ''); } catch (error) { reject(error); }
        } else reject(new Error('Ses çözümleme hatası ' + response.statusCode + ': ' + responseBody));
      });
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function handleVoiceScan(audioData) {
  if (!process.env.OPENAI_API_KEY) return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'OPENAI_API_KEY ortam değişkeni tanımlanmamış' }) };
  try {
    const transcript = await callOpenAITranscription(audioData);
    const db = await connectToDatabase();
    const items = await db.collection('items').find({}).toArray();
    const catalog = items.map(item => ({ id: String(item._id), name: item.name }));
    const resultText = await callOpenAI({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'Türkçe restoran siparişlerini katalogdaki ürün IDleriyle eşleştiren asistansın. Sadece katalogdaki IDleri kullan, ürün veya fiyat uydurma. JSON döndür.' }, { role: 'user', content: `Sipariş konuşması: ${transcript}\\nKatalog: ${JSON.stringify(catalog)}\\nFormat: {"lines":[{"menu_id":"id veya null","quantity":1}],"transcript":"..."}` }], temperature: 0, max_tokens: 600, response_format: { type: 'json_object' } });
    const parsed = JSON.parse(String(resultText).slice(String(resultText).indexOf('{'), String(resultText).lastIndexOf('}') + 1));
    const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
    const receiptLines = lines.map(line => {
      const item = items.find(entry => String(entry._id) === String(line.menu_id));
      const quantity = Math.min(20, Math.max(1, Number(line.quantity) || 1));
      const price = item ? Number(item.price) || 0 : null;
      return { detectedName: item ? String(item.name) : 'Eşleşmeyen sipariş', matchedName: item ? String(item.name) : null, price, quantity, lineTotal: price === null ? null : price * quantity, confidence: item ? 1 : 0 };
    });
    const total = receiptLines.reduce((sum, line) => sum + (line.lineTotal || 0), 0);
    const warnings = receiptLines.filter(line => line.price === null).map(() => 'Konuşmadaki bir ürün menüde bulunamadı.');
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: receiptLines, total, currency: '₺', warnings, transcript }) };
  } catch (error) {
    console.error('Sesli sipariş hatası:', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Sesli sipariş analiz edilemedi: ' + error.message }) };
  }
}

// AI işlemlerini veritabanına uygula
async function applyAiOperation(db, op) {
  if (!op || !op.action) throw new Error('Geçersiz operasyon');
  switch (op.action) {
    case 'add_category': {
      if (!op.data || !op.data.name) throw new Error('Eksik kategori adı');
      await db.collection('categories').insertOne({ name: op.data.name, category_num: op.data.category_num || 0, img_url: op.data.img_url || '' });
      break;
    }
    case 'update_category': {
      if (!op.target_name) throw new Error('Hedef kategori adı eksik');
      const cat = await db.collection('categories').findOne({ name: op.target_name });
      if (!cat) throw new Error('Kategori bulunamadı: ' + op.target_name);
      const set = {};
      if (op.data.name !== undefined) set.name = op.data.name;
      if (op.data.category_num !== undefined) set.category_num = op.data.category_num;
      if (op.data.img_url !== undefined) set.img_url = op.data.img_url;
      await db.collection('categories').updateOne({ _id: cat._id }, { $set: set });
      break;
    }
    case 'delete_category': {
      if (!op.target_name) throw new Error('Hedef kategori adı eksik');
      const cat = await db.collection('categories').findOne({ name: op.target_name });
      if (!cat) throw new Error('Kategori bulunamadı: ' + op.target_name);
      await db.collection('items').deleteMany({ category_id: cat.category_num });
      await db.collection('categories').deleteOne({ _id: cat._id });
      break;
    }
    case 'add_item': {
      if (!op.data || !op.data.name || op.data.price === undefined || !op.data.category_name) {
        throw new Error('Eksik ürün bilgisi');
      }
      const cat = await db.collection('categories').findOne({ name: op.data.category_name });
      const categoryNum = cat ? cat.category_num : 0;
      await db.collection('items').insertOne({
        name: op.data.name,
        description: op.data.description || '',
        price: parseFloat(op.data.price) || 0,
        category_id: categoryNum,
        is_featured: !!op.data.is_featured
      });
      break;
    }
    case 'update_item': {
      if (!op.target_name) throw new Error('Hedef ürün adı eksik');
      const item = await db.collection('items').findOne({ name: op.target_name });
      if (!item) throw new Error('Ürün bulunamadı: ' + op.target_name);
      const set = {};
      if (op.data.name !== undefined) set.name = op.data.name;
      if (op.data.price !== undefined) set.price = parseFloat(op.data.price) || 0;
      if (op.data.description !== undefined) set.description = op.data.description;
      if (op.data.is_featured !== undefined) set.is_featured = !!op.data.is_featured;
      if (op.data.category_name) {
        const cat = await db.collection('categories').findOne({ name: op.data.category_name });
        if (cat) set.category_id = cat.category_num;
      }
      await db.collection('items').updateOne({ _id: item._id }, { $set: set });
      break;
    }
    case 'delete_item': {
      if (!op.target_name) throw new Error('Hedef ürün adı eksik');
      await db.collection('items').deleteOne({ name: op.target_name });
      break;
    }
    default:
      throw new Error('Bilinmeyen işlem: ' + op.action);
  }
}

// AI ile menü güncelleme önizleme
async function handleAiPreview(prompt, imageData, sessionId) {
  if (!isAdmin(sessionId)) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'Yetkisiz erişim' }) };
  }
  if (!process.env.OPENAI_API_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'OPENAI_API_KEY ortam değişkeni tanımlanmamış' }) };
  }
  try {
    const db = await connectToDatabase();
    const categories = await db.collection('categories').find({}).toArray();
    const items = await db.collection('items').find({}).toArray();
    const currentMenu = categories.map(c => {
      const catItems = items.filter(i => Number(i.category_id) === Number(c.category_num)).map(i => ({ name: i.name, price: i.price, description: i.description, is_featured: i.is_featured }));
      return { name: c.name, category_num: c.category_num, img_url: c.img_url || '', items: catItems };
    });
    const systemPrompt = `You are a restaurant menu manager for "Gözde Pide". Current menu is provided as JSON. The user gives a request in Turkish and/or a menu photo. Return ONLY a JSON object with key "operations" (array). Each operation: { action: "add_category" | "update_category" | "delete_category" | "add_item" | "update_item" | "delete_item", target_name?: string, data?: object }. Category data: name, category_num, img_url (string). Item data: name, price (number), description, category_name, is_featured (boolean). For update/delete, target_name is the current name. Do not output markdown.`;
    const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: [] }];
    const userContent = [];
    const requestText = prompt || 'Fotoğraftaki menüyü okuyarak mevcut menüyü güncelle.';
    const userText = 'Mevcut menü: ' + JSON.stringify(currentMenu) + '\\n\\nKullanıcı isteği: ' + requestText;
    userContent.push({ type: 'text', text: userText });
    if (imageData) userContent.push({ type: 'image_url', image_url: { url: imageData } });
    messages[1].content = userContent;
    const payload = { model: 'gpt-4o-mini', messages, temperature: 0.2, max_tokens: 2048 };
    const resultText = await callOpenAI(payload);
    const cleaned = resultText.replace(/^```json\\s*/, '').replace(/```\\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    const operations = parsed.operations || [];
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, operations }) };
  } catch (error) {
    console.error('AI önizleme hatası:', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'Hata: ' + error.message }) };
  }
}

// AI ile onaylanan menü güncellemesini uygulama
async function handleAiApply(operations, sessionId) {
  if (!isAdmin(sessionId)) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'Yetkisiz erişim' }) };
  }
  if (!Array.isArray(operations)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'Geçersiz işlem listesi' }) };
  }
  try {
    const db = await connectToDatabase();
    const operationResults = [];
    for (const op of operations) {
      try {
        await applyAiOperation(db, op);
        operationResults.push(op.action + ' başarılı');
      } catch (e) {
        operationResults.push(op.action + ' hata: ' + e.message);
      }
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, message: 'AI güncellemesi tamamlandı: ' + operationResults.join(', ') }) };
  } catch (error) {
    console.error('AI uygulama hatası:', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'Hata: ' + error.message }) };
  }
}

// Admin: Sipariş Yönetimi sayfası
function renderAdminOrders() {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sipariş Yönetimi - Gözde Pide</title>
<link rel="stylesheet" href="/static/admin.css">
</head>
<body>
<nav class="admin-navbar">
  <div class="nav-brand"><span class="brand-icon">GP</span> Gözde Pide</div>
  <div class="nav-links">
    <a href="/admin">Menü</a>
    <a href="/admin/orders" class="active">Siparişler</a>
    <a href="/admin/campaigns">Kampanyalar</a>
    <a href="/admin/reports">Raporlar</a>
  </div>
  <a href="/logout" class="nav-logout">Çıkış</a>
</nav>
<div class="admin-content">
  <div class="page-title">Sipariş Yönetimi</div>
  <div class="filters">
    <button class="filter-btn active" data-status="all">Tümü</button>
    <button class="filter-btn" data-status="pending">Bekliyor</button>
    <button class="filter-btn" data-status="preparing">Hazırlanıyor</button>
    <button class="filter-btn" data-status="on_the_way">Yolda</button>
    <button class="filter-btn" data-status="delivered">Teslim Edildi</button>
    <button class="filter-btn" data-status="cancelled">İptal</button>
  </div>
  <div id="orders-list"><div class="loading">Siparişler yükleniyor...</div></div>
</div>
<script>
const statusLabels = { pending: 'Bekliyor', preparing: 'Hazırlanıyor', on_the_way: 'Yolda', delivered: 'Teslim Edildi', cancelled: 'İptal' };
const orderTypes = { delivery: 'Gel-Al', pickup: 'Self Pickup', dine_in: 'Restoranda' };
const paymentMethods = { online: 'Online', cash_on_delivery: 'Kapıda Ödeme' };

async function loadOrders(status) {
  document.getElementById('orders-list').innerHTML = '<div class="loading">Siparişler yükleniyor...</div>';
  try {
    const res = await fetch('/api/orders?status=' + status, { credentials: 'include' });
    if (res.status === 401) { window.location.href = '/login'; return; }
    const orders = await res.json();
    if (!Array.isArray(orders) || orders.length === 0) {
      document.getElementById('orders-list').innerHTML = '<div class="no-data">Sipariş bulunamadı.</div>';
      return;
    }
    document.getElementById('orders-list').innerHTML = orders.map(o => {
      const items = (o.order_items || []).map(i =>
        '<div class="order-item-row"><span>' + (i.quantity || 1) + 'x ' + (i.product_name || '') + '</span><span>' + (parseFloat(i.product_price) || 0) * (i.quantity || 1) + ' TL</span></div>'
      ).join('');
      const date = new Date(o.created_at).toLocaleString('tr-TR');
      const branchName = o.branch ? o.branch.name : '-';
      const userName = o.user ? (o.user.full_name || o.user.phone || '-') : '-';
      return '<div class="order-card status-' + o.status + '">' +
        '<div class="order-header">' +
          '<span class="order-id">#' + (o.id || '').substring(0, 8) + '</span>' +
          '<span class="order-date">' + date + '</span>' +
          '<span class="badge badge-' + o.status + '">' + (statusLabels[o.status] || o.status) + '</span>' +
        '</div>' +
        '<div class="order-info">' +
          '<div class="info-item"><strong>Şube:</strong> ' + branchName + '</div>' +
          '<div class="info-item"><strong>Müşteri:</strong> ' + userName + '</div>' +
          '<div class="info-item"><strong>Tip:</strong> ' + (orderTypes[o.order_type] || o.order_type) + '</div>' +
          '<div class="info-item"><strong>Ödeme:</strong> ' + (paymentMethods[o.payment_method] || o.payment_method) + '</div>' +
          '<div class="info-item"><strong>Toplam:</strong> ' + (parseFloat(o.total) || 0) + ' TL</div>' +
          (o.scheduled_for ? '<div class="info-item"><strong>Planlanan:</strong> ' + new Date(o.scheduled_for).toLocaleString('tr-TR') + '</div>' : '') +
          (o.note ? '<div class="info-item"><strong>Not:</strong> ' + o.note + '</div>' : '') +
        '</div>' +
        (items ? '<div class="order-items">' + items + '</div>' : '') +
        '<select class="status-select" onchange="updateStatus(\\'' + o.id + '\\', this.value)">' +
          Object.entries(statusLabels).map(([k, v]) => '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + v + '</option>').join('') +
        '</select>' +
      '</div>';
    }).join('');
  } catch (err) {
    document.getElementById('orders-list').innerHTML = '<div class="no-data">Hata: ' + err.message + '</div>';
  }
}

async function updateStatus(orderId, status) {
  try {
    const res = await fetch('/api/orders/' + orderId + '/status', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      loadOrders(currentStatus);
    } else {
      alert('Durum güncellenemedi');
    }
  } catch (err) {
    alert('Hata: ' + err.message);
  }
}

let currentStatus = 'all';
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentStatus = this.dataset.status;
    loadOrders(currentStatus);
  });
});
loadOrders('all');
</script>
<script src="/static/admin-notifications.js"></script>
</body>
</html>`;
}

// Admin: Kampanya Yönetimi sayfası
function renderAdminCampaigns() {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kampanyalar - Gözde Pide</title>
<link rel="stylesheet" href="/static/admin.css">
</head>
<body>
<nav class="admin-navbar">
  <div class="nav-brand"><span class="brand-icon">GP</span> Gözde Pide</div>
  <div class="nav-links">
    <a href="/admin">Menü</a>
    <a href="/admin/orders">Siparişler</a>
    <a href="/admin/campaigns" class="active">Kampanyalar</a>
    <a href="/admin/reports">Raporlar</a>
  </div>
  <a href="/logout" class="nav-logout">Çıkış</a>
</nav>
<div class="admin-content">
  <div class="page-title">Kampanyalar</div>
  <div class="card">
    <h2>Yeni Kampanya Oluştur</h2>
    <div class="form-group"><label>Başlık</label><input type="text" id="camp-title" placeholder="Kampanya başlığı"></div>
    <div class="form-group"><label>Açıklama</label><textarea id="camp-desc" placeholder="Kampanya açıklaması"></textarea></div>
    <div class="form-group"><label>Tip</label><select id="camp-type"><option value="push">Push Bildirim</option><option value="segment">Segment</option></select></div>
    <div class="form-group"><label>Hedef Segment (opsiyonel)</label><input type="text" id="camp-segment" placeholder="Örn: all, vip, inactive"></div>
    <div class="form-group"><label>Planlanan Tarih (opsiyonel)</label><input type="datetime-local" id="camp-scheduled"></div>
    <button class="btn btn-primary" onclick="createCampaign()">Kampanya Oluştur</button>
  </div>
  <div id="campaigns-list"><div class="loading">Kampanyalar yükleniyor...</div></div>
</div>
<script>
async function loadCampaigns() {
  try {
    const res = await fetch('/api/campaigns', { credentials: 'include' });
    if (res.status === 401) { window.location.href = '/login'; return; }
    const campaigns = await res.json();
    if (!Array.isArray(campaigns) || campaigns.length === 0) {
      document.getElementById('campaigns-list').innerHTML = '<div class="no-data">Henüz kampanya yok.</div>';
      return;
    }
    document.getElementById('campaigns-list').innerHTML = campaigns.map(c => {
      const date = new Date(c.created_at).toLocaleString('tr-TR');
      const scheduled = c.scheduled_at ? ' | Planlanan: ' + new Date(c.scheduled_at).toLocaleString('tr-TR') : '';
      const sent = c.is_sent ? ' <span style="color:#2e7d32;">Gönderildi</span>' : ' <span style="color:#e65100;">Bekliyor</span>';
      return '<div class="campaign-card">' +
        '<div class="campaign-info">' +
          '<h3>' + (c.title || '') + '</h3>' +
          '<p>' + (c.description || '') + '</p>' +
          '<div class="campaign-meta">Tip: ' + (c.type || '') + (c.target_segment ? ' | Segment: ' + c.target_segment : '') + ' | ' + date + scheduled + sent + '</div>' +
        '</div>' +
        '<button class="btn btn-red" onclick="deleteCampaign(\\'' + c.id + '\\')">Sil</button>' +
      '</div>';
    }).join('');
  } catch (err) {
    document.getElementById('campaigns-list').innerHTML = '<div class="no-data">Hata: ' + err.message + '</div>';
  }
}

async function createCampaign() {
  const title = document.getElementById('camp-title').value.trim();
  if (!title) { alert('Başlık gereklidir'); return; }
  const data = {
    title,
    description: document.getElementById('camp-desc').value.trim(),
    type: document.getElementById('camp-type').value,
    target_segment: document.getElementById('camp-segment').value.trim() || null,
    scheduled_at: document.getElementById('camp-scheduled').value || null
  };
  try {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      document.getElementById('camp-title').value = '';
      document.getElementById('camp-desc').value = '';
      document.getElementById('camp-segment').value = '';
      document.getElementById('camp-scheduled').value = '';
      loadCampaigns();
    } else {
      alert('Kampanya oluşturulamadı');
    }
  } catch (err) {
    alert('Hata: ' + err.message);
  }
}

async function deleteCampaign(id) {
  if (!confirm('Bu kampanyayı silmek istediğinize emin misiniz?')) return;
  try {
    const res = await fetch('/api/campaigns/' + id, { method: 'DELETE', credentials: 'include' });
    if (res.ok) loadCampaigns();
    else alert('Silinemedi');
  } catch (err) {
    alert('Hata: ' + err.message);
  }
}
loadCampaigns();
</script>
<script src="/static/admin-notifications.js"></script>
</body>
</html>`;
}

// Admin: Raporlar sayfası
function renderAdminReports() {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Raporlar - Gözde Pide</title>
<link rel="stylesheet" href="/static/admin.css">
</head>
<body>
<nav class="admin-navbar">
  <div class="nav-brand"><span class="brand-icon">GP</span> Gözde Pide</div>
  <div class="nav-links">
    <a href="/admin">Menü</a>
    <a href="/admin/orders">Siparişler</a>
    <a href="/admin/campaigns">Kampanyalar</a>
    <a href="/admin/reports" class="active">Raporlar</a>
  </div>
  <a href="/logout" class="nav-logout">Çıkış</a>
</nav>
<div class="admin-content">
  <div class="page-title">Raporlar</div>
  <div id="report-content"><div class="loading">Raporlar yükleniyor...</div></div>
</div>
<script>
async function loadReports() {
  try {
    const res = await fetch('/api/reports', { credentials: 'include' });
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();
    
    const statsHtml = '<div class="stats-grid">' +
      '<div class="stat-card"><div class="stat-value">' + (data.totalOrders || 0) + '</div><div class="stat-label">Toplam Sipariş</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + (data.totalRevenue || 0).toFixed(0) + ' TL</div><div class="stat-label">Toplam Ciro</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + (data.pendingOrders || 0) + '</div><div class="stat-label">Bekleyen</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + (data.preparingOrders || 0) + '</div><div class="stat-label">Hazırlanan</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + (data.onTheWayOrders || 0) + '</div><div class="stat-label">Yolda</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + (data.deliveredOrders || 0) + '</div><div class="stat-label">Teslim Edilen</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + (data.cancelledOrders || 0) + '</div><div class="stat-label">İptal</div></div>' +
    '</div>';
    
    const maxRevenue = Math.max(...(data.dailyRevenue || []).map(d => d.revenue), 1);
    const chartHtml = '<div class="card"><h2>Son 7 Gün - Günlük Ciro</h2>' +
      '<div class="bar-chart">' +
        (data.dailyRevenue || []).map(d => {
          const height = (d.revenue / maxRevenue * 180);
          const dayName = new Date(d.date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' });
          return '<div class="bar-container">' +
            '<div class="bar-value">' + d.revenue.toFixed(0) + '</div>' +
            '<div class="bar" style="height:' + height + 'px;"></div>' +
            '<div class="bar-label">' + dayName + '</div>' +
          '</div>';
        }).join('') +
      '</div></div>';
    
    const popularHtml = '<div class="card"><h2>Popüler Ürünler</h2>' +
      '<table><thead><tr><th>Ürün</th><th>Adet</th><th>Ciro</th></tr></thead><tbody>' +
        (data.popularItems || []).map(i => '<tr><td>' + i.name + '</td><td>' + i.quantity + '</td><td>' + i.revenue.toFixed(0) + ' TL</td></tr>').join('') +
      '</tbody></table></div>';
    
    document.getElementById('report-content').innerHTML = statsHtml + chartHtml + popularHtml;
  } catch (err) {
    document.getElementById('report-content').innerHTML = '<div class="loading">Hata: ' + err.message + '</div>';
  }
}
loadReports();
</script>
<script src="/static/admin-notifications.js"></script>
</body>
</html>`;
}

// API handler
module.exports = async (req, res) => {
  const url = req.url;
  const method = req.method;
  
  // Cookies ve session ID'yi çıkar
  const cookies = cookie.parse(req.headers.cookie || '');
  const sessionId = cookies.sessionId;
  
  console.log('URL:', url);
  console.log('Metod:', method);
  console.log('Oturum ID:', sessionId);
  console.log('Admin mi:', isAdmin(sessionId));

  // Admin alt sayfalar - Oturum gerektiren erişim
  if (url === '/admin/orders') {
    if (!isAdmin(sessionId)) return res.writeHead(302, { 'Location': '/login' }).end();
    const html = renderAdminOrders();
    return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(html);
  }
  
  if (url === '/admin/campaigns') {
    if (!isAdmin(sessionId)) return res.writeHead(302, { 'Location': '/login' }).end();
    const html = renderAdminCampaigns();
    return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(html);
  }
  
  if (url === '/admin/reports') {
    if (!isAdmin(sessionId)) return res.writeHead(302, { 'Location': '/login' }).end();
    const html = renderAdminReports();
    return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(html);
  }

  // Admin sayfası - Oturum gerektiren erişim
  if (url === '/admin' || url === '/admin/') {
    const result = await renderAdmin(sessionId);
    
    // Başlıkları ve durumu ayarla
    Object.entries(result.headers || {}).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    
    // Yönlendirme varsa, doğru şekilde ayarla
    if (result.headers && result.headers['Location']) {
      return res.writeHead(302, { 'Location': result.headers['Location'] }).end(result.body);
    }
    
    return res.status(result.statusCode).end(result.body);
  }
  
  // Tanitim sayfasi
  if (url === '/tanitim') {
    try {
      const db = await connectToDatabase();
      const items = await db.collection('items').find({}).toArray();
      const priceMap = {};
      items.forEach(item => {
        if (item.name && item.price !== undefined) {
          priceMap[item.name.toLowerCase().trim()] = parseFloat(item.price).toFixed(0);
        }
      });
      const injectedScript = `<script>window.__GALERI_PRICES__ = ${JSON.stringify(priceMap)};</script>`;
      const html = tanitimTemplate.replace('<script>', injectedScript + '\n    <script>');
      return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(html);
    } catch (err) {
      console.error('Tanitim fiyat yukleme hatasi:', err);
      return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(tanitimTemplate);
    }
  }

  // Ana sayfa (kategoriler)
  if (url === '/' || url === '') {
    const result = await renderIndex();
    return res.status(result.statusCode).end(result.body);
  }
  
  // Kategori sayfası
  if (url.startsWith('/category/')) {
    const categoryId = url.split('/category/')[1];
    if (categoryId) {
      const result = await renderCategory(categoryId);
      return res.status(result.statusCode).end(result.body);
    }
  }
  
  // Eski menü sayfası
  if (url === '/menu') {
    const result = await renderMenu();
    return res.status(result.statusCode).end(result.body);
  }
  
  // Login sayfası
  if (url === '/login') {
    console.log('Login sayfası isteği:', method);
    
    if (method === 'GET') {
      const result = renderLogin();
      return res.status(result.statusCode).end(result.body);
    } else if (method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        console.log('Login POST verisi:', body);
        
        try {
          // Form verilerini ayrıştır ve handleLogin'e gönder
          const formData = querystring.parse(body);
          console.log('Ayrıştırılmış login verileri:', formData);
          
          const result = await handleLogin(formData);
          
          // Çerezleri ve yönlendirmeyi düzgün şekilde ayarla
          if (result.headers && result.headers['Set-Cookie']) {
            res.setHeader('Set-Cookie', result.headers['Set-Cookie']);
          }
          
          if (result.headers && result.headers['Location']) {
            return res.writeHead(302, {
              'Location': result.headers['Location']
            }).end(result.body);
          } else {
            return res.status(result.statusCode).end(result.body);
          }
        } catch (error) {
          console.error('Login hatası:', error);
          return res.status(500).end('Giriş işlemi sırasında hata oluştu');
        }
      });
      
      return;
    }
  }
  
  // Çıkış yapma
  if (url === '/logout') {
    const result = handleLogout();
    
    // Çerezleri ve yönlendirmeyi düzgün şekilde ayarla
    if (result.headers && result.headers['Set-Cookie']) {
      res.setHeader('Set-Cookie', result.headers['Set-Cookie']);
    }
    
    return res.writeHead(302, {
      'Location': result.headers['Location']
    }).end(result.body);
  }
  
  // Ürün ekleme
  if (url === '/add_item' && method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      const formData = querystring.parse(body);
      const result = await handleAddItem(formData, sessionId);
      
      if (result.headers && result.headers['Location']) {
        return res.writeHead(302, {
          'Location': result.headers['Location']
        }).end(result.body);
      }
      
      return res.status(result.statusCode).end(result.body);
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
      const formData = querystring.parse(body);
      const result = await handleAddCategory(formData, sessionId);
      
      if (result.headers && result.headers['Location']) {
        return res.writeHead(302, {
          'Location': result.headers['Location']
        }).end(result.body);
      }
      
      return res.status(result.statusCode).end(result.body);
    });
    
    return;
  }
  
  // Ürün silme
  if (url.startsWith('/delete_item/')) {
    const itemId = url.split('/delete_item/')[1];
    const result = await handleDeleteItem(itemId, sessionId);
    
    if (result.headers && result.headers['Location']) {
      return res.writeHead(302, {
        'Location': result.headers['Location']
      }).end(result.body);
    }
    
    return res.status(result.statusCode).end(result.body);
  }
  
  // Kategori silme
  if (url.startsWith('/delete_category/')) {
    const categoryId = url.split('/delete_category/')[1];
    const result = await handleDeleteCategory(categoryId, sessionId);
    
    if (result.headers && result.headers['Location']) {
      return res.writeHead(302, {
        'Location': result.headers['Location']
      }).end(result.body);
    }
    
    return res.status(result.statusCode).end(result.body);
  }
  
  // Kategori düzenleme
  if (url === '/edit_category' && method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      const formData = querystring.parse(body);
      const result = await handleEditCategory(formData, sessionId);
      
      if (result.headers && result.headers['Location']) {
        return res.writeHead(302, {
          'Location': result.headers['Location']
        }).end(result.body);
      }
      
      return res.status(result.statusCode).end(result.body);
    });
    
    return;
  }
  
  // Ürün düzenleme
  if (url === '/edit_item' && method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      const formData = querystring.parse(body);
      const result = await handleEditItem(formData, sessionId);
      
      if (result.headers && result.headers['Location']) {
        return res.writeHead(302, {
          'Location': result.headers['Location']
        }).end(result.body);
      }
      
      return res.status(result.statusCode).end(result.body);
    });
    
    return;
  }
  
  // AI menü güncelleme önizleme
  if (url === '/ai_update' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const json = body ? JSON.parse(body) : {};
        const result = await handleAiPreview(json.prompt || '', json.image_data || '', sessionId);
        if (result.headers) {
          Object.entries(result.headers).forEach(([key, value]) => res.setHeader(key, value));
        }
        return res.status(result.statusCode).end(result.body);
      } catch (error) {
        console.error('AI endpoint hatası:', error);
        return res.status(500).end(JSON.stringify({ success: false, message: 'Hata: ' + error.message }));
      }
    });
    return;
  }

  // AI menü güncellemeyi onayla uygulama
  if (url === '/ai_apply' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const json = body ? JSON.parse(body) : {};
        const result = await handleAiApply(json.operations || [], sessionId);
        if (result.headers) {
          Object.entries(result.headers).forEach(([key, value]) => res.setHeader(key, value));
        }
        return res.status(result.statusCode).end(result.body);
      } catch (error) {
        console.error('AI apply endpoint hatası:', error);
        return res.status(500).end(JSON.stringify({ success: false, message: 'Hata: ' + error.message }));
      }
    });
    return;
  }

  // Mobil sesli sipariş endpoint'i
  if (url === '/api/receipt/voice' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const json = body ? JSON.parse(body) : {};
        const result = await handleVoiceScan(json.audio_data || '');
        if (result.headers) Object.entries(result.headers).forEach(([key, value]) => res.setHeader(key, value));
        return res.status(result.statusCode).end(result.body);
      } catch (error) {
        console.error('Sesli sipariş endpoint hatası:', error);
        return res.status(500).end(JSON.stringify({ message: 'Hata: ' + error.message }));
      }
    });
    return;
  }

  // Mobil fiş tarama endpoint'i
  if (url === '/api/receipt/scan' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const json = body ? JSON.parse(body) : {};
        const result = await handleReceiptScan(json.image_data || '');
        if (result.headers) Object.entries(result.headers).forEach(([key, value]) => res.setHeader(key, value));
        return res.status(result.statusCode).end(result.body);
      } catch (error) {
        console.error('Fiş endpoint hatası:', error);
        return res.status(500).end(JSON.stringify({ message: 'Hata: ' + error.message }));
      }
    });
    return;
  }

  // Admin API: Siparişleri getir
  if (method === 'GET' && (url.startsWith('/api/orders?') || url === '/api/orders')) {
    if (!isAdmin(sessionId)) return res.status(401).end(JSON.stringify({ error: 'Yetkisiz' }));
    try {
      const urlObj = new URL(url, 'http://localhost');
      const statusFilter = urlObj.searchParams.get('status') || 'all';
      const orders = await fetchOrders(statusFilter);
      return res.status(200).setHeader('Content-Type', 'application/json').end(JSON.stringify(orders));
    } catch (error) {
      return res.status(500).end(JSON.stringify({ error: error.message }));
    }
  }

  // Admin API: Sipariş durumu güncelle
  if (url.startsWith('/api/orders/') && url.endsWith('/status') && method === 'PATCH') {
    if (!isAdmin(sessionId)) return res.status(401).end(JSON.stringify({ error: 'Yetkisiz' }));
    const orderId = url.split('/api/orders/')[1].split('/status')[0];
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const json = JSON.parse(body);
        await updateOrderStatus(orderId, json.status);
        return res.status(200).setHeader('Content-Type', 'application/json').end(JSON.stringify({ success: true }));
      } catch (error) {
        return res.status(500).end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Admin API: Kampanyaları getir
  if (url === '/api/campaigns' && method === 'GET') {
    if (!isAdmin(sessionId)) return res.status(401).end(JSON.stringify({ error: 'Yetkisiz' }));
    try {
      const campaigns = await fetchCampaigns();
      return res.status(200).setHeader('Content-Type', 'application/json').end(JSON.stringify(campaigns));
    } catch (error) {
      return res.status(500).end(JSON.stringify({ error: error.message }));
    }
  }

  // Admin API: Kampanya oluştur
  if (url === '/api/campaigns' && method === 'POST') {
    if (!isAdmin(sessionId)) return res.status(401).end(JSON.stringify({ error: 'Yetkisiz' }));
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const json = JSON.parse(body);
        const result = await createCampaign({
          title: json.title || '',
          description: json.description || '',
          type: json.type || 'push',
          target_segment: json.target_segment || null,
          scheduled_at: json.scheduled_at || null,
          is_sent: false
        });
        return res.status(200).setHeader('Content-Type', 'application/json').end(JSON.stringify(result));
      } catch (error) {
        return res.status(500).end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Admin API: Kampanya sil
  if (url.startsWith('/api/campaigns/') && method === 'DELETE') {
    if (!isAdmin(sessionId)) return res.status(401).end(JSON.stringify({ error: 'Yetkisiz' }));
    const campaignId = url.split('/api/campaigns/')[1];
    try {
      await deleteCampaign(campaignId);
      return res.status(200).setHeader('Content-Type', 'application/json').end(JSON.stringify({ success: true }));
    } catch (error) {
      return res.status(500).end(JSON.stringify({ error: error.message }));
    }
  }

  // Admin API: Rapor verisi
  if (url === '/api/reports' && method === 'GET') {
    if (!isAdmin(sessionId)) return res.status(401).end(JSON.stringify({ error: 'Yetkisiz' }));
    try {
      const data = await fetchReportData();
      return res.status(200).setHeader('Content-Type', 'application/json').end(JSON.stringify(data));
    } catch (error) {
      return res.status(500).end(JSON.stringify({ error: error.message }));
    }
  }

  // Statik dosyalar için handler
  if (url.startsWith('/static/')) {
    try {
      // URL'den dosya yolunu al (/static/ kısmını çıkararak)
      const requestedFilePath = url.substring(7); // '/static/' kısmını çıkar
      const filePath = path.join(__dirname, '..', 'static', requestedFilePath);
      
      // Dosyanın var olup olmadığını kontrol et
      if (!fs.existsSync(filePath)) {
        return res.status(404).end('Dosya bulunamadı');
      }
      
      // MIME tipini belirle
      const contentType = getContentType(filePath);
      
      // Dosyayı oku ve gönder
      const fileContent = fs.readFileSync(filePath);
      res.setHeader('Content-Type', contentType);
      return res.status(200).end(fileContent);
    } catch (error) {
      console.error('Statik dosya sunma hatası:', error);
      return res.status(500).end('Dosya sunulurken hata oluştu');
    }
  }
  
  // Eğer hiçbir route eşleşmezse:
res.writeHead(302, { Location: '/' });
return res.end();

};

// MIME tipini belirle
function getContentType(filePath) {
  const extname = path.extname(filePath);
  switch (extname) {
    case '.html':
      return 'text/html';
    case '.css':
      return 'text/css';
    case '.js':
      return 'text/javascript';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    default:
      return 'text/plain';
  }
}
