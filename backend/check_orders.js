import { db } from './firebase.js';
import { collection, getDocs, limit, query } from 'firebase/firestore';

async function checkOrders() {
    console.log('--- Checking Orders ---');
    try {
        const q = query(collection(db, 'Order_collection'), limit(5));
        const snap = await getDocs(q);
        snap.forEach(doc => {
            console.log(`Order ${doc.id}: ${JSON.stringify(doc.data(), null, 2)}`);
        });

        console.log('--- Checking Approved Orders ---');
        const q2 = query(collection(db, 'approved_orders'), limit(5));
        const snap2 = await getDocs(q2);
        snap2.forEach(doc => {
            console.log(`Approved Order ${doc.id}: ${JSON.stringify(doc.data(), null, 2)}`);
        });
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

checkOrders();
