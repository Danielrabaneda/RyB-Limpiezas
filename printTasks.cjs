const fs = require('fs');

const config = JSON.parse(fs.readFileSync('C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json', 'utf8'));
const token = config.tokens.access_token;
const projectId = "ryb-limpiezas-app";
const companyId = "rayba";
const userId = "3sn1FsGPgNT2NcfXfwXIjZF513I3"; // Daniel Rabaneda

async function runQuery(collectionId, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        ...structuredQuery
      }
    })
  });
  
  const results = await response.json();
  return results
    .filter(r => r.document)
    .map(r => {
      const doc = r.document;
      const fields = {};
      for (const [key, val] of Object.entries(doc.fields || {})) {
        if (val.stringValue !== undefined) fields[key] = val.stringValue;
        else if (val.integerValue !== undefined) fields[key] = parseInt(val.integerValue);
        else if (val.booleanValue !== undefined) fields[key] = val.booleanValue;
        else if (val.timestampValue !== undefined) fields[key] = val.timestampValue;
        else if (val.mapValue !== undefined) fields[key] = val.mapValue;
        else if (val.arrayValue !== undefined) fields[key] = val.arrayValue;
        else fields[key] = val;
      }
      return {
        id: doc.name.split('/').pop(),
        ...fields
      };
    });
}

async function run() {
  console.log("=== ACTIVE COMMUNITY TASKS ===");
  const tasks = await runQuery("communityTasks", {
    where: {
      fieldFilter: {
        field: { fieldPath: "active" },
        op: "EQUAL",
        value: { booleanValue: true }
      }
    }
  });

  const assignments = await runQuery("assignments", {
    where: {
      fieldFilter: {
        field: { fieldPath: "active" },
        op: "EQUAL",
        value: { booleanValue: true }
      }
    }
  });

  console.log(`Found ${tasks.length} tasks and ${assignments.length} assignments.`);

  // Find tasks assigned to Daniel
  const assignedTasks = [];
  for (const t of tasks) {
    let assigned = false;
    if (t.assignedUserId === userId) {
      assigned = true;
    } else if (!t.assignedUserId) {
      // Check assignments
      const hasAssign = assignments.some(a => a.communityId === t.communityId && a.userId === userId);
      if (hasAssign) assigned = true;
    }
    
    if (assigned) {
      assignedTasks.push(t);
    }
  }

  console.log(`\n=== TASKS ASSIGNED TO DANIEL (${assignedTasks.length}) ===`);
  assignedTasks.forEach(t => {
    console.log(`- Task: ${t.taskName} (${t.id})`);
    console.log(`  Frequency: ${t.frequencyType}`);
    console.log(`  weekDays:`, JSON.stringify(t.weekDays));
    console.log(`  monthDays:`, JSON.stringify(t.monthDays));
    console.log(`  weekOfMonth:`, t.weekOfMonth);
    console.log(`  startDate:`, t.startDate);
    console.log(`  punctualDate:`, t.punctualDate);
    console.log(`  createdAt:`, t.createdAt);
  });
}

run().catch(console.error);
