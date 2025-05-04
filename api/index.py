from flask import Flask, render_template, request, redirect, url_for, flash, session
from werkzeug.utils import secure_filename
import os
from pymongo import MongoClient
from bson.objectid import ObjectId
from gridfs import GridFS
from PIL import Image
import io
import serverless_wsgi

app = Flask(__name__)
app.secret_key = 'supersecretkey'  # Bunu değiştir!
app.config['UPLOAD_FOLDER'] = 'static/uploads/'

# MongoDB bağlantısı
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
        # ...

# (Buraya app.py'deki diğer route ve fonksiyonları eklemelisin)

def handler(event, context):
    return serverless_wsgi.handle_request(app, event, context)
