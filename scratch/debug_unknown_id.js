
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../src/config/firebase.js';

async function findUnknownCommunity() {
    console.log('Fetching communities...');
    const commsSnap = await getDocs(collection(db, 'communities'));
    const commIds = commsSnap.docs.map(d => d.id);
    const commNames = commsSnap.docs.reduce((acc, d) => {
        acc[d.id] = d.data().name;
        return acc;
    }, {});

    console.log('Fetching checkIns...');
    const checkInsSnap = await getDocs(collection(db, 'checkIns'));
    
    const unknownIds = new Set();
    checkInsSnap.docs.forEach(d => {
        const data = d.data();
        if (data.communityId && !commIds.includes(data.communityId)) {
            unknownIds.add(data.communityId);
        }
    });

    console.log('Unknown Community IDs found in checkIns:', Array.from(unknownIds));
    
    for (const id of unknownIds) {
        const records = checkInsSnap.docs.filter(d => d.data().communityId === id);
        console.log(`ID: ${id}`);
        console.log(`Records count: ${records.length}`);
        const sample = records[0].data();
        console.log(`Sample record (User: ${sample.userName}, Date: ${sample.checkInTime?.toDate().toLocaleDateString()})`);
    }
}

findUnknownCommunity();
