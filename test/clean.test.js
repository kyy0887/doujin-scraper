// Unit test lib/clean.js — pembersih data (URL http(s) + strip HTML).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeUrl, safeHttpUrl, stripHtml } from '../lib/clean.js';

test('sanitizeUrl: tolak javascript:, data:, vbscript:', () => {
  assert.equal(sanitizeUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeUrl('data:text/html,<script>'), '');
  assert.equal(sanitizeUrl('vbscript:msgbox(1)'), '');
  assert.equal(sanitizeUrl('JAVASCRIPT:alert(1)'), '');
});

test('sanitizeUrl: nilai non-string → kosong, string normal di-trim', () => {
  assert.equal(sanitizeUrl(null), '');
  assert.equal(sanitizeUrl(123), '');
  assert.equal(sanitizeUrl('  https://example.com/a  '), 'https://example.com/a');
});

test('safeHttpUrl: hanya http/https yang lolos', () => {
  assert.equal(safeHttpUrl('https://example.com/img.webp'), 'https://example.com/img.webp');
  assert.equal(safeHttpUrl('http://example.com/img.jpg'), 'http://example.com/img.jpg');
  assert.equal(safeHttpUrl('ftp://example.com/file'), '');
  assert.equal(safeHttpUrl('//example.com/protocol-relative'), '');
  assert.equal(safeHttpUrl('bukan url'), '');
});

test('stripHtml: buang script, style, dan tag lainnya', () => {
  const out = stripHtml('<p>Halo <b>dunia</b></p><script>alert(1)</script><style>body{}</style>');
  assert.equal(out, 'Halo dunia');
});

test('stripHtml: input non-string → kosong', () => {
  assert.equal(stripHtml(undefined), '');
  assert.equal(stripHtml({}), '');
});
