
import { db } from './firebase.js';
import { collection, collectionGroup, getDocs } from 'firebase/firestore';

async function check() {
    console.log('--- DB Check Starting ---');
    try {
        const invSnap = await getDocs(collection(db, 'inventory'));
        console.log('Inventory count:', invSnap.size);
    } catch (e) {
        console.error('Error checking inventory:', e.message);
    }

    try {
        const rollsSnap = await getDocs(collectionGroup(db, 'rolls'));
        console.log('CollectionGroup rolls count:', rollsSnap.size);
    } catch (e) {
        console.error('Error checking collectionGroup rolls:', e.message);
    }

    try {
        const legacySnap = await getDocs(collection(db, 'yarnRolls'));
        console.log('Legacy yarnRolls count:', legacySnap.size);
    } catch (e) {
        console.error('Error checking legacy yarnRolls:', e.message);
    }
}

check();
