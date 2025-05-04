from flask import Flask, render_template, request, redirect, url_for, flash, session
from werkzeug.utils import secure_filename
import os
from pymongo import MongoClient
from bson.objectid import ObjectId
from gridfs import GridFS
from PIL import Image
import io

app = Flask(__name__)
app.secret_key = 'supersecretkey'  # Bunu değiştir!
app.config['UPLOAD_FOLDER'] = 'static/uploads/'

# MongoDB bağlantısı
import os
MONGO_URI = os.environ.get('MONGODB_URI')
client = MongoClient(MONGO_URI)
db = client['qrmenu']
categories_col = db['categories']
items_col = db['items']
gfs = GridFS(db)

@app.route('/')
def menu():
    categories = list(categories_col.find())
    items = list(items_col.find())
    # Her ürün için uygun görsel yolunu belirle
    for item in items:
        img_base = item['name'].lower().replace(' ', '_')
        jpg_path = os.path.join('static', 'uploads', img_base + '.jpg')
        png_path = os.path.join('static', 'uploads', img_base + '.png')
        if os.path.exists(jpg_path):
            item['img_url'] = '/static/uploads/' + img_base + '.jpg'
        elif os.path.exists(png_path):
            item['img_url'] = '/static/uploads/' + img_base + '.png'
        else:
            item['img_url'] = '/static/uploads/placeholder.png'
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
    # Artık resim yok
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

@app.route('/image/blur/<image_id>')
def get_blur_image(image_id):
    try:
        image_file = gfs.get(ObjectId(image_id))
        img = Image.open(io.BytesIO(image_file.read()))
        img = img.convert('RGB')
        img.thumbnail((16, 16))  # Çok küçük boyut
        img = img.resize((80, 80), Image.BILINEAR)
        img = img.filter(Image.BLUR)
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='JPEG', quality=30)
        img_byte_arr.seek(0)
        response = app.response_class(img_byte_arr.read(), mimetype='image/jpeg')
        response.headers['Cache-Control'] = 'public, max-age=604800'
        return response
    except Exception as e:
        return '', 404

if __name__ == '__main__':
    if not os.path.exists('static/uploads/'):
        os.makedirs('static/uploads/')
    app.run(debug=True)

import serverless_wsgi

def handler(event, context):
    return serverless_wsgi.handle_request(app, event, context)
