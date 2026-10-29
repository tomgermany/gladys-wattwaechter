import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const texts = (obj) => Object.values(obj ?? {});

test('the manifest config defaults match DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema ?? []) {
    if (field.default !== undefined) {
      assert.equal(
        field.key === 'poll_frequency' ? Number(field.default) : field.default,
        DEFAULT_CONFIG[field.key],
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('poll interval uses minute choices and MQTT settings stay hidden', () => {
  const poll = manifest.config_schema.find((field) => field.key === 'poll_frequency');
  assert.equal(poll.type, 'select');
  assert.equal(poll.default, '1');
  assert.deepEqual(poll.options.map((option) => option.value), ['1', '5', '15', '30', '60']);
  assert.ok(!manifest.config_schema.some((field) => field.key.startsWith('mqtt_')));
});

test('the manifest and the package agree on the version', () => {
  assert.equal(manifest.version, pkg.version);
});

test('the manifest defines the catalog cover image', () => {
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/tomgermany/gladys-wattwaechter/main/cover.png',
  );
});

test('the image is tagged, on a registry, with a non-empty tag', () => {
  assert.match(manifest.docker_image, /^[a-z0-9.-]+\/\S+:[A-Za-z0-9._-]+$/);
});

test('every user-facing text carries the same languages', () => {
  const fields = [
    ...(manifest.config_schema ?? []),
    ...(manifest.scene_actions ?? []).flatMap((item) => item.fields ?? []),
    ...(manifest.scene_triggers ?? []).flatMap((item) => item.fields ?? []),
  ];
  const blocks = [
    manifest.label,
    manifest.description,
    ...fields.map((f) => f.label),
    ...fields.map((f) => f.description),
    ...(manifest.widgets ?? []).flatMap((w) => [w.label, w.description]),
  ].filter(Boolean);

  for (const block of blocks) {
    const langs = texts(block);
    assert.ok(langs.every((t) => typeof t === 'string' && t.length > 0), JSON.stringify(block));
  }
});

test('option labels are language maps, unlike the device payload', () => {
  const withOptions = [
    ...(manifest.config_schema ?? []),
    ...(manifest.scene_triggers ?? []).flatMap((item) => item.fields ?? []),
    ...(manifest.scene_actions ?? []).flatMap((item) => item.fields ?? []),
  ].filter((f) => f.type === 'select' || f.type === 'multi_select');

  for (const field of withOptions) {
    for (const option of field.options ?? []) {
      assert.equal(typeof option.value, 'string', `${field.key}: option value must be a string`);
      assert.ok(option.value.length > 0, `${field.key}: option value must not be empty`);
      assert.equal(typeof option.label, 'object', `${field.key}: ${option.value}`);
      assert.ok(option.label.de, `${field.key}: ${option.value} needs a German label`);
    }
  }
});

test('the widget and scene keys are unique', () => {
  const keys = (list) => (list ?? []).map((e) => e.key);
  assert.equal(new Set(keys(manifest.widgets)).size, keys(manifest.widgets).length);
  assert.equal(new Set(keys(manifest.scene_triggers)).size, keys(manifest.scene_triggers).length);
  assert.equal(new Set(keys(manifest.scene_actions)).size, keys(manifest.scene_actions).length);
});
