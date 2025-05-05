from flask import Flask, render_template, request, redirect, url_for, flash, session
import os
from pymongo import MongoClient
from bson.objectid import ObjectId
import json
import time

# Mock veri - MongoDB bağlanamazsak kullanacağız
mock_data = {
    "categories": [
        {"_id": "1", "name": "Kebap Çeşitleri"},
        {"_id": "2", "name": "İçecek Çeşitleri"},
        {"_id": "3", "name": "Kahvaltı Çeşitleri"},
        {"_id": "4", "name": "Çorba Çeşitleri"},
        {"_id": "5", "name": "Fırın Ürünleri"}
    ],
    "items": [
        {"_id": "101", "name": "Adana Kebap", "price": 250, "category_id": "1", "description": "Özel lezzetli kebap"},
        {"_id": "102", "name": "Tavuk Şiş", "price": 220, "category_id": "1", "description": ""},
        {"_id": "103", "name": "Çay", "price": 20, "category_id": "2", "description": ""},
        {"_id": "104", "name": "Kahve", "price": 40, "category_id": "2", "description": ""},
        {"_id": "105", "name": "Serpme Kahvaltı", "price": 300, "category_id": "3", "description": "Zengin içerikli"},
        {"_id": "106", "name": "Mercimek Çorbası", "price": 80, "category_id": "4", "description": ""},
        {"_id": "107", "name": "Kıymalı Pide", "price": 180, "category_id": "5", "description": ""}
    ]
}

# Veritabanı durumu
use_local_data = False

# Mock veri sınıfları
class MockCollection:
    def __init__(self, data):
        self.data = data
    
    def find(self, query=None):
        return self.data
    
    def find_one(self, query):
        if '_id' in query:
            for item in self.data:
                if item['_id'] == query['_id']:
                    return item
        return None
    
    def insert_one(self, document):
        new_id = str(int(time.time()))
        document['_id'] = new_id
        self.data.append(document)
        class Result:
            acknowledged = True
            inserted_id = new_id
        return Result()
    
    def delete_one(self, query):
        if '_id' in query:
            for i, item in enumerate(self.data):
                if item['_id'] == query['_id']:
                    del self.data[i]
                    class Result:
                        deleted_count = 1
                    return Result()
        class Result:
            deleted_count = 0
        return Result()
    
    def delete_many(self, query):
        if 'category_id' in query:
            count = 0
            for i in range(len(self.data)-1, -1, -1):
                if self.data[i].get('category_id') == query['category_id']:
                    del self.data[i]
                    count += 1
            class Result:
                deleted_count = count
            return Result()
        class Result:
            deleted_count = 0
        return Result()

class MockDB:
    def __init__(self):
        self.categories = MockCollection(mock_data['categories'])
        self.items = MockCollection(mock_data['items'])
    
    def __getitem__(self, name):
        if name == 'categories':
            return self.categories
        elif name == 'items':
            return self.items
        raise KeyError(f"Collection '{name}' not found")

# Basit Flask uygulaması
app = Flask(__name__)
app.secret_key = 'supersecretkey'  # Bunu değiştir!

# MongoDB bağlantısı ve veritabanı nesneleri
client = None
db = None
categories_col = None
items_col = None

def connect_to_mongodb():
    global client, db, categories_col, items_col, use_local_data
    
    if use_local_data:
        print("Yerel veri kullanılıyor")
        mock_db = MockDB()
        categories_col = mock_db['categories']
        items_col = mock_db['items']
        return True
        
    try:
        # MongoDB bağlantısı
        MONGO_URI = os.environ.get('MONGODB_URI')
        if not MONGO_URI:
            # Önce SRV URI formatını dene
            MONGO_URI = 'mongodb+srv://arslantaha67:0022800228t@panel.gjn1k.mongodb.net/qrmenu?retryWrites=true&w=majority'
        
        print(f"MongoDB'ye bağlanılıyor: {MONGO_URI}")
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)  # 5 saniye timeout
        
        # Bağlantıyı test et
        client.server_info()
        
        db = client['qrmenu']
        categories_col = db['categories']
        items_col = db['items']
        print("MongoDB bağlantısı başarılı!")
        return True
    except Exception as e:
        print(f"MongoDB bağlantı hatası: {e}")
        print("Yerel veri kullanımına geçiliyor...")
        use_local_data = True
        return connect_to_mongodb()

# Uygulama başlangıcında MongoDB'ye bağlan
connect_to_mongodb()

@app.route('/')
def menu():
    categories = list(categories_col.find())
    # Ana sayfa artık kategorileri gösterecek
    return render_template('index.html', categories=categories)

@app.route('/category/<category_id>')
def category(category_id):
    try:
        # Kategori ID'sini ObjectId'ye dönüştür
        if not use_local_data:
            obj_category_id = ObjectId(category_id)
        else:
            obj_category_id = category_id
            
        # Kategori ve ilgili ürünleri al
        category = categories_col.find_one({'_id': obj_category_id})
        if not category:
            return redirect(url_for('menu'))
        
        if use_local_data:
            items = [item for item in items_col.find() if item.get('category_id') == category_id]
        else:
            items = list(items_col.find({'category_id': obj_category_id}))
            
        return render_template('category.html', category=category, items=items)
    except Exception as e:
        flash('Kategori gösterirken hata oluştu: ' + str(e))
        return redirect(url_for('menu'))

@app.route('/menu')
def old_menu():
    categories = list(categories_col.find())
    items = list(items_col.find())
    # Her ürün için uygun görsel yolunu belirle
    for item in items:
        img_base = item['name'].lower().replace(' ', '_')
        item['img_url'] = '/static/uploads/' + img_base + '.jpg'
    return render_template('menu.html', categories=categories, items=items)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if username == 'admin' and password == 'admin123':  # Şifreyi değiştir!
            session['admin'] = True
            return redirect(url_for('admin_panel'))
        else:
            flash('Kullanıcı adı veya şifre yanlış!')
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('admin', None)
    return redirect(url_for('menu'))

@app.route('/admin')
def admin_panel():
    if not session.get('admin'):
        return redirect(url_for('login'))
    categories = list(categories_col.find())
    items = list(items_col.find())
    return render_template('admin.html', categories=categories, items=items)

@app.route('/add_item', methods=['POST'])
def add_item():
    if not session.get('admin'):
        return redirect(url_for('login'))
    name = request.form['name']
    description = request.form['description']
    price = float(request.form['price'])
    category_id = request.form['category_id']
    if not category_id:
        flash('Lütfen bir kategori seçin!')
        return redirect(url_for('admin_panel'))
    try:
        obj_category_id = None
        try:
            obj_category_id = ObjectId(category_id)
        except Exception as e:
            flash('Kategori ID hatası: ' + str(e))
            return redirect(url_for('admin_panel'))
        result = items_col.insert_one({
            'name': name,
            'description': description,
            'price': price,
            'category_id': obj_category_id
        })
        if not result.acknowledged:
            flash('Ürün eklenemedi (MongoDB insert başarısız)!')
        else:
            flash('Ürün başarıyla eklendi.')
    except Exception as e:
        flash('Ürün eklenirken hata oluştu: ' + str(e))
    return redirect(url_for('admin_panel'))

@app.route('/delete_item/<item_id>')
def delete_item(item_id):
    if not session.get('admin'):
        return redirect(url_for('login'))
    items_col.delete_one({'_id': ObjectId(item_id)})
    return redirect(url_for('admin_panel'))

@app.route('/add_category', methods=['POST'])
def add_category():
    if not session.get('admin'):
        return redirect(url_for('login'))
    name = request.form['name']
    categories_col.insert_one({'name': name})
    return redirect(url_for('admin_panel'))

@app.route('/delete_category/<category_id>')
def delete_category(category_id):
    if not session.get('admin'):
        return redirect(url_for('login'))
    categories_col.delete_one({'_id': ObjectId(category_id)})
    items_col.delete_many({'category_id': ObjectId(category_id)})
    return redirect(url_for('admin_panel'))

# Vercel için handler
def handler(event, context):
    return serverless_wsgi.handle_request(app, event, context)

# Eğer bu dosya doğrudan çalıştırılırsa, Flask uygulamasını başlat
if __name__ == '__main__':
    app.run(debug=True)

# Vercel için serverless_wsgi entegrasyonu
import serverless_wsgi
