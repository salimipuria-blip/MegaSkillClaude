import test from 'node:test';
import assert from 'node:assert/strict';
import {tokens} from '../engine/router.mjs';

test('tokens removes whole Persian and English stop words',()=>{
 assert.deepEqual(tokens('و این یک است لطفا and THE please'),[]);
});

test('tokens retains meaningful words in a Persian sentence',()=>{
 assert.deepEqual(tokens('سلام این یک تست است و لطفا به من کمک کن'),['سلام','تست','کمک']);
});

test('tokens does not remove stop-word letters or substrings inside other words',()=>{
 assert.deepEqual(tokens('روان شکر توان winter another'),['روان','شکر','توان','winter','another']);
});

test('tokens separates mixed-language words, punctuation and repeated whitespace',()=>{
 assert.deepEqual(tokens('  سلام، Hello!\tاین  WORLD؟\nتست؛ and API... ۱۲۳ 42 '),
  ['سلام','hello','world','تست','api','۱۲۳','42']);
 assert.deepEqual(tokens('سلام/Hello—تست_API'),['سلام','hello','تست','api']);
});

test('tokens removes internal Persian ZWNJ without creating a word boundary',()=>{
 assert.deepEqual(tokens('می\u200cروم کتاب\u200cها'),['میروم','کتابها','کتاب']);
 assert.deepEqual(tokens('می\u200cروم کتاب\u200cها'),tokens('میروم کتابها'));
});

test('tokens preserves ordered deduplication, Persian stems and English bridges',()=>{
 assert.deepEqual(tokens('عکس\u200cهای عکس PHOTO photo'),['عکسهای','عکس','photo']);
});

test('tokens preserves Persian letter normalization',()=>{
 assert.deepEqual(tokens('آبی كيك ياس'),['ابی','کیک','یاس']);
});

test('tokens matches stop words after the same normalization as input',()=>{
 assert.deepEqual(tokens('آن این لطفاً PLEASE'),[]);
 assert.deepEqual(tokens('آن، کمک و این تست'),['کمک','تست']);
});

test('tokens returns no tokens for empty, nullish or separator-only input',()=>{
 for(const value of ['',undefined,null,'   \t\n','،؛!? —','\u200c']){
  assert.deepEqual(tokens(value),[]);
 }
});

test('tokens preserves string coercion and the minimum token length',()=>{
 assert.deepEqual(tokens(123),['123']);
 assert.deepEqual(tokens('x ب 7 ab 12'),['ab','12']);
});
