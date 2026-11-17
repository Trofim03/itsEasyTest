#!/usr/bin/env node
/**
 * Замер скорости скачивания по URL.
 * Скорость — в байтах в секунду (байт/с).
 *
 * Использование:
 *   node speedtest.js <URL> [--requests=10]
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Аргументы
function parseArgs(argv) {
  const args = argv.slice(2);
  let url = null;
  let requests = 10;

  for (const arg of args) {
    if (arg.startsWith('--requests=')) {
      requests = parseInt(arg.split('=')[1], 10);
    } else if (!url) {
      url = arg;
    }
  }

  if (!url) {
    console.error('Использование: node speedtest.js <URL> [--requests=10]');
    process.exit(1);
  }
  if (!Number.isFinite(requests) || requests <= 0) {
    console.error('--requests должен быть положительным целым числом');
    process.exit(1);
  }
  return { url, requests };
}

// Один запрос
function fetchOnce(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === 'https:' ? https : http;

    const start = process.hrtime.bigint();
    let bytes = 0;

    const req = mod.get(parsed, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, parsed).toString();
        return fetchOnce(next).then(resolve, reject);
      }

      if (res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} для ${urlStr}`));
      }

      res.on('data', (chunk) => {
        bytes += chunk.length;
      });

      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        resolve({ bytes, ms });
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(60_000, () => {
      req.destroy(new Error('Таймаут запроса'));
    });
  });
}

// Форматирование
function formatBytes(b) {
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(2)} ${units[i]}`;
}

function formatSpeed(bytesPerSec) {
  return `${bytesPerSec.toFixed(2)} байт/с`;
}

// Основная логика
async function main() {
  const { url, requests } = parseArgs(process.argv);

  console.log(`URL: ${url}`);
  console.log(`Запросов: ${requests}`);
  console.log('Запуск...\n');

  let totalBytes = 0;
  let totalMs = 0;

  for (let i = 1; i <= requests; i++) {
    try {
      const { bytes, ms } = await fetchOnce(url);
      totalBytes += bytes;
      totalMs += ms;

      const speedBps = bytes / (ms / 1000);
      console.log(
        `  #${String(i).padStart(2, '0')}: ` +
        `${formatBytes(bytes)} за ${(ms / 1000).toFixed(3)} с ` +
        `(${formatSpeed(speedBps)})`
      );
    } catch (err) {
      console.error(`  #${String(i).padStart(2, '0')}: ошибка — ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }

  const avgMs = totalMs / requests;
  const avgSpeedBps = totalBytes / (totalMs / 1000);

  console.log('\n================ ИТОГИ ================');
  console.log(`Всего скачано:         ${formatBytes(totalBytes)} (${totalBytes.toLocaleString('en-US')} байт)`);
  console.log(`Суммарное время:       ${(totalMs / 1000).toFixed(3)} с`);
  console.log(`Среднее время запроса: ${(avgMs / 1000).toFixed(3)} с`);
  console.log(`Средняя скорость:      ${formatSpeed(avgSpeedBps)}`);
  console.log('=======================================');
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});