from flask import Flask, render_template, request, redirect, url_for, flash, session
from werkzeug.utils import secure_filename
import os
from pymongo import MongoClient
from bson.objectid import ObjectId
from gridfs import GridFS
import io
import serverless_wsgi

app = Flask(__name__, static_folder='../static', template_folder='../templates')
app.secret_key = 'supersecretkey'  # Bunu değiştir!
app.config['UPLOAD_FOLDER'] = '../static/uploads/'

# MongoDB bağlantısı
MONGO_URI = os.environ.get('MONGODB_URI')
if not MONGO_URI:
    # SRV URI yerine standart URI kullan
    MONGO_URI = 'mongodb://arslantaha67:0022800228t@panel.gjn1k.mongodb.net:27017/?retryWrites=true&w=majority'
client = MongoClient(MONGO_URI)
db = client['qrmenu']
categories_col = db['categories']
items_col = db['items']
gfs = GridFS(db)

@app.route('/')
def menu():
    try:
        categories = list(categories_col.find())
        items = list(items_col.find())
        # Her ürün için uygun görsel yolunu belirle
        for item in items:
            img_base = item['name'].lower().replace(' ', '_')
            item['img_url'] = '/static/uploads/' + img_base + '.jpg'
        return render_template('menu.html', categories=categories, items=items)
    except Exception as e:
        return str(e), 500

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
        # Kategori ID'yi int olarak kaydet
        category_id_int = int(category_id)
        result = items_col.insert_one({
            'name': name,
            'description': description,
            'price': price,
            'category_id': category_id_int
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
    # Otomatik sıralı int id ata
    last_category = categories_col.find_one(sort=[('category_num', -1)])
    next_id = (last_category['category_num'] + 1) if last_category and 'category_num' in last_category else 1
    categories_col.insert_one({'name': name, 'category_num': next_id})
    return redirect(url_for('admin_panel'))

@app.route('/delete_category/<category_id>')
def delete_category(category_id):
    if not session.get('admin'):
        return redirect(url_for('login'))
    # Kategori ve ürünleri int category_num ile sil
    categories_col.delete_one({'category_num': int(category_id)})
    items_col.delete_many({'category_id': int(category_id)})
    return redirect(url_for('admin_panel'))

@app.route('/image/<image_id>')
def get_image(image_id):
    try:
        image_file = gfs.get(ObjectId(image_id))
        # 2. Cache-Control header ekle
        response = app.response_class(image_file.read(), mimetype=image_file.content_type)
        response.headers['Cache-Control'] = 'public, max-age=604800'  # 1 hafta cache
        return response
    except Exception as e:
        return '', 404

@app.route('/image/small/<image_id>')
def get_small_image(image_id):
    try:
        image_file = gfs.get(ObjectId(image_id))
        response = app.response_class(image_file.read(), mimetype=image_file.content_type)
        response.headers['Cache-Control'] = 'public, max-age=604800'
        return response
    except Exception as e:
        return '', 404

def handler(event, context):
    return serverless_wsgi.handle_request(app, event, context)
