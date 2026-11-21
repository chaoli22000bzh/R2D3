import test from "node:test";
import assert from "node:assert/strict";
import {radioCapabilities,validateWifiRadio,radioChannel,wifiSignalAt,wifiCoverageAt} from "../src/wifi-radio-coverage-v1.js";
const AP=(id,x,z=0,bands=["5"])=>({id,x,y:10,z,bands,enabled:true});
const PC=(id,x,z=0)=>({id,x,y:10,z});
test("Profils radio : générations modernes et 6 GHz seulement pour 6E/7",()=>{
 assert.deepEqual(radioCapabilities("wifi5").bands,["5"]);
 assert.deepEqual(radioCapabilities("wifi6").bands,["2.4","5"]);
 assert.deepEqual(radioCapabilities("wifi6e").bands,["2.4","5","6"]);
 assert.equal(validateWifiRadio({generation:"wifi5",radios:{"6":{enabled:true,channel:"auto",width:80}}}).success,false);
 assert.equal(validateWifiRadio({generation:"wifi6e",radios:{"6":{enabled:true,channel:5,width:80}}}).success,true);
 assert.equal(radioChannel("2.4",6),6);
 assert.equal(radioChannel("2.4",36),null);
 assert.equal(validateWifiRadio({generation:"wifi6",radios:{"2.4":{enabled:true,channel:1,width:160}}}).success,false);
});
test("Signal : distance et étages atténuent le RSSI",()=>{
 const ap=AP("AP1",10,0);
 const near=wifiSignalAt({ap,client:PC("PC1",11,0),band:"5"});
 const far=wifiSignalAt({ap,client:PC("PC2",55,0),band:"5"});
 const upstairs=wifiSignalAt({ap,client:PC("PC3",11,6),band:"5"});
 assert.ok(near.rssi>far.rssi);
 assert.ok(near.rssi>upstairs.rssi);
 assert.equal(upstairs.floors,2);
 assert.ok(wifiSignalAt({ap,client:PC("PC4",11,0),band:"2.4"}).rssi>near.rssi);
});
test("Couverture : les bornes se complètent, une borne désactivée n'aide plus",()=>{
 const clients=[PC("left",0),PC("right",70)];
 const single=wifiCoverageAt({accessPoints:[AP("A",0)],checkpoints:clients,bands:["5"]});
 assert.equal(single.coveredCount,1);
 const multi=wifiCoverageAt({accessPoints:[AP("A",0),AP("B",70)],checkpoints:clients,bands:["5"]});
 assert.equal(multi.coveredCount,2);
 assert.equal(multi.allCovered,true);
 assert.equal(multi.points[1].best.apId,"B");
 const off=wifiCoverageAt({accessPoints:[AP("A",0),{...AP("B",70),enabled:false}],checkpoints:clients,bands:["5"]});
 assert.equal(off.coveredCount,1);
});
test("Couverture : propagation entre étages et bande compatible",()=>{
 const ap=AP("A",0,3,["2.4","5"]);
 const points=[PC("rdc",0,0),PC("r1",0,3),PC("r2",0,6)];
 const r=wifiCoverageAt({accessPoints:[ap],checkpoints:points,bands:["2.4"]});
 assert.equal(r.totalCount,3);
 assert.ok(r.points[1].best.rssi>r.points[0].best.rssi);
 assert.equal(wifiCoverageAt({accessPoints:[ap],checkpoints:points,bands:["6"]}).coveredCount,0);
});
test("Position invalide rejetée",()=>{
 assert.equal(wifiSignalAt({ap:AP("A",0),client:{id:"x",x:0,y:0}}).code,"invalid_position");
});
