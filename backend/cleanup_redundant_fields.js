import { db } from './firebase.js';
import { collection, getDocs, updateDoc, doc, deleteField } from 'firebase/firestore';

async function cleanup() {
    console.log('--- Cleaning Up Redundant Fields ---');
    const invSnap = await getDocs(collection(db, 'inventory'));
    let cleanedCount = 0;

    for (const d of invSnap.docs) {
        const data = d.data();
        if (data.rawQr || data.originalQrId) {
            console.log(`Cleaning roll: ${d.id}`);
            await updateDoc(doc(db, 'inventory', d.id), {
                rawQr: deleteField(),
                originalQrId: deleteField()
            });
            cleanedCount++;
        }
    }

    console.log(`\n✅ Cleanup complete. Removed fields from ${cleanedCount} rolls.`);
    process.exit(0);
}

cleanup();
