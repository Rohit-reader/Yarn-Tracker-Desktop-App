import { db } from './firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

async function checkStates() {
    const snap = await getDocs(collection(db, 'yarnRolls'));
    const states = new Set();
    snap.docs.forEach(doc => {
        states.add(doc.data().state);
    });
    fs.writeFileSync('states.json', JSON.stringify(Array.from(states), null, 2));
    process.exit(0);
}

checkStates().catch(err => {
    process.exit(1);
});
