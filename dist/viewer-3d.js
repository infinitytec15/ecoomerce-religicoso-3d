import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {FontLoader} from './vendor/FontLoader.js';
import {TextGeometry} from './vendor/TextGeometry.js';
import fontData from './vendor/helvetiker_regular.typeface.json' with {type:'json'};

let fontPromise;
const font=()=>fontPromise||(fontPromise=Promise.resolve(new FontLoader().parse(fontData)));
function roundedShape(w,h,r=.1){const s=new THREE.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s}
function mesh(geo,mat,parent,pos=[0,0,0],scale=[1,1,1]){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
function extrude(shape,depth=.2,bevel=.06){const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:28});g.translate(0,0,-depth/2);return g}
function base(parent,mat,w=.78){return mesh(new THREE.CylinderGeometry(w,w,.16,80),mat,parent,[0,.08,0],[1,1,.65])}
function buildCross(parent,mat){base(parent,mat,.78);const s=new THREE.Shape();s.moveTo(-.18,.2);s.lineTo(.18,.2);s.lineTo(.18,1.48);s.lineTo(.9,1.48);s.lineTo(.9,1.82);s.lineTo(.18,1.82);s.lineTo(.18,2.62);s.lineTo(-.18,2.62);s.lineTo(-.18,1.82);s.lineTo(-.9,1.82);s.lineTo(-.9,1.48);s.lineTo(-.18,1.48);s.closePath();mesh(extrude(s,.28,.085),mat,parent)}
function robe(parent,mat,x,height=1.9,radius=.58){const points=[[0,.08],[radius*.75,.08],[radius,.13],[radius*.91,.35],[radius*.7,.8],[radius*.47,1.35],[radius*.39,1.7],[radius*.24,1.85],[0,1.87]].map(([r,y])=>new THREE.Vector2(r,y*height/1.9));mesh(new THREE.LatheGeometry(points,72),mat,parent,[x,0,0]);return height}
function buildMary(parent,mat){base(parent,mat,.74);robe(parent,mat,0,2.0,.64);mesh(new THREE.SphereGeometry(.27,48,32),mat,parent,[0,2.22,.02],[.88,1.1,.9]);const hood=mesh(new THREE.SphereGeometry(.365,48,32,0,Math.PI*2,0,Math.PI*.57),mat,parent,[0,2.3,-.025],[1,1.08,.95]);hood.rotation.x=-.2;for(const side of [-1,1]){const hand=mesh(new THREE.CapsuleGeometry(.065,.3,6,16),mat,parent,[side*.055,1.48,.37]);hand.rotation.z=side*-.13;const arm=mesh(new THREE.CapsuleGeometry(.11,.48,6,20),mat,parent,[side*.24,1.25,.27]);arm.rotation.z=side*-.55}}
function buildFamily(parent,mat){base(parent,mat,.95);robe(parent,mat,-.32,1.9,.43);robe(parent,mat,.35,2.12,.44);mesh(new THREE.SphereGeometry(.24,40,26),mat,parent,[-.32,2.08,.02],[.9,1.08,1]);mesh(new THREE.SphereGeometry(.26,40,26),mat,parent,[.35,2.33,-.02],[.9,1.1,1]);const baby=mesh(new THREE.CapsuleGeometry(.18,.4,6,24),mat,parent,[0,1.1,.4]);baby.rotation.z=1.1;mesh(new THREE.SphereGeometry(.15,30,20),mat,parent,[-.28,1.25,.44]);for(const side of [-1,1]){const arm=mesh(new THREE.CapsuleGeometry(.12,.65,6,24),mat,parent,[side*.34,1.1,.32]);arm.rotation.z=side*-.95}}
function wing(side){const s=new THREE.Shape();s.moveTo(0,0);s.bezierCurveTo(.45*side,.1,.95*side,.65,1.05*side,1.65);s.bezierCurveTo(.8*side,1.3,.52*side,1.06,.13*side,.85);s.bezierCurveTo(.1*side,.54,0,.22,0,0);return s}
function buildDove(parent,mat){base(parent,mat,.85);mesh(new THREE.SphereGeometry(.34,48,32),mat,parent,[0,.95,0],[.8,1.7,1]);mesh(new THREE.SphereGeometry(.23,40,28),mat,parent,[0,1.55,.1]);const beak=mesh(new THREE.ConeGeometry(.07,.22,20),mat,parent,[0,1.57,.36]);beak.rotation.x=Math.PI/2;for(const side of [-1,1])mesh(extrude(wing(side),.12,.055),mat,parent,[side*.18,.83,-.12]);const tail=new THREE.Shape();tail.moveTo(-.16,.6);tail.lineTo(-.4,.24);tail.quadraticCurveTo(0,.34,.4,.24);tail.lineTo(.16,.6);tail.closePath();mesh(extrude(tail,.12,.03),mat,parent,[0,0,-.15])}
function buildBible(parent,mat){
  const pages=new THREE.MeshStandardMaterial({color:'#f5efdf',roughness:.92}),ink=new THREE.MeshStandardMaterial({color:'#aa9878',roughness:.92});
  base(parent,mat,.9);mesh(new THREE.CylinderGeometry(.12,.24,.5,48),mat,parent,[0,.38,-.08]);
  for(const side of [-1,1]){
    const half=new THREE.Group();half.position.set(side*.43,1.22,0);half.rotation.y=side*-.22;parent.add(half);
    mesh(extrude(roundedShape(.91,1.4,.05),.08,.018),mat,half,[0,0,-.09]);
    mesh(extrude(roundedShape(.83,1.32,.025),.1,.012),pages,half,[0,0,0]);
    for(let i=0;i<9;i++){
      if(side===1&&i>=3&&i<=6)continue;
      mesh(extrude(roundedShape(i===8?.4:.62,.012,.005),.004,.001),ink,half,[0,-.45+i*.105,.07]);
    }
    if(side===1){mesh(extrude(roundedShape(.065,.34,.012),.008,.002),ink,half,[0,.03,.074]);mesh(extrude(roundedShape(.25,.065,.012),.008,.002),ink,half,[0,.08,.074])}
  }
  mesh(new THREE.CylinderGeometry(.065,.065,1.4,32),mat,parent,[0,1.22,-.08]);
}
async function buildWord(parent,mat){
  const f=await font(),opts={font:f,size:1.7,depth:.25,curveSegments:12,bevelEnabled:true,bevelThickness:.025,bevelSize:.02,bevelSegments:3};
  const hasAccent=!!f.data.glyphs['é'],g=new TextGeometry(hasAccent?'Fé':'Fe',opts);g.computeBoundingBox();const centerX=(g.boundingBox.max.x+g.boundingBox.min.x)/2;g.translate(-centerX,.12,-.125);mesh(g,mat,parent);
  if(!hasAccent){const eg=new TextGeometry('e',opts);eg.computeBoundingBox();const top=eg.boundingBox.max.y+.12,ex=(f.data.glyphs.F.ha+(f.data.glyphs.e.x_min+f.data.glyphs.e.x_max)/2)*1.7/f.data.resolution-centerX;eg.dispose();const accent=mesh(extrude(roundedShape(.12,.36,.03),.25,.018),mat,parent,[ex+.05,top+.22,0]);accent.rotation.z=-.55}
  base(parent,mat,1.05)
}

export async function createViewer(container,product,color){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#eee7db');renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.05,100),root=new THREE.Group(),content=new THREE.Group();root.add(content);scene.add(root);
  const material=new THREE.MeshStandardMaterial({color:color||'#eee8db',roughness:.78,metalness:0});
  scene.add(new THREE.HemisphereLight('#fff8e8','#71644e',2.9));
  const key=new THREE.DirectionalLight('#fff5df',3.7);key.position.set(4,7,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.bias=-.0004;scene.add(key);
  const fill=new THREE.DirectionalLight('#fffdf2',1.2);fill.position.set(-5,3,-3);scene.add(fill);
  try{switch(product.id){case'cruz-essencial':buildCross(content,material);break;case'nossa-senhora':buildMary(content,material);break;case'espirito-santo':buildDove(content,material);break;case'palavra-fe':await buildWord(content,material);break;case'sagrada-familia':buildFamily(content,material);break;case'biblia-viva':buildBible(content,material);break;default:buildCross(content,material)}}catch(e){renderer.dispose();throw e}
  const bounds=new THREE.Box3().setFromObject(content),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());content.position.sub(center);
  const max=Math.max(size.x,size.y,size.z),distance=max*2.35;
  const start=new THREE.Vector3(.9,.48,1.65).normalize().multiplyScalar(distance);camera.position.copy(start);
  const floor=mesh(new THREE.PlaneGeometry(50,50),new THREE.ShadowMaterial({opacity:.14}),scene,[0,-size.y/2-.012,0]);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.enablePan=false;controls.minDistance=max*1.05;controls.maxDistance=max*5;controls.minPolarAngle=.06;controls.maxPolarAngle=Math.PI-.06;controls.autoRotate=false;controls.autoRotateSpeed=1.2;controls.target.set(0,0,0);controls.update();
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Modelo tridimensional ilustrativo de '+product.name+'. Arraste para girar, use a roda para zoom. As setas também giram a peça.');
  container.innerHTML='';container.append(canvas);
  let disposed=false,dirty=true,frame;
  function resize(){const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  controls.addEventListener('change',()=>{dirty=true});controls.addEventListener('start',()=>{if(controls.autoRotate){controls.autoRotate=false;const b=document.querySelector('[data-action="3d-auto"]');if(b){b.setAttribute('aria-pressed','false');b.textContent='Girar sozinho'}}});
  function tick(){if(disposed)return;const moved=controls.update();if(dirty||moved){renderer.render(scene,camera);dirty=false}frame=requestAnimationFrame(tick)}tick();
  function rotate(x,y=0){root.rotation.y+=x;root.rotation.x=THREE.MathUtils.clamp(root.rotation.x+y,-1.4,1.4);dirty=true}
  function zoom(factor){camera.position.multiplyScalar(factor);const len=camera.position.length();camera.position.setLength(THREE.MathUtils.clamp(len,controls.minDistance,controls.maxDistance));controls.update();dirty=true}
  const onKey=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(e.key))e.preventDefault();if(e.key==='ArrowLeft')rotate(-.16);if(e.key==='ArrowRight')rotate(.16);if(e.key==='ArrowUp')rotate(0,-.12);if(e.key==='ArrowDown')rotate(0,.12);if(e.key==='+'||e.key==='=')zoom(.9);if(e.key==='-')zoom(1.1);if(e.key==='0')reset()};canvas.addEventListener('keydown',onKey);
  function reset(){root.rotation.set(0,0,0);camera.position.copy(start);controls.target.set(0,0,0);controls.update();dirty=true}
  return {rotate,zoom,reset,setColor(hex){material.color.set(hex);dirty=true},toggleAuto(){controls.autoRotate=!controls.autoRotate;dirty=true;return controls.autoRotate},dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();canvas.removeEventListener('keydown',onKey);scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});renderer.dispose();canvas.remove()}};
}

