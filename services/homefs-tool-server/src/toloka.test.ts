import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseDownloadMeta, parseSearchResultsMeta, parseWatchedTopicsMeta } from './toloka';

const FIXTURES_DIR = path.resolve(__dirname, '__tests__/fixtures');

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

describe('toloka parser', () => {
  it('parses watched topics fixture from rust implementation', () => {
    const document = readFixture('watched_topics.html');
    const topicsMeta = parseWatchedTopicsMeta(document);

    assert.equal(topicsMeta.length, 20);
    assert.equal(topicsMeta[0]?.topicId, 't679577');
    assert.equal(
      topicsMeta[0]?.title,
      'Дім Дракона (Сезон 2, серія 1-4) / House of the Dragon (Season 2) (2024) WEB-DL 1080p Ukr/Eng | sub Ukr/Multi',
    );
    assert.equal(topicsMeta[0]?.category, 'series');
  });

  it('parses topic download metadata fixture from rust implementation', () => {
    const document = readFixture('single_topic.html');
    const downloadMeta = parseDownloadMeta(document);

    assert.deepEqual(downloadMeta, {
      downloadId: '693501',
      registeredAt: '2024-07-08 14:53',
    });
  });

  it('parses search results fixture from rust implementation with swarm stats', () => {
    const document = readFixture('search_results.html');
    const topicsMeta = parseSearchResultsMeta(document);

    assert.equal(topicsMeta.length, 42);
    assert.equal(topicsMeta[0]?.topicId, 't670174');
    assert.equal(
      topicsMeta[0]?.title,
      'Матриця: Трилогія / The Matrix: Trilogy (1999-2003) HD-DVDRip 1080p H.265 4xUkr/Eng | Sub 3xUkr/Eng',
    );
    assert.equal(topicsMeta[0]?.category, 'movies');
    assert.equal(topicsMeta[0]?.seeds, 12);
    assert.equal(topicsMeta[0]?.peers, 5);

    for (const topic of topicsMeta) {
      assert.equal(typeof topic.seeds, 'number');
      assert.equal(typeof topic.peers, 'number');
    }
  });
});
