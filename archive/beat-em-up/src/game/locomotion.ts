import { clamp, lerp } from './math.ts';
import type { Player } from './types.ts';

export const MOTION = {
  speed:300, stride:240, depthScale:.65,
  takeoff:.09, launchSpeed:550, gravity:1500, landing:.14,
};
export const FLIGHT_TIME=2*MOTION.launchSpeed/MOTION.gravity;

/** Distance is accumulated by the simulation, including boundary clamping.
 * Render interpolation never advances the feet while the player stands still. */
export const walkCycleTime=(player:Player,alpha:number)=>
  lerp(player.previousWalkDistance,player.walkDistance,alpha)/MOTION.stride;

/** Continuous pose position in the eight-frame jump atlas. Height is applied separately. */
export function jumpPoseTime(player:Player,alpha:number){
  const time=Math.max(0,player.jumpTime-(1-alpha)/60);
  if(player.jumpPhase==='takeoff')return clamp(time/MOTION.takeoff,0,1)*2;
  if(player.jumpPhase==='landing')return 6+clamp(time/MOTION.landing,0,1);
  if(player.jumpSpeed===0)return 4+clamp(time/.42,0,1)*1.7;
  const phase=clamp(time/FLIGHT_TIME,0,1);
  return phase<.5?2+phase*4:4+(phase-.5)*2;
}
