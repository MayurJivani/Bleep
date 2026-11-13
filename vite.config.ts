import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { host: true, port: 5180, proxy: { '/socket.io': { target: 'http://localhost:4410', ws: true } } },
  test: { include: ['shared/**/*.test.ts', 'server/**/*.test.ts'] },
});
