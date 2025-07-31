// Vercel API rotası
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const querystring = require('querystring');
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

// Oturum anahtarı
const SESSION_SECRET = 'supersecretkey';

// Basit oturum yönetimi
const sessions = {};

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
    
    // HTML şablonunu oku
    let html = indexTemplate;
    
    // Kategorileri ekle
    let categoriesGridHtml = '';
    
    if (categories.length > 0) {
      categories.forEach(category => {
        // Türkçe karakterleri İngilizce'ye çeviren fonksiyon kullanılsın
        const categoryNameAscii = toAscii(category.name);
        const categoryImgPath = `/static/category_images/${categoryNameAscii}.jpg`;
        
        categoriesGridHtml += `
          <a href="/category/${category._id}" class="category-card">
            <div class="category-img-container">
              <img src="${categoryImgPath}" alt="${category.name}" class="category-img" onerror="this.style.display='none'">
            </div>
            <div class="category-name">${category.name}</div>
          </a>
        `;
      });
    } else {
      categoriesGridHtml = '<p class="no-items">Henüz kategori bulunmamaktadır.</p>';
    }
    
    // Kategori grid içeriğini HTML'e ekle
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
          imagesHtml += `<div class="category-image-container"><img src="/static/category_images/${imgFile}" class="category-detail-img" alt="${category.name}" onerror="this.style.display='none'"></div>`;
        });
      } else {
        // Hiç içerik resmi yoksa, hiçbir şey gösterme
        imagesHtml = '';
      }
    } catch (err) {
      // Hata olursa sadece fallback resmi göster
      imagesHtml = `<div class="category-image-container"><img src="/static/category_images/${categoryName}.jpg" class="category-detail-img" alt="${category.name}" onerror="this.style.display='none'"></div>`;
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
    
    // Ürünlere resim URL'si ekle
    items.forEach(item => {
      const imgBase = item.name.toLowerCase().replace(/ /g, '_');
      item.img_url = `/static/uploads/${imgBase}.jpg`;
    });
    
    // HTML şablonunu oku
    let html = menuTemplate;
    
    // Kategorileri ve ürünleri ekle
    let menuContent = '';
    
    if (categories.length > 0) {
      categories.forEach(category => {
        // Kategori başlığını ekle
        menuContent += `<div class="menu-section-title" data-category="${category.name}">${category.name}</div>`;
        menuContent += '<ul class="menu-list">';
        
        // Bu kategoriye ait ürünleri filtrele
        const categoryItems = items.filter(item => {
          try {
            return item.category_id && item.category_id.toString() === category._id.toString();
          } catch (e) {
            return false;
          }
        });
        
        // Kategoriye ait ürünleri ekle
        if (categoryItems.length > 0) {
          categoryItems.forEach(item => {
            menuContent += `
              <li class="menu-item-row">
                <div class="menu-item-info">
                  <span class="menu-item-name">${item.name}</span>
                </div>
                <span class="menu-item-price">${parseFloat(item.price).toFixed(0)} ₺</span>
                <img src="${item.img_url}" class="menu-img-thumb" alt="${item.name}" onerror="this.src='/static/uploads/pide_bg.jpg'">
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
  if (!sessionId || !sessions[sessionId] || !sessions[sessionId].admin) {
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
      categoryListHtml += `
        <tr>
          <td>${category.name}</td>
          <td><a href="/delete_category/${category._id}" class="delete-btn">Sil</a></td>
        </tr>
      `;
    });
    
    // Kategori listesini HTML'e ekle
    html = html.replace('<!-- CATEGORIES_LIST -->', categoryListHtml);
    
    // Ürün listesini oluştur
    let itemsHtml = '';
    items.forEach(item => {
      let categoryName = 'Kategorisi yok';
      
      // Kategori ID'sini güvenli bir şekilde kontrol et
      if (item.category_id) {
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
          // Kategori ID'sini sayısal veya string olarak al
          let numCategoryId = null;
          
          try {
            // String veya sayı olabilir - sayısala çevirmeye çalış
            numCategoryId = typeof item.category_id === 'number' ? 
              item.category_id : 
              parseInt(item.category_id);
              
            // Eğer sayısala çevrilemiyorsa ObjectId olabilir
            if (isNaN(numCategoryId) && typeof item.category_id === 'string' && item.category_id.length === 24) {
              try {
                // ObjectId'yi string olarak karşılaştır
                category = categories.find(c => c._id.toString() === item.category_id);
              } catch (e) {
                console.log(`ObjectId karşılaştırma hatası: ${e.message}`);
              }
            }
            
            // Sayısal kategori ID ile eşleştir (category_num alanı ile)
            if (!category && !isNaN(numCategoryId)) {
              category = categories.find(c => c.category_num === numCategoryId);
              console.log(`${item.name} ürünü için kategori sayısal ID ile eşleştirildi: ${numCategoryId}`);
            }
          } catch (e) {
            console.log(`Kategori ID dönüşüm hatası: ${e.message}`);
          }
          
          // 3. Son çare - ID'yi içeren durumlar için (kısmi eşleşme)
          if (!category && numCategoryId) {
            category = categories.find(c => c._id.toString().includes(numCategoryId.toString()));
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
        <tr>
          <td>${item.name}</td>
          <td>${categoryName}</td>
          <td>${parseFloat(item.price).toFixed(0)} ₺</td>
          <td>
            <a href="#" class="edit-btn" onclick="editItem('${item._id}', '${item.name.replace(/'/g, "\\'")}', '${(item.description || '').replace(/'/g, "\\'")}', ${parseFloat(item.price).toFixed(0)}, '${item.category_id}')">Düzenle</a>
            <a href="/delete_item/${item._id}" class="delete-btn">Sil</a>
          </td>
        </tr>
      `;
    });
    
    // Ürün listesini HTML'e ekle
    html = html.replace('<!-- ITEMS_LIST -->', itemsHtml);
    
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
    const sessionId = crypto.randomBytes(16).toString('hex');
    sessions[sessionId] = { admin: true, created: Date.now() };
    
    console.log('Oturum oluşturuldu:', sessionId);
    console.log('Aktif oturumlar:', sessions);
    
    return {
      statusCode: 302,
      headers: {
        'Location': '/admin',
        'Set-Cookie': `sessionId=${sessionId}; Path=/; HttpOnly; SameSite=Strict`
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
  if (!sessionId || !sessions[sessionId] || !sessions[sessionId].admin) {
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
  let name, description, price, category_id;
  
  if (typeof body === 'string') {
    // URL kodlu form verisi
    const params = querystring.parse(body);
    name = params.name;
    description = params.description;
    price = params.price;
    category_id = params.category_id;
  } else {
    // Veri zaten ayrıştırılmış nesne olarak gelmiş
    name = body.name;
    description = body.description;
    price = body.price;
    category_id = body.category_id;
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
    
    // Kategori ID'si doğrulama
    let categoryObjId;
    try {
      if (!useLocalData) {
        categoryObjId = new ObjectId(category_id);
      } else {
        categoryObjId = category_id;
      }
    } catch (err) {
      console.error('Geçersiz kategori ID:', category_id, err);
      return {
        statusCode: 400,
        body: `Hata: Geçersiz kategori ID'si. Lütfen geçerli bir kategori seçin.`,
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      };
    }
    
    const result = await db.collection('items').insertOne({
      name,
      description: description || '',
      price: parseFloat(price),
      category_id: parseInt(category_id, 10)
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
  if (!sessionId || !sessions[sessionId] || !sessions[sessionId].admin) {
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
  let name;
  
  if (typeof body === 'string') {
    // URL kodlu form verisi
    const params = querystring.parse(body);
    name = params.name;
  } else {
    // Veri zaten ayrıştırılmış nesne olarak gelmiş
    name = body.name;
  }
  
  console.log('Kategori adı:', name);
  
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
      name
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
  if (!sessionId || !sessions[sessionId] || !sessions[sessionId].admin) {
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

// Kategori silme
async function handleDeleteCategory(categoryId, sessionId) {
  // Oturum kontrolü
  if (!sessionId || !sessions[sessionId] || !sessions[sessionId].admin) {
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
  if (!sessionId || !sessions[sessionId] || !sessions[sessionId].admin) {
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
      
      if (category && category.category_num) {
        // Kategori bulundu, sayısal ID'sini kullan
        categoryIdNum = category.category_num;
        console.log(`Kategori bulundu: ${category.name}, sayısal ID: ${categoryIdNum}`);
      } else {
        // Kategori bulunamadı veya category_num yok, kategoriId'yi sayısal olarak çevirmeyi dene
        try {
          categoryIdNum = parseInt(categoryId);
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
        categoryIdNum = parseInt(categoryId);
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
          category_id: categoryIdNum  // Sayısal kategori ID'yi kullan
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
  console.log('Oturumlar:', sessions);

  // Admin sayfası - Oturum gerektiren erişim
  if (url === '/admin' || url.startsWith('/admin/')) {
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
