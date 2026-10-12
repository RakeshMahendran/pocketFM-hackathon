import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(800,1000);
renderer.setClearColor(0xffffff,0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
window.assetMetadata=[];
for (const [id,letter] of [['jignesh','b'],['rafiq','a'],['bhavlo','c'],['pankaj','k']]) {
  const gltf = await loader.loadAsync('./vendor/kenney/Models/GLB%20format/character-'+letter+'.glb');
  const model = gltf.scene;
  const mixer = new THREE.AnimationMixer(model);
  const idle = gltf.animations.find(a=>/^idle$/i.test(a.name)) || gltf.animations.find(a=>/idle/i.test(a.name));
  if (idle) { mixer.clipAction(idle).play(); mixer.update(.25); }
  model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model), size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const group = new THREE.Group(); group.add(model); model.position.sub(center);
  group.rotation.y=-.28;
  const scene=new THREE.Scene();scene.add(group);
  scene.add(new THREE.HemisphereLight(0xffffff,0xd5d2c8,2.6));
  const key=new THREE.DirectionalLight(0xfff5e8,3);key.position.set(3,6,5);scene.add(key);
  const fill=new THREE.DirectionalLight(0xffffff,1.2);fill.position.set(-4,2,-3);scene.add(fill);
  const height=size.y*1.24;
  const camera=new THREE.OrthographicCamera(-height*.4,height*.4,height*.5,-height*.5,.01,100);
  camera.position.set(0,size.y*.11,size.y*3);camera.lookAt(0,0,0);
  renderer.render(scene,camera);
  const image=new Image(); image.id=id;image.src=renderer.domElement.toDataURL('image/png'); document.body.append(image);
  await image.decode();
  window.assetMetadata.push({id,file:letter,animations:gltf.animations.map(a=>a.name),height:size.y});
}
window.assetsReady=true;
