import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCMLRiN2bVRRnWe0SOA0eFhUjAaQfp8H0U",
  authDomain: "family-budget-bf725.firebaseapp.com",
  projectId: "family-budget-bf725",
  storageBucket: "family-budget-bf725.firebasestorage.app",
  messagingSenderId: "511076225571",
  appId: "1:511076225571:web:a9564549b267a28840d796"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
