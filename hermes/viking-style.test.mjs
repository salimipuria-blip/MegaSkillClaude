import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VIKING_PALETTE, isVikingImageRequest, isVikingStyleEdit, vikingEditDirection,
  vikingFormat, vikingImageDirection,
} from './viking-style.mjs';

test('Viking social format recognition is Persian/English and story takes precedence', () => {
  assert.equal(vikingFormat('استوری ۹:۱۶ کمپ جنگلی'), 'story');
  assert.equal(vikingFormat('Instagram Story 9:16'), 'story');
  assert.equal(vikingFormat('پست اینستاگرام ۴:۵'), 'post');
  assert.equal(vikingFormat('3-slide carousel'), 'post');
  assert.equal(vikingFormat('a square portrait'), null);
  assert.equal(vikingFormat('استوری و کاروسل'), 'story');
});

test('brand treatment is limited to Viking/outdoor requests and social creatives', () => {
  assert.equal(isVikingImageRequest('یک استوری برای وایکینگ'), true);
  assert.equal(isVikingImageRequest('پست کمپ کنار دریاچه'), true);
  assert.equal(isVikingImageRequest('a red fox in snow'), false);
  assert.equal(isVikingStyleEdit('این عکس رو برای پست وایکینگ آماده کن'), true);
  assert.equal(isVikingStyleEdit('make this story like the reference'), true);
  assert.equal(isVikingStyleEdit('edit this photo like those examples'), true);
  assert.equal(isVikingStyleEdit('crop this photo to 9:16'), false);
});

test('generation direction is exact about format, mood, negative space and type separation', () => {
  const story = vikingImageDirection('Instagram Story 9:16 for Viking Offroad');
  assert.match(story, /9:16 Story/);
  assert.match(story, /Photorealistic AI-generated live-action photography/);
  assert.match(story, /8K-like microdetail/);
  assert.match(story, /amber sunrise/);
  assert.match(story, /forest-green edges/);
  assert.match(story, /near-black lower text-safe area/);
  assert.match(story, /negative space/);
  assert.match(story, /no text, letters, numbers, logo/);
  assert.match(story, /not Norse fantasy/);
  assert.doesNotMatch(vikingImageDirection('a red fox in snow'), /Viking Offroad/);
  assert.equal(VIKING_PALETTE.orange, '#F39A2B');
  assert.equal(VIKING_PALETTE.black, '#141414');
});

test('brand edit direction locks the real source subject and forbids generated poster graphics', () => {
  const prompt = vikingEditDirection('Turn this photo into a 4:5 Viking Offroad post');
  assert.match(prompt, /Portrait 4:5/);
  assert.match(prompt, /8K-like microdetail/);
  assert.match(prompt, /low amber sunrise/);
  assert.match(prompt, /Preserve people\/identity/);
  assert.match(prompt, /vehicle\/equipment count/);
  assert.match(prompt, /No generated text/);
  assert.match(prompt, /real fonts\/assets/);
  assert.equal(vikingEditDirection('make the photo brighter'), '');
});
