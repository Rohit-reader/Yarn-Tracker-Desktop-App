import { db } from './firebase.js';
import { collection, getDocs, limit, query } from 'firebase/firestore';

async function checkDeliveries() {
    console.log('--- Checking Deliveries ---');
    try {
        const q = query(collection(db, 'deliveries'), limit(5));
        const snap = await getDocs(q);
        console.log(`Found ${snap.size} deliveries.`);
        snap.forEach(doc => {
            console.log(`ID: ${doc.id}`);
            console.log(`Data: ${JSON.stringify(doc.data(), null, 2)}`);
        });
    } catch (e) {
        console.error('Error checking deliveries:', e);
    }
    process.exit(0);
}

checkDeliveries();
