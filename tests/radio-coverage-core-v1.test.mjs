import test from "node:test";
import assert from "node:assert/strict";
import {radioSignalAt,radioCoverageAt,radioSampleGrid} from "../src/radio-coverage-core-v1.js";
const a={id:"A",x:2,y:10,z:0},near={id:"near",x:4,y:10,z:0},far={id:"far",x:55,y:10,z:0};
test("distance reduit la qualite",()=>assert.ok(radioSignalAt({transmitter:a,receiver:near}).strength>radioSignalAt({transmitter:a,receiver:far}).strength));
test("cloison et metal influencent la reception",()=>{
 const wall=material=>({walls:[{x1:10,y1:0,x2:10,y2:20,material}]});
 const receiver={x:20,y:10,z:0};
 const open=radioSignalAt({transmitter:a,receiver}).strength;
 const light=radioSignalAt({transmitter:a,receiver,site:wall("light")}).strength;
 const metal=radioSignalAt({transmitter:a,receiver,site:wall("metal")}).strength;
 assert.ok(open>light&&light>metal);
});
test("etages influencent le signal",()=>{
 const same=radioSignalAt({transmitter:a,receiver:near});
 const upper=radioSignalAt({transmitter:a,receiver:{...near,z:6}});
 assert.equal(upper.floors,2);assert.ok(same.strength>upper.strength);
});
test("emetteurs combines, sans addition fictive des puissances",()=>{
 const receivers=[{id:"left",x:2,y:10,z:0},{id:"right",x:90,y:10,z:0}];
 const single=radioCoverageAt({transmitters:[a],receivers});
 const multiple=radioCoverageAt({transmitters:[a,{id:"B",x:90,y:10,z:0}],receivers});
 assert.equal(single.coveredCount,1);assert.equal(multiple.coveredCount,2);
 assert.equal(multiple.points[1].best.transmitterId,"B");
});
test("moteur independant des technologies",()=>{
 const receiver={x:40,y:10,z:0};
 const wifi=radioSignalAt({transmitter:a,receiver,profile:{baseline:-40,decay:27}});
 const dect=radioSignalAt({transmitter:a,receiver,profile:{baseline:-33,decay:21}});
 assert.ok(dect.strength>wifi.strength);
});
test("grille de couverture reguliere",()=>{
 const g=radioSampleGrid({width:20,height:20,step:5});
 assert.equal(g.length,16);assert.equal(radioSampleGrid({width:0,height:20}).length,0);
});
