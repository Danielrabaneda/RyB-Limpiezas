import json

with open(r'C:\Users\Hp\.gemini\antigravity\brain\4ca128fa-bcee-4543-8493-90823563b167\.system_generated\steps\449\output.txt', 'r', encoding='utf-8') as f:
    data = f.read()
    # The output from MCP list_documents is probably JSON array or just JSON objects
    # It starts with Created At... let's extract the array
    try:
        start_idx = data.find('[')
        end_idx = data.rfind(']') + 1
        if start_idx != -1 and end_idx != -1:
            json_str = data[start_idx:end_idx]
            docs = json.loads(json_str)
            for doc in docs:
                fields = doc.get('fields', {})
                comm_id = fields.get('communityId', {}).get('stringValue')
                if comm_id == 'O9NtCO4ceFpVVUvXd0hT':
                    print("Found Task:", doc.get('name'))
    except Exception as e:
        print("Error parsing:", e)
