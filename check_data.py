from pymongo import MongoClient
from bson.objectid import ObjectId
import json

# MongoDB Bağlantısı - Server.js'den alınan Atlas bağlantısı
MONGO_URI = "mongodb+srv://arslantaha67:0022800228t@panel.gjn1k.mongodb.net/qrmenu?retryWrites=true&w=majority"

def check_data():
    try:
        print(f"MongoDB'ye bağlanılıyor...")
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
        client.server_info()  # Bağlantıyı test et
        
        db = client['qrmenu']
        categories_col = db['categories']
        items_col = db['items']
        
        print("MongoDB bağlantısı başarılı!")
        
        # Kategorileri kontrol et
        print("\n=== KATEGORİLER ===")
        categories = list(categories_col.find())
        print(f"Toplam {len(categories)} kategori bulundu.")
        
        for i, category in enumerate(categories, 1):
            print(f"{i}. Kategori: {category['name']}")
            print(f"   ObjectID: {category['_id']}")
            print(f"   Sayısal ID (category_num): {category.get('category_num')}")
            
            # Her kategoriye ait ürünleri say
            obj_id_count = items_col.count_documents({'category_id': str(category['_id'])})
            num_id_count = items_col.count_documents({'category_id': category.get('category_num')})
            
            print(f"   String ObjectID ile eşleşen ürün sayısı: {obj_id_count}")
            print(f"   Sayısal ID ile eşleşen ürün sayısı: {num_id_count}")
            print("-" * 50)
        
        # Örnek ürünleri göster
        print("\n=== ÖRNEK ÜRÜNLER ===")
        sample_items = list(items_col.find().limit(10))
        for i, item in enumerate(sample_items, 1):
            print(f"{i}. Ürün: {item.get('name')}")
            print(f"   ObjectID: {item['_id']}")
            print(f"   Kategori ID: {item.get('category_id')}")
            print(f"   Kategori ID Tipi: {type(item.get('category_id'))}")
            
            # Bu ürüne ait kategoriyi bul
            if isinstance(item.get('category_id'), int):
                category = categories_col.find_one({'category_num': item.get('category_id')})
                id_type = "sayısal ID"
            else:
                try:
                    obj_id = ObjectId(item.get('category_id'))
                    category = categories_col.find_one({'_id': obj_id})
                    id_type = "ObjectID string"
                except:
                    category = categories_col.find_one({'_id': item.get('category_id')})
                    id_type = "plain string"
            
            if category:
                print(f"   Kategori: {category.get('name')} ({id_type})")
            else:
                print(f"   Kategori bulunamadı!")
            print("-" * 50)
            
    except Exception as e:
        print(f"Hata: {e}")

if __name__ == "__main__":
    check_data()
