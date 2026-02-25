import { db } from './firebase.js';
import { collection, getDocs } from 'firebase/firestore';

async function checkRollFields() {
    try {
        const snap = await getDocs(collection(db, 'yarnRolls'));
        if (snap.empty) {
            console.log('No rolls found.');
            return;
        }
        const fields = new Set();
        snap.forEach(doc => {
            Object.keys(doc.data()).forEach(k => fields.add(k));
        });
        console.log('Available fields in yarnRolls:', Array.from(fields));

        const dispatched = snap.docs.filter(d => d.data().state === 'DISPATCHED');
        if (dispatched.length > 0) {
            console.log('Sample dispatched roll data:', JSON.stringify(dispatched[0].data(), null, 2));
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

checkRollFields();
