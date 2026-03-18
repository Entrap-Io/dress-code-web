import json
import os
from collections import Counter
from datetime import datetime, timedelta

def analyze_closet(items_file):
    if not os.path.exists(items_file):
        return {"error": "Items file not found"}
    
    try:
        with open(items_file, 'r') as f:
            items = json.load(f)
    except Exception as e:
        return {"error": f"Failed to read items: {str(e)}"}

    if not items:
        return {"message": "Closet is empty"}

    # 1. Basic Stats
    total_items = len(items)
    total_wears = sum(len(item.get('wornHistory', [])) for item in items)
    
    # 2. Color Analysis
    owned_colors = Counter(item.get('primaryColor', 'unknown') for item in items)
    worn_colors = Counter()
    for item in items:
        wears = len(item.get('wornHistory', []))
        if wears > 0:
            worn_colors[item.get('primaryColor', 'unknown')] += wears

    # 3. Category Analysis
    category_dist = Counter(item.get('category', 'unknown') for item in items)
    category_worn = Counter()
    for item in items:
        wears = len(item.get('wornHistory', []))
        if wears > 0:
            category_worn[item.get('category', 'unknown')] += wears

    # 4. Dormant Items (not worn in 30 days)
    # Use timezone-aware datetime for comparison
    from datetime import timezone
    now = datetime.now(timezone.utc)
    month_ago = now - timedelta(days=30)
    dormant_items = []
    for item in items:
        last_worn = item.get('lastWorn')
        if not last_worn:
            dormant_items.append({"id": item['id'], "name": item['subcategory'], "reason": "Never worn"})
        else:
            # handle both ISO formats
            try:
                lw_dt = datetime.fromisoformat(last_worn.replace('Z', '+00:00'))
            except ValueError:
                lw_dt = datetime.fromisoformat(last_worn)
                if lw_dt.tzinfo is None:
                    lw_dt = lw_dt.replace(tzinfo=timezone.utc)
            
            if lw_dt < month_ago:
                dormant_items.append({"id": item['id'], "name": item['subcategory'], "reason": "Not worn in 30+ days"})

    # 5. Top Worn Items
    items_list = list(items)
    sorted_items = sorted(items_list, key=lambda x: len(x.get('wornHistory', []) if x.get('wornHistory') else []), reverse=True)
    top_worn = [{"id": i['id'], "name": i['subcategory'], "count": len(i.get('wornHistory', [])), "image": i.get('imageUrl')} for i in list(sorted_items[:5]) if len(i.get('wornHistory', [])) > 0]

    return {
        "stats": {
            "totalItems": total_items,
            "totalWears": total_wears
        },
        "colors": {
            "owned": dict(owned_colors),
            "worn": dict(worn_colors)
        },
        "categories": {
            "owned": dict(category_dist),
            "worn": dict(category_worn)
        },
        "dormant": list(dormant_items[:10]),
        "topWorn": list(top_worn)
    }

if __name__ == "__main__":
    # Adjust path if needed
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    items_path = os.path.join(base_dir, 'data', 'items.json')
    result = analyze_closet(items_path)
    print(json.dumps(result))
