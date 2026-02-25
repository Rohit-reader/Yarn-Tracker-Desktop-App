import { db } from './firebase.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

async function checkDispatched() {
    let output = '--- Checking for DISPATCHED State ---\n';

    // Check deliveries collection
    const deliveriesSnap = await getDocs(collection(db, 'deliveries'));
    output += `Deliveries Collection: ${deliveriesSnap.size} documents\n`;

    // Check yarnRolls collection for state: 'DISPATCHED'
    const q = query(collection(db, 'yarnRolls'), where('state', '==', 'DISPATCHED'));
    const yarnRollsSnap = await getDocs(q);
    output += `yarnRolls with state 'DISPATCHED': ${yarnRollsSnap.size} documents\n`;
    if (yarnRollsSnap.size > 0) {
        output += `Example: ${yarnRollsSnap.docs[0].id}\n`;
    }

    // Check inventory collection for state: 'DISPATCHED'
    const q2 = query(collection(db, 'inventory'), where('state', '==', 'DISPATCHED'));
    const inventorySnap = await getDocs(q2);
    output += `inventory with state 'DISPATCHED': ${inventorySnap.size} documents\n`;

    fs.writeFileSync('check_results.txt', output);
    process.exit(0);
}

checkDispatched().catch(err => {
    fs.writeFileSync('check_results.txt', err.stack);
    process.exit(1);
});
