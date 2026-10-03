import {defineConfig} from '@playwright/test';
// Сетевые сценарии «Шпиля»: npx playwright test --config tests/spire/playwright.config.ts
export default defineConfig({
 testDir:'.',testMatch:'**/*.spec.ts',fullyParallel:false,workers:1,timeout:120000,expect:{timeout:10000},
 use:{baseURL:'http://127.0.0.1:5177',channel:'chrome',headless:true,screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:{command:'npm run dev -- --port 5177 --strictPort',url:'http://127.0.0.1:5177/player.html',reuseExistingServer:true,cwd:'../..'},
});
