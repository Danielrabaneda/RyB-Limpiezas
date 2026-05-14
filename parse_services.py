import json
import collections

with open(r'C:\Users\Hp\.gemini\antigravity\brain\4ca128fa-bcee-4543-8493-90823563b167\.system_generated\steps\583\output.txt', 'r', encoding='utf-8') as f:
    data = f.read()

try:
    start_idx = data.find('[')
    end_idx = data.rfind(']') + 1
    if start_idx != -1 and end_idx != -1:
        json_str = data[start_idx:end_idx]
        docs = json.loads(json_str)
        
        services = []
        
        for doc in docs:
            if 'document' in doc:
                fields = doc['document'].get('fields', {})
                doc_name = doc['document'].get('name')
            else:
                fields = doc.get('fields', {})
                doc_name = doc.get('name')
                
            if not doc_name:
                continue
                
            date_val = fields.get('scheduledDate', {}).get('timestampValue')
            if date_val:
                date_val = date_val.split('T')[0]
            
            doc_id = doc_name.split('/')[-1]
            status = fields.get('status', {}).get('stringValue')
            task_id = fields.get('communityTaskId', {}).get('stringValue')
            services.append({'id': doc_id, 'date': date_val, 'status': status, 'taskId': task_id})
        
        services.sort(key=lambda x: str(x['date']))
        print("All services for Huerto de los Frailes 3:")
        for s in services:
            print(f"  Date: {s['date']}, ID: {s['id']}, Task: {s['taskId']}, Status: {s['status']}")

except Exception as e:
    print("Error:", e)
