import {defineConfig} from 'vite';

export default defineConfig(({mode}) => ({
  base: mode === 'pages' ? '/While-the-light-is-on/' : '/',
}));
