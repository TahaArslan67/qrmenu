from flask import Flask, render_template, request, redirect, url_for, flash, session
import os
from pymongo import MongoClient
from bson.objectid import ObjectId
import json

# Basit Flask uygulaması
app = Flask(__name__)
app.secret_key = 'supersecretkey'  # Bunu değiştir!

# MongoDB bağlantısı
MONGO_URI = os.environ.get('MONGODB_URI')
if not MONGO_URI:
    # SRV URI yerine standart URI kullan
    MONGO_URI = 'mongodb://arslantaha67:0022800228t@panel.gjn1k.mongodb.net:27017/?retryWrites=true&w=majority'
client = MongoClient(MONGO_URI)
db = client['qrmenu']
categories_col = db['categories']
items_col = db['items']

@app.route('/')
def menu():
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
