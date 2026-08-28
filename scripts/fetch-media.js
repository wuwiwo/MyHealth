#!/usr/bin/env node
/* fetch-media.js — 按 action-map.json 拉取已关联动作的媒体到 page/media/
   输入: data/action-map.json + data/raw/exercises.json
   输出: page/media/images/<原名>.jpg, page/media/videos/<原名>.gif
   用法: node scripts/fetch-media.js [--dry-run] */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const RAW = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'raw', 'exercises.json'), 'utf8'));
const AMAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'action-map.json'), 'utf8'));
const BASE = 'https://raw.githubusercontent.com/wangmuerxiao/exercises-dataset-zh/master/';
const DRY = process.argv.includes('--dry-run');

const OUT_IMG = path.join(ROOT, 'page', 'media', 'images');
const OUT_GIF = path.join(ROOT, 'page', 'media', 'videos');
fs.mkdirSync(OUT_IMG, { recursive: true });
fs.mkdirSync(OUT_GIF, { recursive: true });

function fetchTo(url, dest) {
  return new Promise(function(resolve, reject) {
    const file = fs.createWriteStream(dest);
    https.get(url, function(res) {
      if (res.statusCode !== 200) { file.close(); fs.unlinkSync(dest); return reject(new Error('HTTP ' + res.statusCode + ' ' + url)); }
      res.pipe(file);
      file.on('finish', function(){ file.close(resolve); });
    }).on('error', function(e){ try{file.close();fs.unlinkSync(dest);}catch(_){} reject(e); });
  });
}

(async function main() {
  const ids = Object.keys(AMAP).filter(function(k){ return k.charAt(0) !== '_'; });
  const byId = {};
  RAW.forEach(function(e){ byId[e.id] = e; });
  const jobs = [];
  const seen = {};
  ids.forEach(function(name) {
    const e = byId[AMAP[name]];
    if (!e) { console.error('[skip] dsId 不存在:', name); return; }
    [e.image, e.gif_url].forEach(function(rel) {
      if (!rel || seen[rel]) return;
      seen[rel] = true;
      const isGif = rel.indexOf('videos/') === 0;
      jobs.push({ rel: rel, url: BASE + rel, dest: path.join(isGif ? OUT_GIF : OUT_IMG, rel.split('/').pop()) });
    });
  });
  console.log('jobs:', jobs.length, DRY ? '(dry-run)' : '');
  for (const j of jobs) {
    if (DRY) { console.log('  would fetch', j.rel); continue; }
    if (fs.existsSync(j.dest)) { console.log('  exists ', j.rel); continue; }
    try { await fetchTo(j.url, j.dest); console.log('  ok      ', j.rel); }
    catch (e) { console.error('  FAIL    ', j.rel, e.message); }
  }
  console.log('done.');
})();
