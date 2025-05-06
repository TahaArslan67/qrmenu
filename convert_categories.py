# convert_categories.py
from pymongo import MongoClient
from bson.objectid import ObjectId
import sys

# MongoDB Bağlantısı - Server.js'den alınan Atlas bağlantısı
MONGO_URI = "mongodb+srv://arslantaha67:0022800228t@panel.gjn1k.mongodb.net/qrmenu?retryWrites=true&w=majority"

def connect_to_mongodb():
    try:
        print(f"MongoDB'ye bağlanılıyor: {MONGO_URI}")
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)  # Bağlantı için daha fazla süre ver
        client.server_info()  # Bağlantıyı test et
        
        db = client['qrmenu']
        categories_col = db['categories']
        items_col = db['items']
        
        print("MongoDB bağlantısı başarılı!")
        return client, db, categories_col, items_col
    except Exception as e:
        print(f"MongoDB bağlantı hatası: {e}")
        sys.exit(1)

def convert_categories_to_numeric():
    client, db, categories_col, items_col = connect_to_mongodb()
    
    # Tüm kategorileri al
    categories = list(categories_col.find())
    print(f"Toplam {len(categories)} kategori bulundu.")
    
    # Kategori eşleştirme tablosu oluştur (eski ID -> yeni numara)
    category_mapping = {}
    
    for i, category in enumerate(categories, 1):
        old_id = category['_id']
        category_mapping[str(old_id)] = i
        
        # Kategori belgesine sayısal ID ekle
        categories_col.update_one(
            {'_id': old_id},
            {'$set': {'category_num': i}}
        )
        print(f"Kategori güncellendi: {category['name']} -> ID: {i}")
    
    # Tüm ürünleri al
    items = list(items_col.find())
    print(f"Toplam {len(items)} ürün bulundu.")
    
    # Ürünlerin kategori ID'lerini güncelle
    updated_count = 0
    for item in items:
        if 'category_id' in item:
            old_category_id = item['category_id']
            
            # Eğer category_id ObjectId formatında ise string'e çevir
            if isinstance(old_category_id, ObjectId):
                old_category_id = str(old_category_id)
            
            # Eşleştirme tablosunda varsa yeni sayısal ID'yi kullan
            if old_category_id in category_mapping:
                new_category_id = category_mapping[old_category_id]
                
                # Ürünü güncelle
                items_col.update_one(
                    {'_id': item['_id']},
                    {'$set': {'category_id': new_category_id}}
                )
                updated_count += 1
                print(f"Ürün güncellendi: {item['name']} -> Kategori ID: {new_category_id}")
    
    print(f"\nDönüşüm tamamlandı!")
    print(f"{len(categories)} kategori ve {updated_count} ürün güncellendi.")
    
    # Kategori eşleştirme tablosunu göster
    print("\nKategori Eşleştirme Tablosu:")
    for old_id, new_id in category_mapping.items():
        category = next((c for c in categories if str(c['_id']) == old_id), None)
        if category:
            print(f"Eski ID: {old_id} -> Yeni ID: {new_id} (Kategori: {category['name']})")

if __name__ == "__main__":
    print("Kategori ID'leri sayısal formata dönüştürülüyor...")
    convert_categories_to_numeric()
