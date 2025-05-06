from pymongo import MongoClient
from bson.objectid import ObjectId
import sys

# MongoDB Bağlantısı
MONGO_URI = "mongodb+srv://arslantaha67:0022800228t@panel.gjn1k.mongodb.net/qrmenu?retryWrites=true&w=majority"

def connect_to_mongodb():
    try:
        print("MongoDB'ye bağlanılıyor...")
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
        client.server_info()  # Bağlantıyı test et
        
        db = client['qrmenu']
        categories_col = db['categories']
        items_col = db['items']
        
        print("MongoDB bağlantısı başarılı!")
        return client, db, categories_col, items_col
    except Exception as e:
        print(f"MongoDB bağlantı hatası: {e}")
        sys.exit(1)

def fix_categories_and_items():
    client, db, categories_col, items_col = connect_to_mongodb()
    
    # Tüm kategorileri al ve sayısal ID'leri güncelle
    categories = list(categories_col.find())
    print(f"Toplam {len(categories)} kategori bulundu.")
    
    # Kategori eşleştirme tablosu oluştur (ObjectID -> sayısal ID)
    category_mapping = {}
    
    # 1. Adım: Tüm kategorilere sayısal ID ata
    for i, category in enumerate(categories, 1):
        obj_id = category['_id']
        
        # Kategoriye sayısal ID ekle veya güncelle
        categories_col.update_one(
            {'_id': obj_id},
            {'$set': {'category_num': i}}
        )
        
        category_mapping[str(obj_id)] = i
        print(f"Kategori güncellendi: {category['name']} -> ID: {i}")
    
    # 2. Adım: Tüm ürünlerin kategori ID'lerini sayısal ID'lerle güncelle
    items = list(items_col.find())
    print(f"Toplam {len(items)} ürün bulundu.")
    
    # Tüm ürünleri kontrol et ve kategori ID'lerini güncelle
    for item in items:
        obj_id = item['_id']
        current_category_id = item.get('category_id')
        updated = False
        
        # Mevcut kategori ID'si string ise sayısal ID'ye dönüştür
        if isinstance(current_category_id, str):
            try:
                # ObjectId string ise sayısal ID ile eşleştir
                if current_category_id in category_mapping:
                    new_category_id = category_mapping[current_category_id]
                    updated = True
                # Direkt sayısal ise int'e çevir    
                elif current_category_id.isdigit():
                    new_category_id = int(current_category_id)
                    updated = True
                else:
                    # Bulunamadı, varsayılan olarak 1. kategoriyi ata
                    new_category_id = 1
                    updated = True
                    print(f"Ürün {item['name']} için kategori ID bulunamadı, varsayılan kategori atandı")
            except Exception as e:
                print(f"Kategori ID dönüşüm hatası: {e}")
                # Hata durumunda varsayılan kategori ata
                new_category_id = 1
                updated = True
        # Zaten sayısal ise dokunma
        elif isinstance(current_category_id, int):
            print(f"Ürün zaten sayısal kategori ID'sine sahip: {item['name']}")
            continue
        # Hiç kategori ID'si yoksa varsayılan ata
        elif current_category_id is None:
            new_category_id = 1
            updated = True
        
        # Güncelleme yap
        if updated:
            items_col.update_one(
                {'_id': obj_id},
                {'$set': {'category_id': new_category_id}}
            )
            print(f"Ürün güncellendi: {item['name']} -> Kategori ID: {new_category_id}")
    
    print(f"\nDönüşüm tamamlandı!")
    print(f"{len(categories)} kategori ve {len(items)} ürün kontrol edildi.")
    
    # Güncelleme sonrası durumu göster
    print("\nKategori Eşleştirme Tablosu:")
    for obj_id, num_id in category_mapping.items():
        category = next((c for c in categories if str(c['_id']) == obj_id), None)
        if category:
            print(f"ObjectID: {obj_id} -> Sayısal ID: {num_id} (Kategori: {category['name']})")

if __name__ == "__main__":
    print("Kategori ve ürün ilişkileri düzeltiliyor...")
    fix_categories_and_items()
