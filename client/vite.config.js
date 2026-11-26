import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // telefonról is elérhető a helyi hálózaton
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
