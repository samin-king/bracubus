// One same-origin function serves every existing integrated Express API route.
// Do not import services/src/server.js here: it starts a persistent listener.
export { default } from '../services/src/vercel.js';
