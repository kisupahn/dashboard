// 사용자 PC에서 실행합니다. Google 로그인/비밀키는 이 채팅으로 전송하지 않습니다.
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const local = resolve(root, '.relay-local');
async function exists(path) { try { await access(path); return true; } catch { return false; } }
export function manifest() {
  return { timeZone: 'Asia/Seoul', runtimeVersion: 'V8', exceptionLogging: 'STACKDRIVER', oauthScopes: ['https://www.googleapis.com/auth/script.external_request'], webapp: { access: 'ANYONE_ANONYMOUS', executeAs: 'USER_DEPLOYING' } };
}
export function configSource(config) {
  // JSON 직렬화로 따옴표·개행을 코드로 해석하지 않습니다.
  return '// 자동 생성. 로컬 파일이나 Google 프로젝트를 공유하지 마세요.\nvar AUTOMATED_RELAY_CONFIG = ' + JSON.stringify(config).replace(/</g, '\\u003c') + ';\n';
}
async function clasp(args, capture = false) {
  return new Promise((resolvePromise, reject) => {
    // npm run으로 실행하면 npm CLI를 Node로 직접 호출하므로 Windows에서도 쉘이 필요 없습니다.
    const npmCli = process.env.npm_execpath;
    if (!npmCli && process.platform === 'win32') { reject(new Error('npm run setup:relay로 실행하세요.')); return; }
    const command = npmCli ? process.execPath : 'npx';
    const cliArgs = npmCli ? [npmCli, 'exec', '--yes', '--package=@google/clasp@3.4.1', '--', 'clasp', ...args] : ['--yes', '@google/clasp@3.4.1', ...args];
    const child = spawn(command, cliArgs, { cwd: local, stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit', shell: false });
    let output = '';
    if (capture) { child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; }); }
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolvePromise(output) : reject(new Error('clasp ' + args[0] + ' 실패. ' + (capture ? output : '터미널의 안내를 확인하세요.'))));
  });
}
async function askHidden(label) {
  process.stdout.write(label);
  const muted = new Writable({ write(chunk, encoding, callback) { callback(); } });
  const rl = createInterface({ input: process.stdin, output: muted, terminal: !!process.stdin.isTTY });
  try { return (await rl.question('')).trim(); }
  finally { rl.close(); process.stdout.write('\n'); }
}
async function main() {
  await mkdir(local, { recursive: true, mode: 0o700 });
  console.log('코드 편집 없이 교통 중계를 설치합니다. 기존 메모 프로젝트는 변경하지 않습니다.');
  console.log('처음 한 번 https://script.google.com/home/usersettings 에서 Google Apps Script API를 켜세요.');
  console.log('Google 로그인 화면에서 Apps Script 프로젝트 관리 권한을 승인하세요.');
  try { await clasp(['show-authorized-user'], true); } catch { await clasp(['login']); }
  // create가 만든 연결을 재사용합니다. 동일 작업에서 프로젝트를 반복 생성하지 않습니다.
  if (!await exists(resolve(local, '.clasp.json'))) await clasp(['create-script', '--type', 'standalone', '--title', 'Seoul Transit Relay']);
  let config = {};
  try { config = JSON.parse(await readFile(resolve(local, 'config.json'), 'utf8')); } catch {}
  console.log('API 키는 입력해도 표시되지 않습니다. 재설정 시 Enter는 기존 값을 유지합니다.');
  config.SEOUL_SUBWAY_API_KEY = await askHidden('지하철 인증키: ') || config.SEOUL_SUBWAY_API_KEY || '';
  config.SEOUL_BUS_API_KEY = await askHidden('버스 Decoding 인증키: ') || config.SEOUL_BUS_API_KEY || '';
  if (!config.SEOUL_SUBWAY_API_KEY || !config.SEOUL_BUS_API_KEY) throw new Error('두 API 키를 입력해야 합니다. 프로젝트 연결은 보관됐으며 다시 실행하면 이어서 진행합니다.');
  config.DASHBOARD_TOKEN ||= randomBytes(24).toString('base64url');
  await writeFile(resolve(local, 'config.json'), JSON.stringify(config), { mode: 0o600 });
  await writeFile(resolve(local, 'RelayConfig.gs'), configSource(config), { mode: 0o600 });
  await writeFile(resolve(local, 'Code.gs'), await readFile(resolve(root, 'apps-script/Code.gs'), 'utf8'), { mode: 0o600 });
  await writeFile(resolve(local, 'appsscript.json'), JSON.stringify(manifest(), null, 2));
  // 개인 설정 JSON은 Apps Script 업로드에서도 제외합니다.
  await writeFile(resolve(local, '.claspignore'), '**/**\n!Code.gs\n!RelayConfig.gs\n!appsscript.json\n');
  await clasp(['push', '--force']);
  let deployment;
  try { deployment = (await readFile(resolve(local, 'deployment-id'), 'utf8')).trim(); } catch {}
  const output = await clasp(deployment ? ['update-deployment', deployment] : ['create-deployment', '--description', 'Seoul transit relay'], true);
  const match = output.match(/\b(AKfy[A-Za-z0-9_-]+)\b/);
  if (match) { deployment = match[1]; await writeFile(resolve(local, 'deployment-id'), deployment); }
  console.log(output);
  if (deployment) console.log('\n대시보드 중계 주소: https://script.google.com/macros/s/' + deployment + '/exec');
  else console.log('배포 주소를 자동 추출하지 못했습니다. 위 clasp 출력의 배포 ID 또는 배포 관리에서 /exec 주소를 확인하세요.');
  console.log('대시보드 중계 접속 코드: ' + config.DASHBOARD_TOKEN);
  console.log('\nGoogle이 실행 권한 승인을 요구하면 프로젝트에서 authorizeAndTest를 선택해 실행·승인하세요. 코드 편집은 필요 없습니다.');
  const project = JSON.parse(await readFile(resolve(local, '.clasp.json'), 'utf8'));
  console.log('프로젝트: https://script.google.com/home/projects/' + project.scriptId + '/edit');
  console.log('로컬 .relay-local에는 키가 있으니 공유하지 마세요. 다음 코드 업데이트도 npm run setup:relay로 진행합니다.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('\n설치 중단: ' + error.message); console.error('기존 .relay-local을 삭제하지 말고 오류를 해결한 뒤 다시 실행하세요. Google 코드 편집은 필요 없습니다.'); process.exitCode = 1; });
}
