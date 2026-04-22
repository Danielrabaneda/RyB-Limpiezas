import json

with open(r'C:\Users\Hp\.gemini\antigravity\brain\393dae23-40d9-4526-8285-eb87cda37fb0\.system_generated\steps\282\output.txt', 'r', encoding='utf-8') as f:
    data = json.load(f)

target_date = "2026-04-22T22:00:00Z"
services_on_day = []

for doc in data['documents']:
    fields = doc.get('fields', {})
    scheduled_date = fields.get('scheduledDate', {}).get('timestampValue')
    if scheduled_date == target_date:
        community_id = fields.get('communityId', {}).get('stringValue')
        task_name = fields.get('taskName', {}).get('stringValue', 'N/A')
        services_on_day.append({
            'id': doc['name'].split('/')[-1],
            'communityId': community_id,
            'taskName': task_name
        })

print(json.dumps(services_on_day, indent=2))
