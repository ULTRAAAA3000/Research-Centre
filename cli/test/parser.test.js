import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parseInput, resolveArticleRef } from '../src/app.js';

test('tokenize: кавычки объединяют слова, пробелы разделяют', () => {
  assert.deepEqual(tokenize('-s "zero trust"').map((t) => t.text), ['-s', 'zero trust']);
  assert.deepEqual(tokenize("  a   'b c'  d ").map((t) => t.text), ['a', 'b c', 'd']);
  assert.deepEqual(tokenize('').map((t) => t.text), []);
  assert.equal(tokenize('"-s"')[0].quoted, true);
});

test('строка без флага = поиск', () => {
  assert.equal(parseInput('docker').search, 'docker');
  assert.equal(parseInput('docker compose').search, 'docker compose');
});

test('-s и --search, с кавычками и без', () => {
  assert.equal(parseInput('-s docker').search, 'docker');
  assert.equal(parseInput('--search docker').search, 'docker');
  assert.equal(parseInput('-s "zero trust"').search, 'zero trust');
  assert.equal(parseInput('-s zero trust').search, 'zero trust');
});

test('-c, -t, -i и их длинные формы', () => {
  assert.equal(parseInput('-c').categories, true);
  assert.equal(parseInput('--categories').categories, true);
  assert.equal(parseInput('-t security').topic, 'security');
  assert.equal(parseInput('--topic security').topic, 'security');
  assert.equal(parseInput('-i wireguard-vpn').id, 'wireguard-vpn');
  assert.equal(parseInput('--id wireguard-vpn').id, 'wireguard-vpn');
  assert.equal(parseInput('-h').help, true);
});

test('-t вместе с -s; запрос до флага', () => {
  const p = parseInput('-t security -s ssh');
  assert.equal(p.topic, 'security');
  assert.equal(p.search, 'ssh');
  const q = parseInput('docker -t devops');
  assert.equal(q.search, 'docker');
  assert.equal(q.topic, 'devops');
});

test('ошибки: неизвестный флаг и флаг без значения', () => {
  assert.match(parseInput('-x docker').errors[0], /Неизвестный флаг: -x/);
  assert.match(parseInput('-s').errors[0], /нужно значение/);
  assert.match(parseInput('-i').errors[0], /нужно значение/);
});

test('слово в кавычках, похожее на флаг, остаётся запросом', () => {
  const p = parseInput('"-s"');
  assert.equal(p.search, '-s');
  assert.deepEqual(p.errors, []);
});

test('лишние слова после -c попадают в extra', () => {
  const p = parseInput('-c something');
  assert.equal(p.categories, true);
  assert.deepEqual(p.extra, ['something']);
});

test('отрицательные числа и дефисы внутри слов не флаги', () => {
  assert.equal(parseInput('wireguard-vpn').search, 'wireguard-vpn');
  assert.equal(parseInput('-s 3-2-1').search, '3-2-1');
});

test('resolveArticleRef: число берёт id из списка, остальное остаётся id', () => {
  const list = ['docker-compose', 'wireguard-vpn', 'fail2ban-hardening'];
  assert.deepEqual(resolveArticleRef('2', list), { id: 'wireguard-vpn' });
  assert.deepEqual(resolveArticleRef(' 3 ', list), { id: 'fail2ban-hardening' });
  assert.deepEqual(resolveArticleRef('wireguard-vpn', list), { id: 'wireguard-vpn' });
  assert.deepEqual(resolveArticleRef('wireguard-vpn'), { id: 'wireguard-vpn' });
});

test('resolveArticleRef: понятные ошибки для пустого списка и номера вне диапазона', () => {
  assert.match(resolveArticleRef('1', []).error, /сначала выполните поиск/);
  assert.match(resolveArticleRef('0', ['a']).error, /от 1 до 1/);
  assert.match(resolveArticleRef('5', ['a', 'b']).error, /от 1 до 2/);
});
