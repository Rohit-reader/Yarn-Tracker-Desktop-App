import { db } from './firebase.js';
import { collection, collectionGroup, getDocs } from 'firebase/firestore';
import fs from 'fs';

async function check() {
    console.log('--- DB Check Starting ---');
    let invCount = 0;
    let rollsCount = 0;
    let legacyCount = 0;

    try {
        const invSnap = await getDocs(collection(db, 'inventory'));
        invCount = invSnap.size;
        console.log(`[Inventory] collection count: ${invCount}`);
        const ids = invSnap.docs.map(doc => doc.id);
        fs.writeFileSync('db_ids.txt', ids.join('\n'));
        console.log(`[Inventory] collection count: ${invCount}. IDs written to db_ids.txt`);
    } catch (e) {
        console.error('Error checking inventory:', e.message);
    }

    try {
        const rollsSnap = await getDocs(collectionGroup(db, 'rolls'));
        rollsCount = rollsSnap.size;
        console.log(`[rolls] collectionGroup count: ${rollsCount}`);
        const ids = rollsSnap.docs.map(doc => doc.data().id);
        fs.writeFileSync('rolls_ids.txt', ids.join('\n'));
        console.log(`[rolls] collectionGroup names written to rolls_ids.txt`);
    } catch (e) {
        console.error('Error checking collectionGroup rolls:', e.message);
    }

    try {
        const legacySnap = await getDocs(collection(db, 'yarnRolls'));
        legacyCount = legacySnap.size;
        console.log(`[yarnRolls] (legacy) collection count: ${legacyCount}`);
        const ids = legacySnap.docs.map(doc => doc.id);
        fs.writeFileSync('legacy_ids.txt', ids.join('\n'));
        console.log(`[yarnRolls] (legacy) names written to legacy_ids.txt`);
    } catch (e) {
        console.error('Error checking legacy yarnRolls:', e.message);
    }

    let output = '--- Sync Analysis ---\n';
    const invIds = new Set((await getDocs(collection(db, 'inventory'))).docs.map(d => d.id));
    const rollsIds = new Set((await getDocs(collectionGroup(db, 'rolls'))).docs.map(d => d.data().id));
    const legacyIds = new Set((await getDocs(collection(db, 'yarnRolls'))).docs.map(d => d.id));

    const inRollsNotInv = [...rollsIds].filter(id => !invIds.has(id));
    const inLegacyNotInv = [...legacyIds].filter(id => !invIds.has(id));

    output += `Rolls in Hierarchical but NOT in Inventory (${inRollsNotInv.length}): ${JSON.stringify(inRollsNotInv)}\n`;
    output += `Rolls in Legacy but NOT in Inventory (${inLegacyNotInv.length}): ${JSON.stringify(inLegacyNotInv)}\n`;

    if (inLegacyNotInv.length > 0) {
        output += '\n--- Data for Missing Legacy Rolls ---\n';
        const legacySnap = await getDocs(collection(db, 'yarnRolls'));
        legacySnap.docs.forEach(doc => {
            if (inLegacyNotInv.includes(doc.id)) {
                output += `ID: ${doc.id}\nData: ${JSON.stringify(doc.data(), null, 2)}\n\n`;
            }
        });
    }

    if (inRollsNotInv.length > 0 || inLegacyNotInv.length > 0) {
        output += '\n💡 SUGGESTION: Sync these rolls to the inventory collection to make them show up in the app.\n';
    }
    fs.writeFileSync('sync_results.txt', output);
    console.log('Sync analysis written to sync_results.txt');
}

check();
