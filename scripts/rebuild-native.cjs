#!/usr/bin/env node
/**
 * 重建 better-sqlite3 原生二进制以匹配目标运行时 ABI。
 *
 * 背景：better-sqlite3 的二进制只能同时存在一份（位于
 * build/Release/better_sqlite3.node），而 vitest 运行在 Node（ABI 127），
 * Electron 37 运行在 Electron（ABI 136），两者 ABI 不同、互不兼容。
 *
 * 用法：
 *   node scripts/rebuild-native.cjs            # 切换到 node ABI（供 npm test）
 *   node scripts/rebuild-native.cjs --electron # 切换到 electron ABI（供 electron . / 打包）
 *
 * 实现：从 npmmirror 镜像直接下载对应 ABI 的 prebuilt tar.gz，解压覆盖到
 * build/Release/better_sqlite3.node。避免依赖 prebuild-install 的缓存逻辑
 * （其会因 .forge-meta 标记跳过重复解压），也不依赖本机 C++ 编译工具链。
 *
 * 镜像可用环境变量 npm_config_better_sqlite3_binary_host_mirror 覆盖。
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const projectRoot = path.resolve(__dirname, '..');
const betterSqliteDir = path.join(projectRoot, 'node_modules', 'better-sqlite3');
const targetNodeFile = path.join(
  betterSqliteDir,
  'build',
  'Release',
  'better_sqlite3.node',
);

const mirror =
  process.env.npm_config_better_sqlite3_binary_host_mirror ||
  'https://registry.npmmirror.com/-/binary/better-sqlite3';

const isElectron = process.argv.includes('--electron');

// Electron 37 → NODE_MODULE_VERSION 136（与 node-abi 推导一致）。
const ELECTRON_ABI = 136;

function readPkgVersion(pkgPath) {
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
}

function download(url, dest) {
  // 优先用 curl（Git Bash 环境可用），失败回退到 node 原生 https。
  const curl = spawnSync('curl', ['-sL', '--max-time', '120', '-o', dest, url], {
    stdio: 'inherit',
  });
  if (curl.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return true;
  }
  // 回退：用 node 下载（无外部依赖，但需处理重定向与 TLS）。
  const https = require('node:https');
  const { URL } = require('node:url');
  return new Promise((resolve) => {
    const doGet = (u, redirects) => {
      if (redirects > 5) return resolve(false);
      https
        .get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return doGet(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(false);
          }
          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve(true);
          });
          file.on('error', () => resolve(false));
        })
        .on('error', () => resolve(false));
    };
    doGet(new URL(url), 0);
  });
}

function extract(tarPath, destDir) {
  // 以项目根为工作目录，用相对路径解压，规避 Git Bash tar 对 Windows
  // 绝对路径（含盘符冒号）的解析问题。
  const relativeDest = path.relative(projectRoot, destDir).split(path.sep).join('/');
  const tar = spawnSync('tar', ['-xzf', tarPath, '-C', relativeDest], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  return tar.status === 0;
}

function main() {
  if (!fs.existsSync(betterSqliteDir)) {
    console.error('[rebuild-native] 未找到 better-sqlite3，请先执行 npm install。');
    process.exit(1);
  }

  const version = readPkgVersion(path.join(betterSqliteDir, 'package.json'));
  const abi = isElectron ? ELECTRON_ABI : 127;
  const runtime = isElectron ? 'electron' : 'node';
  const filename = `better-sqlite3-v${version}-${runtime}-v${abi}-win32-x64.tar.gz`;
  const url = `${mirror}/v${version}/${filename}`;

  console.log(
    `[rebuild-native] 切换到 ${runtime} ABI（v${abi}）：better-sqlite3@${version}`,
  );
  console.log(`[rebuild-native] 下载 ${url}`);

  // 下载到项目根目录（相对路径），规避 tar 对 Windows 绝对路径的解析问题。
  const tarName = `.bsqlite-${runtime}-v${abi}.tar.gz`;
  const tarPath = path.join(projectRoot, tarName);
  const relativeTar = tarName;

  const ok = download(url, tarPath);
  Promise.resolve(ok).then((downloaded) => {
    if (!downloaded) {
      console.error('[rebuild-native] 下载失败（请检查网络或镜像可用性）。');
      fs.rmSync(tarPath, { force: true });
      process.exit(1);
    }
    // 解压前先删除旧二进制，避免 tar 因目标文件已存在而报
    // 「Cannot open: File exists」导致切换失败。
    fs.rmSync(targetNodeFile, { force: true });
    if (!extract(relativeTar, betterSqliteDir)) {
      console.error('[rebuild-native] 解压失败。');
      fs.rmSync(tarPath, { force: true });
      process.exit(1);
    }
    if (!fs.existsSync(targetNodeFile)) {
      console.error('[rebuild-native] 未找到解压后的二进制文件。');
      fs.rmSync(tarPath, { force: true });
      process.exit(1);
    }
    fs.rmSync(tarPath, { force: true });
    console.log(`[rebuild-native] 完成：${targetNodeFile}`);
    process.exit(0);
  });
}

main();
