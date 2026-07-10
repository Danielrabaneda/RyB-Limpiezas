import yaml

with open(r'C:\Users\Hp\.gemini\antigravity\brain\4ca128fa-bcee-4543-8493-90823563b167\.system_generated\steps\583\output.txt', 'r', encoding='utf-8') as f:
    data = yaml.safe_load(f)

for doc in data.get('documents', []):
    taskName = doc.get('taskName')
    date_field = doc.get('scheduledDate', {}).get('value')
    path = doc.get('__path__')
    status = doc.get('status')
    print(f"Path: {path}, Task: {taskName}, Date: {date_field}, Status: {status}")
