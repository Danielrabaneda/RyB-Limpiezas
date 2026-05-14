import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "ryb-limpiezas-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function findDuplicate() {
  const commQuery = query(collection(db, "communities"), where("name", "==", "Huerto de los Frailes 3"));
  const commDocs = await getDocs(commQuery);
  let commId = null;
  commDocs.forEach(d => { commId = d.id; console.log("Community ID:", commId); });

  if (!commId) {
     console.log("Community not found");
     return;
  }

  const tasksQuery = query(collection(db, "communityTasks"), where("communityId", "==", commId));
  const taskDocs = await getDocs(tasksQuery);
  let taskIds = [];
  taskDocs.forEach(d => { taskIds.push(d.id); console.log("Task:", d.id, d.data().serviceType); });

  if (taskIds.length === 0) return;

  for (const taskId of taskIds) {
      const schQuery = query(collection(db, "scheduledServices"), where("communityTaskId", "==", taskId));
      const schDocs = await getDocs(schQuery);
      let duplicates = {};
      schDocs.forEach(d => {
          const data = d.data();
          const dateKey = data.date;
          if (!duplicates[dateKey]) duplicates[dateKey] = [];
          duplicates[dateKey].push({id: d.id, status: data.status, date: data.date});
      });

      for (const date in duplicates) {
          if (duplicates[date].length > 1) {
              console.log(`Found duplicates on ${date} for task ${taskId}:`);
              for (const doc of duplicates[date]) {
                  console.log(` - ID: ${doc.id}, status: ${doc.status}`);
              }
          }
      }
  }
  process.exit(0);
}

findDuplicate().catch(err => {
    console.error(err);
    process.exit(1);
});
