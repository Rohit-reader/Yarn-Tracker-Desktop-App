import { db } from './firebase.js';
import { collection, collectionGroup, getDocs, setDoc, doc, writeBatch } from 'firebase/firestore';

async function repairAndSync() {
    console.log('🚀 Starting Comprehensive Firestore Data Repair & Sync...');

    const sources = [
        { name: 'Inventory (Direct)', ref: collection(db, 'inventory') },
        { name: 'Legacy (yarnRolls)', ref: collection(db, 'yarnRolls') },
        { name: 'Hierarchical (rolls Group)', ref: collectionGroup(db, 'rolls') }
    ];

    const masterMap = new Map();

    for (const src of sources) {
        try {
            console.log(`📡 Fetching from ${src.name}...`);
            const snap = await getDocs(src.ref);
            console.log(`   Fetched ${snap.size} documents.`);

            snap.docs.forEach(d => {
                const data = d.data();
                const id = data.id || d.id;

                if (!id || id.toLowerCase().includes('test')) return;

                // Normalize fields
                const normalized = {
                    ...data,
                    id: id,
                    // Remove characters from bin/rack for consistency if they are prefix-style
                    bin: String(data.bin || '1').replace(/[Bb]/g, ''),
                    rack_id: String(data.rack_id || '1').replace(/[Rr]/g, '')
                };

                // Merge Strategy: Existing data in masterMap is preserved unless newer data found
                // We trust Hierarchical/Recent sources more if there's conflict
                if (!masterMap.has(id)) {
                    masterMap.set(id, normalized);
                } else {
                    // Update if newer source or more complete data
                    const existing = masterMap.get(id);
                    masterMap.set(id, { ...existing, ...normalized });
                }
            });
        } catch (err) {
            console.error(`❌ Error fetching from ${src.name}:`, err.message);
        }
    }

    console.log(`\n📊 Master Map Ready: ${masterMap.size} unique rolls identified.`);

    const rolls = Array.from(masterMap.values());
    const BATCH_SIZE = 500;
    let synced = 0;

    console.log(`\n🛠️  Repopulating 'inventory' collection and 'racks' hierarchy...`);

    for (let i = 0; i < rolls.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = rolls.slice(i, i + BATCH_SIZE);

        chunk.forEach(roll => {
            // 1. Authoritative Inventory Mirror
            const invRef = doc(db, 'inventory', roll.id);
            batch.set(invRef, roll);

            // 2. Hierarchical Storage racks/{rack}/bins/{bin}/rolls/{id}
            const rackRef = doc(db, 'racks', roll.rack_id, 'bins', roll.bin, 'rolls', roll.id);
            batch.set(rackRef, roll);
        });

        await batch.commit();
        synced += chunk.length;
        console.log(`   [Progress] Synced ${synced}/${rolls.length} rolls...`);
    }

    console.log(`\n✅ Repair & Sync Complete!`);
    process.exit(0);
}

repairAndSync();
