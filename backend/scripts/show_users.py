from pymongo import MongoClient
import json

def show_users():
    try:
        client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=2000)
        db = client["nutrilens"]
        
        print("=== MongoDB 中的 auth_users 集合 (註冊帳密與 UUID) ===")
        users = list(db.auth_users.find({}, {"_id": 0}))
        if not users:
            print("目前沒有任何註冊使用者。")
        else:
            print(json.dumps(users, indent=2, ensure_ascii=False))
            
        print("\n=== MongoDB 中的 users 集合 (使用者健康 Profile) ===")
        profiles = list(db.users.find({}, {"_id": 0}))
        if not profiles:
            print("目前沒有任何使用者 Profile。")
        else:
            print(json.dumps(profiles, indent=2, ensure_ascii=False))
            
    except Exception as e:
        print(f"無法連線到 MongoDB: {e}")

if __name__ == "__main__":
    show_users()
