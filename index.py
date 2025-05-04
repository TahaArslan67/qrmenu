from http.server import BaseHTTPRequestHandler
import os
import sys
import json

# Flask uygulamasını import et
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app import app as flask_app

# Vercel için handler
def handler(event, context):
    # Vercel'den gelen isteği Flask uygulamasına ilet
    path = event.get('path', '/')
    http_method = event.get('httpMethod', 'GET')
    headers = event.get('headers', {})
    body = event.get('body', '')
    
    # Flask uygulamasını çağır
    from io import StringIO
    import sys
    
    # Çıktıyı yakalamak için
    old_stdout = sys.stdout
    sys.stdout = mystdout = StringIO()
    
    # Flask uygulamasını çalıştır
    with flask_app.test_client() as client:
        response = client.open(
            path,
            method=http_method,
            headers=headers,
            data=body
        )
    
    # Normal çıktıya geri dön
    sys.stdout = old_stdout
    
    # Yanıtı hazırla
    return {
        'statusCode': response.status_code,
        'headers': dict(response.headers),
        'body': response.data.decode('utf-8')
    }

# Eğer bu dosya doğrudan çalıştırılırsa, Flask uygulamasını başlat
if __name__ == '__main__':
    flask_app.run(debug=True)
