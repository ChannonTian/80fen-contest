'use strict';
// C01 compatibility candidate: updated rules and id-independent hidden cards.
const E=require('./engine'),S=require('./strategy'),search=require('./endgame2');
module.exports=()=>{
 const normal=S.createStrategy();
 return {...normal,name:'gpt-6-astra',follow(view,plays){
  return search.chooseFollow(view,plays,normal.follow(view,plays),E,16,3);
 }};
};
