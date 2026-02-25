import { db } from './firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

async function checkTypes() {
    const snap = await getDocs(collection(db, 'yarnRolls'));
    const types = new Set();
    snap.docs.forEach(doc => {
        const t = doc.data().yarn_type;
        if (t) types.add(t);
    });
    fs.writeFileSync('all_types.json', JSON.stringify(Array.from(types), null, 2));
    process.exit(0);
}

checkTypes().catch(err => {
    process.exit(1);
});
