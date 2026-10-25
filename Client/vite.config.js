import { defineConfig } from 'vite';
export default defineConfig({esbuild:{jsx:'automatic'},test:{environment:'jsdom',setupFiles:'./src/test/setup.js',globals:true},server:{host:'127.0.0.1',proxy:{'/api':'http://localhost:3000'}}});
