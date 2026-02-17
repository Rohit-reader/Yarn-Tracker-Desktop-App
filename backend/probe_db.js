import { db } from './firebase.js';
import { collection, getDocs, listCollections } from 'firebase/firestore';

async function listAll() {
    console.log('--- Listing Collections at Root ---');
    // Note: listCollections is only available in Admin SDK or some specific environments.
    // In web SDK / firestore lite, it might not work.
    // But this is a Node.js environment using firebase/firestore.

    try {
        // Since I'm using 'firebase/firestore' (not admin), I can't easily list collections.
        // I have to guess some names or check if there's any other way.

        const testNames = ['config', 'settings', 'inventory_rules', 'Order_collection', 'yarnRolls'];
        for (const name of testNames) {
            try {
                const snap = await getDocs(collection(db, name));
                console.log(`Collection [${name}]: ${snap.size} documents`);
                if (snap.size > 0) {
                    console.log(`  First doc: ${snap.docs[0].id} => ${JSON.stringify(snap.docs[0].data()).slice(0, 100)}`);

                    // If it's config, check for subcollections? (Hard to do without listCollections)
                }
            } catch (e) {
                console.log(`Collection [${name}] not found or error: ${e.message}`);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

listAll();
