import { db } from './firebase.js';
import { collection, getDocs, collectionGroup, query } from 'firebase/firestore';

async function checkData() {
    try {
        console.log('--- Checking Inventory Collection ---');
        const inventorySnap = await getDocs(collection(db, 'inventory'));
        console.log(`Inventory Count: ${inventorySnap.size}`);

        console.log('\n--- Checking Rolls Hierarchy (Collection Group) ---');
        const rollsQuery = query(collectionGroup(db, 'rolls'));
        const rollsSnap = await getDocs(rollsQuery);
        console.log(`Rolls (Hierarchy) Count: ${rollsSnap.size}`);

        if (rollsSnap.size > 0) {
            console.log('\nSample Roll Data:');
            console.log(JSON.stringify(rollsSnap.docs[0].data(), null, 2));
        }

    } catch (error) {
        console.error('Error checking data:', error);
    }
}

checkData();
