import { db } from './firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

async function probeRoll() {
    const rollId = 'YR-2026-161';
    const snap = await getDoc(doc(db, 'yarnRolls', rollId));
    if (snap.exists()) {
        fs.writeFileSync('roll_probe.json', JSON.stringify(snap.data(), null, 2));
    } else {
        fs.writeFileSync('roll_probe.json', JSON.stringify({ error: 'Not found' }));
    }
    process.exit(0);
}

probeRoll().catch(err => {
    fs.writeFileSync('roll_probe.json', JSON.stringify({ error: err.stack }));
    process.exit(1);
});
