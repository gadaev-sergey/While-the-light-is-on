import * as T from 'three';

/** Integrate only air in front of opaque scene depth. Both lights use their real
 * shadow maps, so walls, furniture, closed doors and boarded windows stop shafts. */
export const volumeUniforms=()=>({
 sceneDepth:{value:null},lampShadow:{value:null},sunShadow:{value:null},
 inverseProjection:{value:new T.Matrix4()},cameraWorld:{value:new T.Matrix4()},
 lampMatrix:{value:new T.Matrix4()},sunMatrix:{value:new T.Matrix4()},
 lampPosition:{value:new T.Vector3()},lampDirection:{value:new T.Vector3()},
 lampColor:{value:new T.Color()},sunColor:{value:new T.Color()},
 lampPower:{value:0},lampRange:{value:6},lampCone:{value:new T.Vector2()},
 hazeDensity:{value:.052},airMin:{value:new T.Vector3()},airMax:{value:new T.Vector3()},
});
export const volumeShader=`
 uniform sampler2D sceneDepth;
 uniform highp sampler2DShadow lampShadow;
 uniform highp sampler2DShadow sunShadow;
 uniform mat4 inverseProjection,cameraWorld,lampMatrix,sunMatrix;
 uniform vec3 lampPosition,lampDirection,lampColor,sunColor,airMin,airMax;
 uniform vec2 lampCone;
 uniform float lampPower,lampRange,hazeDensity;
 vec3 unprojectAir(vec2 uv,float depth){
  vec4 q=inverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);
  return (cameraWorld*vec4(q.xyz/q.w,1.)).xyz;
 }
 float airShadow(sampler2DShadow map,mat4 matrix,vec3 p){
  vec4 q=matrix*vec4(p,1.);q.xyz/=q.w;
  if(q.w<=0.||any(lessThan(q.xyz,vec3(0.)))||any(greaterThan(q.xyz,vec3(1.))))return 0.;
  return texture(map,vec3(q.xy,q.z-.00008));
 }
 vec3 airLight(vec2 uv,vec3 sceneColor){
  if(hazeDensity<=0.)return sceneColor;
  vec3 start=unprojectAir(uv,0.),end=unprojectAir(uv,texture2D(sceneDepth,uv).r);
  vec3 ray=normalize(end-start);
  vec3 safeRay=sign(ray)*max(abs(ray),vec3(.00001));
  vec3 t0=(airMin-start)/safeRay,t1=(airMax-start)/safeRay;
  vec3 lo=min(t0,t1),hi=max(t0,t1);
  float entry=max(0.,max(lo.x,max(lo.y,lo.z)));
  float leave=min(length(end-start),min(hi.x,min(hi.y,hi.z)));
  if(leave<=entry)return sceneColor;
  float stepLength=(leave-entry)/28.;vec3 scatter=vec3(0.);
  // Stable world-space variation: no temporal noise or flashing speckles.
  for(int i=0;i<28;i++){
   vec3 p=start+ray*(entry+(float(i)+.5)*stepLength);
   float dust=.88+.12*sin(p.x*6.7+p.y*3.1)*sin(p.z*9.3-p.x*2.1);
   vec3 lit=sunColor*airShadow(sunShadow,sunMatrix,p)*.33;
   if(lampPower>0.){
    vec3 fromLamp=p-lampPosition;float distanceToLamp=length(fromLamp);
    float cone=smoothstep(lampCone.x,lampCone.y,dot(fromLamp/max(distanceToLamp,.001),lampDirection));
    float falloff=pow(clamp(1.-pow(distanceToLamp/lampRange,4.),0.,1.),2.)/(.35+distanceToLamp*distanceToLamp);
    if(cone>.001&&distanceToLamp<lampRange)lit+=lampColor*lampPower*cone*falloff*airShadow(lampShadow,lampMatrix,p)*.18;
   }
   scatter+=lit*dust*stepLength*hazeDensity;
  }
  return sceneColor*exp(-(leave-entry)*hazeDensity*.16)+scatter;
 }
`;
