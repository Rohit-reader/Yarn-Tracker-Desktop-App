// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyAYXVrRtfStYQqFFBWYyTQGfOb345di2Ls",
    authDomain: "yarn-roll.firebaseapp.com",
    projectId: "yarn-roll",
    storageBucket: "yarn-roll.firebasestorage.app",
    messagingSenderId: "157993278528",
    appId: "1:157993278528:web:4e88ed6e011bc42faa13a5",
    measurementId: "G-SE7XVEDGQR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);