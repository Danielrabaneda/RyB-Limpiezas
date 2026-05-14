const fs = require('fs');

const data = JSON.parse(fs.readFileSync('C:/Users/Hp/.gemini/antigravity/brain/4ca128fa-bcee-4543-8493-90823563b167/.system_generated/steps/358/output.txt', 'utf8'));

const comms = data.documents;
for (const d of comms) {
  const fields = d.fields;
  if (!fields) continue;
  if (fields.name && fields.name.stringValue) {
    if (fields.name.stringValue.toLowerCase().includes("huerto")) {
      console.log(d.name, fields.name.stringValue);
    }
  }
}
