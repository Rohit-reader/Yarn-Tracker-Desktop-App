import { db } from './firebase.js';
import { collection, collectionGroup, getDocs, setDoc, doc } from 'firebase/firestore';

async function syncAll() {
    console.log('--- Starting Global Data Sync ---');

    // 1. Fetch all unique rolls from all sources
    const invSnap = await getDocs(collection(db, 'inventory'));
    const legacySnap = await getDocs(collection(db, 'yarnRolls'));
    const hierarchicalSnap = await getDocs(collectionGroup(db, 'rolls'));

    const allRollsMap = new Map();

    // Process Inventory (Mirror)
    invSnap.docs.forEach(d => {
        allRollsMap.set(d.id, { ...d.data(), id: d.id });
    });

    // Process Legacy (Might contain unique old items)
    legacySnap.docs.forEach(d => {
        if (!allRollsMap.has(d.id)) {
            console.log(`[Sync] Found unique legacy roll: ${d.id}`);
            allRollsMap.set(d.id, { ...d.data(), id: d.id });
        }
    });

    // Process Hierarchical (In case some exist only there)
    hierarchicalSnap.docs.forEach(d => {
        const data = d.data();
        if (data.id && !allRollsMap.has(data.id)) {
            console.log(`[Sync] Found unique hierarchical roll: ${data.id}`);
            allRollsMap.set(data.id, { ...data, id: data.id });
        }
    });

    console.log(`Total unique rolls to sync: ${allRollsMap.size}`);

    const rolls = Array.from(allRollsMap.values());
    let syncedCount = 0;

    for (const roll of rolls) {
        try {
            const rollId = roll.id;
            const rackId = roll.rack_id || 'R1';
            const bin = roll.bin || '1';

            // 1. Ensure in Inventory
            const invRef = doc(db, 'inventory', rollId);
            await setDoc(invRef, roll, { merge: true });

            // 2. Ensure in Hierarchy
            const nestedRef = doc(db, 'racks', rackId, 'bins', bin, 'rolls', rollId);
            await setDoc(nestedRef, roll, { merge: true });

            syncedCount++;
            if (syncedCount % 10 === 0) console.log(`Synced ${syncedCount}/${rolls.length}...`);
        } catch (e) {
            console.error(`Error syncing roll ${roll.id}:`, e.message);
        }
    }

    console.log(`\n✅ Sync Complete! Total synced: ${syncedCount}`);
    process.exit(0);
}

syncAll();
