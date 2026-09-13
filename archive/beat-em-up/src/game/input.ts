import type { Action } from './types.ts';
export class Input {
  keys = new Set<string>(); actions: Action[] = []; enabled = false; onPause = () => {}; accepts:(action:Action)=>boolean=()=>true;
  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') { this.onPause(); return; }
      if ((e.target as HTMLElement)?.matches('input, textarea, select, button')) return;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code)) e.preventDefault();
      if (!this.enabled) return;
      this.keys.add(e.code); if (e.repeat) return;
      if (e.code === 'KeyJ') this.press('attack');
      if (e.code === 'KeyK') this.press('heavy');
      if (e.code === 'KeyL') this.press('kick');
      if (e.code === 'KeyQ') this.press('guard-start');
      if (e.code === 'Space') this.press('jump');
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.press('dash');
      if (e.code === 'KeyF') this.press('interact');
      if (e.code === 'KeyR') this.press('super');
      if (e.code === 'KeyE') this.press('pulse');
    });
    window.addEventListener('keyup', e => {this.keys.delete(e.code);if(e.code==='KeyQ'&&this.enabled)this.press('guard-end');});
    window.addEventListener('blur', () => this.clear());
    canvas.addEventListener('pointerdown', e => { if (this.enabled && (e.button === 0 || e.button === 2) && e.pointerType === 'mouse') { e.preventDefault(); this.press(e.button===2?'heavy':'attack'); } });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  press(action:Action){if(this.enabled&&this.accepts(action))this.actions.push(action);}
  get direction() { return {x: Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft')), y: Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))-Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))}; }
  clear() { this.keys.clear(); this.actions.length = 0; }
  consume() { return this.actions.splice(0); }
}
