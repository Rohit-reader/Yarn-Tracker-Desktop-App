import { db } from './firebase.js';
import { collection, getDocs, query, where } from 'firebase/firestore';

async function checkDispatched() {
    console.log('--- Checking for DISPATCHED State ---');

    // Check deliveries collection
    const deliveriesSnap = await getDocs(collection(db, 'deliveries'));
    console.log(`Deliveries Collection: ${deliveriesSnap.size} documents`);

    // Check yarnRolls collection for state: 'DISPATCHED'
    const q = query(collection(db, 'yarnRolls'), where('state', '==', 'DISPATCHED'));
    const yarnRollsSnap = await getDocs(q);
    console.log(`yarnRolls with state 'DISPATCHED': ${yarnRollsSnap.size} documents`);

    // Check inventory collection for state: 'DISPATCHED'
    const q2 = query(collection(db, 'inventory'), where('state', '==', 'DISPATCHED'));
    const inventorySnap = await getDocs(q2);
    console.log(`inventory with state 'DISPATCHED': ${inventorySnap.size} documents`);

    process.exit(0);
}

checkDispatched().catch(err => {
    console.error(err);
    process.exit(1);
});
