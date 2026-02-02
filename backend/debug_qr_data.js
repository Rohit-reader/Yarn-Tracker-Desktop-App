import { db } from './firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

async function analyze() {
    console.log('--- Analyzing QR Data ---');
    const invSnap = await getDocs(collection(db, 'inventory'));
    const rolls = invSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));

    const analysis = rolls.map(roll => {
        const { quality_grade: _q, material: _m, ...qrDataObj } = roll;
        const json = JSON.stringify(qrDataObj);
        return {
            id: roll.id,
            length: json.length,
            data: qrDataObj
        };
    });

    analysis.sort((a, b) => b.length - a.length);

    console.log('\nTop 10 Longest QR Payloads:');
    analysis.slice(0, 10).forEach(a => {
        console.log(`ID: ${a.id} | Length: ${a.length}`);
    });

    fs.writeFileSync('qr_data_analysis.json', JSON.stringify(analysis, null, 2));
    console.log('\nFull analysis written to qr_data_analysis.json');
    process.exit(0);
}

analyze();
