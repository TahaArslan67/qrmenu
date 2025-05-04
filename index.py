from http.server import BaseHTTPRequestHandler
import os
from pymongo import MongoClient
from bson.objectid import ObjectId
from gridfs import GridFS

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

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/html')
        self.end_headers()
        
        path = self.path
        if path == '/':
            try:
                categories = list(categories_col.find())
                items = list(items_col.find())
                for item in items:
                    img_base = item['name'].lower().replace(' ', '_')
                    item['img_url'] = '/static/uploads/' + img_base + '.jpg'
                
                # Basit HTML yanıtı
                response = "<html><body><h1>Gözde Pide Menü</h1>"
                for category in categories:
                    response += f"<h2>{category['name']}</h2>"
                    for item in items:
                        if str(item.get('category_id')) == str(category['_id']):
                            response += f"<div><strong>{item['name']}</strong>: {item['price']} TL</div>"
                response += "</body></html>"
                
                self.wfile.write(response.encode())
            except Exception as e:
                self.wfile.write(f"Hata: {str(e)}".encode())
        else:
            self.wfile.write(b'Sayfa bulunamadi')
        
        return

if __name__ == '__main__':
    from http.server import HTTPServer
    server_address = ('', 8000)
    httpd = HTTPServer(server_address, handler)
    httpd.serve_forever()
