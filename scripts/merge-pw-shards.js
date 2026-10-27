#!/usr/bin/env node
'use strict';

// Playwright 샤드 실행 결과(JSON) 여러 개를 파서가 먹을 수 있는 raw JSON 하나로 합친다.
//
//   merge-pw-shards.js <out.json> <shard1.json> <shard2.json> ...
//
// 한 샤드가 타임아웃·크래시로 JSON 을 못 남겨도 나머지 샤드 결과는 살린다.
// 살리지 못한 샤드는 raw.errors 에 남겨 parse-pw-results.js 가 status:error 로 표시하게 한다.
// (조용히 통과로 보이는 것보다 건수와 함께 시끄럽게 실패하는 쪽이 낫다.)

const fs = require('fs');
const { parsePlaywrightOutputText } = require('./parse-pw-results.js');

const STAT_KEYS = ['expected', 'unexpected', 'flaky', 'skipped', 'duration'];

function readShard(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.trim() === '') throw new Error('출력이 비어 있음');
  return parsePlaywrightOutputText(text, file);
}

function main(outFile, shardFiles) {
  const merged = { config: null, suites: [], errors: [], stats: {} };
  for (const key of STAT_KEYS) merged.stats[key] = 0;

  let parsedCount = 0;

  shardFiles.forEach((file, idx) => {
    const label = `shard ${idx + 1}/${shardFiles.length}`;
    let raw;
    try {
      raw = readShard(file);
    } catch (err) {
      const stderrLog = file.replace(/\.json$/, '.stderr.log');
      merged.errors.push({
        message: `${label} 결과를 읽지 못함: ${err.message}. stderr 로그: ${stderrLog}`,
      });
      return;
    }

    parsedCount += 1;
    if (!merged.config) merged.config = raw.config || null;
    if (Array.isArray(raw.suites)) merged.suites.push(...raw.suites);
    if (Array.isArray(raw.errors)) merged.errors.push(...raw.errors);
    for (const key of STAT_KEYS) merged.stats[key] += (raw.stats && raw.stats[key]) || 0;
  });

  if (parsedCount === 0) {
    // 전부 실패하면 합칠 게 없다. 호출 측(run-project.sh)이 error 결과를 쓰도록 실패로 끝낸다.
    console.error('[merge-pw-shards] 모든 샤드가 JSON 을 남기지 못했습니다.');
    process.exit(2);
  }

  fs.writeFileSync(outFile, JSON.stringify(merged));
  console.error(
    `[merge-pw-shards] ${parsedCount}/${shardFiles.length} 샤드 병합 완료 ` +
      `(expected ${merged.stats.expected}, unexpected ${merged.stats.unexpected})`
  );
}

if (require.main === module) {
  const [, , outFile, ...shardFiles] = process.argv;
  if (!outFile || shardFiles.length === 0) {
    console.error('Usage: merge-pw-shards.js <out.json> <shard.json>...');
    process.exit(2);
  }
  main(outFile, shardFiles);
}

module.exports = { main };
