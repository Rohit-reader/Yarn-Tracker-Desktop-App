import { db } from './firebase.js';
import { doc, getDoc } from 'firebase/firestore';

async function probe() {
    const rulesSnap = await getDoc(doc(db, 'config', 'inventory_rules'));
    if (rulesSnap.exists()) {
        console.log('--- Current Firestore Data (config/inventory_rules) ---');
        console.log(JSON.stringify(rulesSnap.data(), null, 2));
    } else {
        console.log('--- config/inventory_rules NOT FOUND ---');
    }
    process.exit(0);
}

probe();
