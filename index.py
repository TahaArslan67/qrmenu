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
        if path == '/' or path == '/index.html':
            try:
                categories = list(categories_col.find())
                items = list(items_col.find())
                for item in items:
                    img_base = item['name'].lower().replace(' ', '_')
                    item['img_url'] = '/static/uploads/' + img_base + '.jpg'
                
                # Güzel HTML yanıtı
                css = """
                <style>
                @import url('https://fonts.googleapis.com/css2?family=Pacifico&family=Montserrat:wght@700&family=Quicksand:wght@400;700&display=swap');
                
                body {
                  font-family: 'Quicksand', Arial, sans-serif;
                  background: #fff url('https://i.imgur.com/JfVcQQd.jpg') center center/cover no-repeat fixed;
                  margin: 0;
                  padding: 0;
                  min-height: 100vh;
                }
                
                .menu-container {
                  max-width: 440px;
                  margin: 38px auto 28px auto;
                  background: rgba(255,255,255,0.95);
                  border-radius: 28px;
                  box-shadow: 0 6px 36px #eee, 0 2px 0 #fff6;
                  border: 2px solid #eee;
                  overflow: hidden;
                  padding: 20px;
                }
                
                .menu-header {
                  background: #fff;
                  padding: 26px 0 12px 36px;
                  color: #111;
                  font-size: 2.1rem;
                  font-family: 'Pacifico', cursive, Arial, sans-serif;
                  font-weight: 400;
                  letter-spacing: 2.5px;
                  border-bottom: 2px solid #eee;
                  box-shadow: 0 2px 8px #eee2;
                  text-shadow: 0 1px 0 #fff, 0 1px 0 #eee;
                  text-align: center;
                  margin-bottom: 20px;
                }
                
                .menu-section-title {
                  color: #111;
                  font-family: 'Montserrat', Arial, sans-serif;
                  font-weight: 700;
                  font-size: 1.08rem;
                  margin-top: 28px;
                  margin-bottom: 14px;
                  letter-spacing: 1px;
                  border-bottom: 2px solid #eee;
                  padding-bottom: 4px;
                  background: #fff;
                  border-radius: 7px 7px 0 0;
                }
                
                .menu-item {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  padding: 12px 0;
                  border-bottom: 2px dashed #eee;
                }
                
                .menu-item-name {
                  font-size: 0.97rem;
                  color: #111;
                  font-weight: 700;
                  text-align: center;
                }
                
                .menu-item-price {
                  color: #e53935;
                  font-weight: bold;
                  font-size: 1.01rem;
                  background: #fff;
                  border-radius: 8px;
                  padding: 2px 10px;
                  border: 1.5px solid #eee;
                }
                </style>
                """
                
                response = f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Gözde Pide Menü</title>
                    {css}
                </head>
                <body>
                    <div class="menu-container">
                        <div class="menu-header">Gözde Pide Menü</div>
                """
                
                for category in categories:
                    response += f'<div class="menu-section-title">{category["name"]}</div>'
                    
                    for item in items:
                        if str(item.get('category_id')) == str(category['_id']):
                            response += f"""
                            <div class="menu-item">
                                <div class="menu-item-name">{item['name']}</div>
                                <div class="menu-item-price">{item['price']} ₺</div>
                            </div>
                            """
                
                response += """
                    </div>
                </body>
                </html>
                """
                
                self.wfile.write(response.encode())
            except Exception as e:
                self.wfile.write(f"Hata: {str(e)}".encode())
        elif path.startswith('/static/'):
            self.wfile.write(b'Statik dosya bulunamadi')
        else:
            self.wfile.write(b'Sayfa bulunamadi')
        
        return

if __name__ == '__main__':
    from http.server import HTTPServer
    server_address = ('', 8000)
    httpd = HTTPServer(server_address, handler)
    httpd.serve_forever()
