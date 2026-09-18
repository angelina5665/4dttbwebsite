import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {isFourDigits,isIsoDate,validateArchive,filterDraws} from '../../history.mjs';

const commit='a'.repeat(40);
const source=(file)=>({dataset:'deadboy18/malaysia-4d',commit,url:`https://github.com/deadboy18/malaysia-4d/blob/${commit}/data/${file}`});
const fixture=()=>({schemaVersion:2,providers:[{id:'magnum',name:'Magnum 4D'},{id:'toto',name:'Sports Toto 4D'}],coverage:{from:'2026-09-06',to:'2026-09-09',drawCount:2,providerCount:2,limited:true},draws:[
  {providerId:'magnum',date:'2026-09-06',drawNo:null,prizes:{first:'0038',second:'0000',third:null,special:['0123'],consolation:[]},source:source('magnum_draws.csv')},
  {providerId:'toto',date:'2026-09-09',drawNo:'2026-01',prizes:{first:'8888',second:'5555',third:'3333',special:[],consolation:['0038']},source:source('sportstoto_draws.csv')}
]});

test('four-digit strings preserve leading zeros',()=>{
  for(const value of ['0038','0000','9999']) assert.equal(isFourDigits(value),true);
  for(const value of ['38','12345',' 0038 ','３８００',38,null]) assert.equal(isFourDigits(value),false);
});
test('dates must be real ISO calendar dates',()=>{
  for(const value of ['2026-09-09','2024-02-29']) assert.equal(isIsoDate(value),true);
  for(const value of ['2026-02-29','2026-13-01','2026-9-9',null]) assert.equal(isIsoDate(value),false);
});
test('first-prize and all-tier filters do not conflate standard and Jackpot results',()=>{
  const data=validateArchive(fixture());
  assert.equal(filterDraws(data,{number:'0038'}).length,1);
  assert.equal(filterDraws(data,{number:'0038',prizeType:'all'}).length,2);
  assert.equal(filterDraws(data,{number:'0000'}).length,0);
  assert.equal(filterDraws(data,{number:'0000',prizeType:'all'}).length,1);
  assert.equal(filterDraws(data,{number:'0038',prizeType:'jackpot'}).length,0);
  assert.deepEqual(filterDraws(data).map(draw=>draw.date),['2026-09-09','2026-09-06']);
});
test('invalid filters and malformed source records fail closed',()=>{
  for(const number of ['38','12345',' 0038 ','３００８']) assert.throws(()=>filterDraws(fixture(),{number}));
  for(const prizeType of ['winner','Jackpot1']) assert.throws(()=>filterDraws(fixture(),{prizeType}));
  for(const mutate of [d=>d.schemaVersion=1,d=>d.coverage.to='2026-09-10',d=>d.draws[0].prizes.first='38',d=>d.draws[0].source.url='https://example.com',d=>d.draws[0].source.commit='main']){
    const data=fixture(); mutate(data); assert.throws(()=>validateArchive(data));
  }
});
test('licensed snapshot finds dated 1111 first prizes',()=>{
  const data=validateArchive(JSON.parse(readFileSync(new URL('../../history-data.json',import.meta.url),'utf8')));
  assert.equal(data.coverage.drawCount,16129);
  assert.deepEqual(filterDraws(data,{number:'1111'}).map(draw=>`${draw.providerId} ${draw.date}`),[
    'toto 2023-10-22','magnum 2010-06-06','toto 1998-12-26','magnum 1986-02-06'
  ]);
});
test('each archived operator has a local logo on history cards',()=>{
  const source=readFileSync(new URL('../../history.mjs',import.meta.url),'utf8');
  for(const name of ['damacai','magnum','toto']){
    assert.match(source,new RegExp(`${name}:'logos/${name}\\.png'`));
    assert.ok(existsSync(new URL(`../../logos/${name}.png`,import.meta.url)));
  }
  assert.match(source,/identity\.append\(logo,title\)/);
});
