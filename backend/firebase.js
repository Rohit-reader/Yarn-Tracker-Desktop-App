import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAYXVrRtfStYQqFFBWYyTQGfOb345di2Ls",
    authDomain: "yarn-roll.firebaseapp.com",
    projectId: "yarn-roll",
    storageBucket: "yarn-roll.firebasestorage.app",
    messagingSenderId: "157993278528",
    appId: "1:157993278528:web:7779f57427dcf889aa13a5",
    measurementId: "G-PRTJ08JHQZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
