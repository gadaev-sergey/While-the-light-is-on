import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
await fs.mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/');
await page.locator('.menu-overlay:not(.hidden)').waitFor();
await page.screenshot({path:'test-results/menu.png',fullPage:true});
console.log('Alpha:',await page.evaluate(async()=>{
  const result={};for(const name of ['developer-walk','developer-attack','developer-jump']){
    const img=new Image();img.src=`/assets/${name}.png`;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    const data=ctx.getImageData(0,0,img.width,img.height).data;let transparent=0,opaque=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)transparent++;if(data[i]===255)opaque++;}
    result[name]={corner:[...data.slice(0,4)],transparent:transparent/(data.length/4),opaque:opaque/(data.length/4)};
  }return result;
}));
await page.getByRole('button',{name:'Начать экспедицию',exact:true}).click();
await page.keyboard.press('Space');await page.waitForTimeout(350);
await page.screenshot({path:'test-results/jump-apex.png',fullPage:true});
await page.waitForTimeout(650);
await page.keyboard.down('KeyD');await page.waitForTimeout(1000);await page.keyboard.up('KeyD');
await page.keyboard.down('KeyJ');await page.waitForTimeout(1200);await page.keyboard.press('KeyE');await page.waitForTimeout(90);
await page.screenshot({path:'test-results/combat.png',fullPage:true});await page.keyboard.up('KeyJ');
console.log('Game:',await page.evaluate(()=>window.__NULLPOINT__.snapshot()));
await page.keyboard.press('Escape');await page.getByRole('button',{name:'Архив',exact:true}).click();
await page.screenshot({path:'test-results/archive.png',fullPage:true});
await page.getByRole('button',{name:'Закрыть',exact:true}).click();
await page.setViewportSize({width:390,height:844});
await page.getByRole('button',{name:'В главное меню',exact:true}).click();
await page.screenshot({path:'test-results/mobile.png',fullPage:true});
console.log('Errors:',errors);
await browser.close();
