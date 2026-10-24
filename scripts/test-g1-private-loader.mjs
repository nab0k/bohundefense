import test from 'node:test';
import assert from 'node:assert/strict';
import {isG1Local,loadPrivateReviewVM,checkPrivateReview} from '../assets/atmo22/g1-private-loader.js';
const vm=()=>({name:'Accurision GmbH',facts:{workspace:[]},evidence:[],taxonomy:{},relationships:{},programmes:{},
  _bridge_audit:{status:'INTERNAL_ONLY_NOT_FOR_SITE',candidate_id:25,public_release:false,qa_approved:false}});
test('public host can never fetch private preview',async()=>{
 let n=0;
 assert.equal(isG1Local('bohundefence.com'),false);
 assert.equal(await loadPrivateReviewVM(25,{hostname:'bohundefence.com',fetcher:async()=>{n++;return null;}}),null);
 assert.equal(n,0);
});
test('only simple integer candidate ids accepted',async()=>{
 await assert.rejects(()=>loadPrivateReviewVM('../25',{hostname:'localhost'}),/Invalid/);
});
test('valid internal model only on loopback',async()=>{
 let path;
 const data=await loadPrivateReviewVM(25,{hostname:'127.0.0.1',fetcher:async(p,options)=>{
   path=p;assert.equal(options.credentials,'omit');return {ok:true,json:async()=>vm()};}});
 assert.equal(path,'/__g1_review/25.json');assert.equal(data.name,'Accurision GmbH');
});
test('fail closed on unapproved or wrong candidate record',()=>{
 for (const field of ['qa_approved','public_release']) {
   const x=vm();x._bridge_audit[field]=true;assert.throws(()=>checkPrivateReview(x,25));
 }
 assert.throws(()=>checkPrivateReview(vm(),26));
});
