
const fs = require('fs');
const content = fs.readFileSync('C:/Users/Hp/.gemini/antigravity/brain/4ca128fa-bcee-4543-8493-90823563b167/.system_generated/steps/1299/output.txt', 'utf8');

const docs = content.split('- __path__: ').slice(1);
const services = docs.map(d => {
    const id = d.split('\n')[0].trim();
    const taskIdMatch = d.match(/communityTaskId: ([^\n\r]+)/);
    const taskNameMatch = d.match(/taskName: ([^\n\r]+)/);
    const dateMatch = d.match(/scheduledDate:[^]*?value: '([^']+)'/);
    const statusMatch = d.match(/status: ([^\n\r]+)/);
    const createdAtMatch = d.match(/createdAt:[^]*?value: '([^']+)'/);

    return {
        id,
        taskId: taskIdMatch ? taskIdMatch[1].trim() : null,
        taskName: taskNameMatch ? taskNameMatch[1].trim() : null,
        date: dateMatch ? dateMatch[1] : null,
        status: statusMatch ? statusMatch[1].trim() : null,
        createdAt: createdAtMatch ? createdAtMatch[1] : null
    };
});

const groups = {};
services.forEach(s => {
    if (!s.date) return;
    const day = s.date.split('T')[0];
    const key = `${day} | ${s.taskName}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
});

console.log('--- DUPLICATE AUDIT ---');
for (const [key, list] of Object.entries(groups)) {
    if (list.length > 1) {
        const pendingCount = list.filter(s => s.status === 'pending').length;
        if (pendingCount > 1 || (list.some(s => s.status === 'completed') && pendingCount > 0)) {
            console.log(`\nConflict on ${key}:`);
            list.forEach(s => {
                console.log(`  - ID: ${s.id}, Status: ${s.status}, Created: ${s.createdAt}`);
            });
        }
    }
}
