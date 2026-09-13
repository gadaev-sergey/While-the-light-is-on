import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/base',testMatch:'**/*.spec.ts',fullyParallel:false,workers:1,
  timeout:180000,expect:{timeout:10000},
  use:{baseURL:'http://127.0.0.1:5173',channel:'chrome',headless:true,viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'npm run dev -- --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:true},
});
