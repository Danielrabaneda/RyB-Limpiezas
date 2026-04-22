/*
 * Script de inicialización - Crear usuario Admin
 * 
 * USO: Abre la consola del navegador en la app y ejecuta:
 * 
 * 1. Ve a /login
 * 2. Abre la consola del navegador (F12)
 * 3. Ejecuta lo siguiente (ajusta email y contraseña):
 * 
 * import { createUserWithEmailAndPassword } from 'firebase/auth';
 * import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
 * import { auth, db } from './config/firebase';
 * 
 * ALTERNATIVA: Usa este módulo desde la consola o crea una ruta temporal.
 * 
 * O simplemente:
 * 1. Crea un usuario en Firebase Console > Authentication
 * 2. Luego crea el documento en Firestore > users/{uid} con:
 *    {
 *      "uid": "<el_uid>",
 *      "name": "Admin RyB",
 *      "email": "admin@ryblimpiezas.com",
 *      "role": "admin",
 *      "active": true,
 *      "phone": "",
 *      "createdAt": <timestamp>
 *    }
 */

// This file is a reference guide for initial setup.
// The actual seed can be done via Firebase Console or a temporary setup route.

export const SEED_ADMIN = {
  email: 'admin@ryblimpiezas.com',
  password: 'Admin2024!',
  profile: {
    name: 'Admin RyB',
    email: 'admin@ryblimpiezas.com',
    role: 'admin',
    active: true,
    phone: '',
  },
};

export const SEED_TASK_TEMPLATES = [
  { name: 'Limpieza de portal', description: 'Barrido, fregado y limpieza de zonas comunes del portal', category: 'limpieza' },
  { name: 'Limpieza de escaleras', description: 'Barrido y fregado de escaleras', category: 'limpieza' },
  { name: 'Limpieza de ventanas', description: 'Limpieza interior y exterior de cristales', category: 'cristales' },
  { name: 'Limpieza de garaje', description: 'Barrido y fregado de garaje', category: 'garaje' },
  { name: 'Limpieza de persianas', description: 'Limpieza de persianas exteriores', category: 'persianas' },
  { name: 'Barrido de terraza', description: 'Barrido y limpieza de terrazas comunitarias', category: 'limpieza' },
  { name: 'Limpieza de ascensor', description: 'Limpieza interior del ascensor', category: 'limpieza' },
  { name: 'Desinfección zonas comunes', description: 'Desinfección de pasamanos, pomos y superficies', category: 'desinfección' },
];
